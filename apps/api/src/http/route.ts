import type { Transaction } from '@cantina/db';
import { withPlatform, withTenant } from '@cantina/db';
import type { PlatformRole, UserRole } from '@cantina/contracts';
import type { Request, RequestHandler, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';

import { appDb, platformDb } from '../db';
import type { Logger } from '../shared/logger';
import { requireContext } from '../shared/request-context';
import { internal, unauthorized } from './errors/app-error';

/**
 * Rota como unidade de trabalho.
 *
 * O wrapper abre UMA transação com o contexto de tenant, executa o handler
 * dentro dela, e só então responde. Isso dá três garantias de uma vez:
 *
 *   - invariante 1: não existe caminho para tocar o banco sem `SET LOCAL`;
 *   - erro lançado no handler faz ROLLBACK antes de qualquer byte sair;
 *   - `tx` só existe dentro do handler — não dá para vazá-la para um
 *     serviço que rodaria fora do contexto.
 *
 * É por isso que `tx` é passada explicitamente e não via AsyncLocalStorage:
 * o tipo obriga quem escreve um repositório a recebê-la.
 */

export interface RouteContext<TBody, TQuery, TParams> {
  tx: Transaction;
  tenantId: string;
  user: { id: string; role: UserRole } | null;
  body: TBody;
  query: TQuery;
  params: TParams;
  requestId: string;
  logger: Logger;
  req: Request;
  res: Response;
}

/**
 * `ZodType<T, ZodTypeDef, unknown>` em vez de `ZodType<T>`.
 *
 * A forma curta faz `T` casar com o tipo de ENTRADA do schema, não com o de
 * saída — e aí um campo com `.default()` chega ao handler como opcional,
 * mesmo o `parse` já tendo preenchido. Fixar a entrada em `unknown` obriga
 * `T` a ser o tipo de saída, que é o que o handler realmente recebe.
 */
export interface InputSchemas<TBody, TQuery, TParams> {
  body?: ZodType<TBody, ZodTypeDef, unknown>;
  query?: ZodType<TQuery, ZodTypeDef, unknown>;
  params?: ZodType<TParams, ZodTypeDef, unknown>;
  /** Status de sucesso. `201` em criação, `204` quando não há corpo. */
  status?: number;
}

export interface RouteConfig<TBody, TQuery, TParams>
  extends InputSchemas<TBody, TQuery, TParams> {
  handler: (ctx: RouteContext<TBody, TQuery, TParams>) => Promise<unknown>;
}

// Recebe só os schemas, não a configuração inteira: assim os três wrappers a
// reaproveitam sem `as`, e um handler com contexto diferente não precisa
// fingir ser um handler de tenant para passar pela validação.
function parseInput<TBody, TQuery, TParams>(
  req: Request,
  config: InputSchemas<TBody, TQuery, TParams>,
): { body: TBody; query: TQuery; params: TParams } {
  // `parse` lança ZodError; o error handler o converte no envelope 422.
  return {
    body: (config.body ? config.body.parse(req.body) : (req.body as TBody)),
    query: (config.query ? config.query.parse(req.query) : (req.query as TQuery)),
    params: (config.params ? config.params.parse(req.params) : (req.params as TParams)),
  };
}

async function respond(
  res: Response,
  result: unknown,
  status: number | undefined,
): Promise<void> {
  if (res.headersSent) return;
  if (result === undefined || status === 204) {
    res.status(status ?? 204).end();
    return;
  }
  res.status(status ?? 200).json(result);
}

/** Rota de tenant: painel autenticado ou vitrine pública já resolvida por host. */
export function tenantRoute<TBody = unknown, TQuery = unknown, TParams = unknown>(
  config: RouteConfig<TBody, TQuery, TParams>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenant?.id ?? req.auth?.tenantId;
      if (!tenantId) {
        // Erro de composição de rota, não do cliente: faltou
        // `resolveTenantByHost` ou `requireAuth` antes deste handler.
        throw internal('Rota de tenant montada sem resolução de tenant.');
      }

      const input = parseInput(req, config);
      const context = requireContext();

      const result = await withTenant(appDb.db, tenantId, (tx) =>
        config.handler({
          tx,
          tenantId,
          user: req.auth ? { id: req.auth.userId, role: req.auth.role } : null,
          ...input,
          requestId: context.requestId,
          logger: context.logger,
          req,
          res,
        }),
      );

      await respond(res, result, config.status);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Rota de plataforma (D5): admin gerenciando assinantes.
 *
 * Usa a conexão com BYPASSRLS, que enxerga todas as empresas de uma vez — por
 * isso o contexto aqui NÃO tem `tenantId` nem `user`. A ausência é
 * deliberada: um serviço de plataforma que recebesse um `tenantId` acabaria
 * sendo reaproveitado por uma rota de painel, e a fronteira mais importante
 * do sistema viraria uma convenção.
 */
export interface PlatformRouteContext<TBody, TQuery, TParams> {
  tx: Transaction;
  /** Ausente apenas em `anonymous: true` — o login. */
  admin: { id: string; role: PlatformRole } | null;
  body: TBody;
  query: TQuery;
  params: TParams;
  requestId: string;
  logger: Logger;
  req: Request;
  res: Response;
}

export interface PlatformRouteConfig<TBody, TQuery, TParams>
  extends InputSchemas<TBody, TQuery, TParams> {
  /** Só o login. Toda outra rota exige sessão de plataforma. */
  anonymous?: boolean;
  handler: (ctx: PlatformRouteContext<TBody, TQuery, TParams>) => Promise<unknown>;
}

export function platformRoute<TBody = unknown, TQuery = unknown, TParams = unknown>(
  config: PlatformRouteConfig<TBody, TQuery, TParams>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      if (!config.anonymous && !req.platform) {
        throw unauthorized('Rota restrita à administração da plataforma.');
      }

      const input = parseInput(req, config);
      const context = requireContext();

      const result = await withPlatform(platformDb.db, (tx) =>
        config.handler({
          tx,
          admin: req.platform ? { id: req.platform.userId, role: req.platform.role } : null,
          ...input,
          requestId: context.requestId,
          logger: context.logger,
          req,
          res,
        }),
      );

      await respond(res, result, config.status);
    } catch (error) {
      next(error);
    }
  };
}

/** Rota sem banco: health, webhooks que só enfileiram, redirecionamentos. */
export function openRoute<TBody = unknown, TQuery = unknown, TParams = unknown>(
  config: InputSchemas<TBody, TQuery, TParams> & {
    handler: (
      ctx: Omit<RouteContext<TBody, TQuery, TParams>, 'tx' | 'tenantId' | 'user'>,
    ) => Promise<unknown>;
  },
): RequestHandler {
  return async (req, res, next) => {
    try {
      const input = parseInput(req, config);
      const context = requireContext();

      const result = await config.handler({
        ...input,
        requestId: context.requestId,
        logger: context.logger,
        req,
        res,
      });

      await respond(res, result, config.status);
    } catch (error) {
      next(error);
    }
  };
}
