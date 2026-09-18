import type { RequestHandler } from 'express';

import { findTenantByHost } from '../../modules/tenants/tenant-resolver';
import { requireContext } from '../../shared/request-context';
import { AppError, forbidden, notFound } from '../errors/app-error';

/**
 * Resolve o tenant da VITRINE a partir do host (D2).
 *
 * A vitrine é renderizada no servidor pelo Next (D16), que repassa o host
 * original em `X-Tenant-Host`. Sem esse header, o `Host` da requisição vale —
 * é o caminho quando alguém chama a API diretamente.
 *
 * Invariante 2: o tenant nunca vem do corpo nem de query string.
 */
export const resolveTenantByHost: RequestHandler = async (req, _res, next) => {
  try {
    const host = req.header('x-tenant-host') ?? req.header('host');
    const tenant = await findTenantByHost(host);

    if (!tenant) {
      throw new AppError(404, 'tenant_not_found', 'Esta loja não existe ou saiu do ar.');
    }

    if (tenant.status === 'suspended' || tenant.status === 'canceled') {
      // A vitrine sai do ar quando a assinatura para (§4.1 do PLAN.md).
      throw new AppError(503, 'tenant_unavailable', 'Esta loja está temporariamente indisponível.');
    }

    req.tenant = tenant;
    requireContext().tenantId = tenant.id;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Bloqueia escrita em tenant inadimplente.
 *
 * `past_due` mantém o painel em somente-leitura: o lojista continua vendo o
 * histórico e os pedidos do dia, mas não cria nada novo até regularizar.
 * Leitura continua liberada de propósito — tirar o acesso aos próprios dados
 * por atraso de pagamento é hostil, além de dificultar o pagamento.
 */
export const requireActiveTenant: RequestHandler = (req, _res, next) => {
  const status = req.tenant?.status;

  if (status === 'past_due') {
    next(
      forbidden(
        'Assinatura em atraso: o painel está em somente-leitura até a regularização.',
      ),
    );
    return;
  }

  if (status === 'suspended' || status === 'canceled') {
    next(notFound('Assinatura inativa.'));
    return;
  }

  next();
};
