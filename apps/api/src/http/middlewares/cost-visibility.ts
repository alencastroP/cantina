import type { UserRole } from '@cantina/contracts';
import type { RequestHandler } from 'express';

/**
 * Custo e margem só saem da API para quem decide preço.
 *
 * As rotas de ficha técnica, simulador e relatórios já exigem papel. Mas o
 * custo também viaja DENTRO de respostas abertas ao balcão: o custo
 * congelado no pedido (D11), o custo médio do insumo no estoque. Quem opera
 * a vitrine precisa do total do pedido e do saldo do insumo — não de quanto
 * a loja ganha em cada um.
 *
 * Cortar na resposta, e não em cada serviço, é pelo mesmo motivo do RLS: um
 * serviço novo que devolva `costCents` para o atendente não depende de alguém
 * lembrar de filtrar. É rede de segurança, não a única trava — e por isso
 * vale para todo módulo do painel, montado num lugar só.
 */

/** Espelha quem lê custo nas rotas que o exigem: gestão e financeiro. */
export const COST_VIEWER_ROLES: readonly UserRole[] = ['owner', 'manager', 'finance'];

const SENSITIVE_KEYS = new Set([
  'costCents',
  'unitCostCents',
  'batchCostCents',
  'totalCostCents',
  'avgUnitCost',
  'avgUnitCostAfter',
  'unitCost',
  'marginCents',
  'marginPercent',
  'markupPercent',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/** Remove as chaves de custo em qualquer profundidade. Não muta a entrada. */
export function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  // `Date` e afins seguem intactos: `Object.entries` de um Date é vazio, e
  // tratá-lo como objeto o transformaria em `{}`.
  if (!isPlainObject(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    output[key] = stripSensitive(item);
  }
  return output;
}

export function canSeeCosts(role: UserRole | undefined): boolean {
  return role !== undefined && COST_VIEWER_ROLES.includes(role);
}

export const hideCostsFromOperators: RequestHandler = (req, res, next) => {
  if (!req.auth || canSeeCosts(req.auth.role)) {
    next();
    return;
  }

  const send = res.json.bind(res);
  res.json = ((body?: unknown) => send(stripSensitive(body))) as typeof res.json;
  next();
};
