import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.routes';
import {
  billingWebhookRouter,
  subscriptionRouter,
} from '../modules/billing/billing.routes';
import { calendarRouter } from '../modules/calendar/calendar.routes';
import {
  categoriesRouter,
  productImagesRouter,
  productsRouter,
  variantsRouter,
} from '../modules/catalog/catalog.routes';
import { customersRouter } from '../modules/customers/customers.routes';
import { financeRouter } from '../modules/finance/finance.routes';
import { deliveryOrdersRouter } from '../modules/delivery-orders/orders.routes';
import { healthRouter } from '../modules/health/health.routes';
import {
  purchasesRouter,
  stockRouter,
  suppliersRouter,
  suppliesRouter,
} from '../modules/inventory/inventory.routes';
import {
  pricingRouter,
  productCostingRouter,
  productionRouter,
  salesChannelsRouter,
  variantRecipesRouter,
} from '../modules/recipes/recipes.routes';
import { availabilityRouter, preordersRouter } from '../modules/preorders/preorders.routes';
import {
  platformAdminRouter,
  platformAuthRouter,
} from '../modules/platform/platform.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { signupRouter } from '../modules/signup/signup.routes';
import { storefrontPublicRouter } from '../modules/storefront/storefront.routes';
import { invitesPublicRouter, usersRouter } from '../modules/users/users.routes';
import { requireAuth } from './middlewares/auth';
import { hideCostsFromOperators } from './middlewares/cost-visibility';
import { requirePlatformAuth } from './middlewares/platform-auth';
import { storefrontLimiter } from './middlewares/rate-limit';
import { resolveTenantByHost } from './middlewares/tenant';

/**
 * Composição da API (§6 do PLAN.md).
 *
 * Três famílias de rota, com pré-requisitos diferentes — e é o mount que
 * garante que `tenantRoute` sempre encontre um tenant já resolvido:
 *
 *   /storefront   público. Tenant vem do HOST.
 *   (painel)      autenticado. Tenant vem do TOKEN.
 *   /platform     admin da plataforma (D5). Conexão com BYPASSRLS.
 *
 * Os middlewares do painel são aplicados NO MOUNT de cada módulo, nunca com
 * um `use` na raiz. A diferença importa: um `use(requireAuth)` na raiz faria
 * toda rota inexistente responder 401 em vez de 404, e sombrearia qualquer
 * rota pública registrada depois dele.
 */

export const apiRouter: Router = Router();

/* --- Infra ---------------------------------------------------------------- */
apiRouter.use(healthRouter);

/* --- Auth e aceite de convite --------------------------------------------- */

// Sem `requireAuth` no mount: login e refresh são o que acontece ANTES de
// existir sessão. `/auth/me` aplica o middleware por rota.
apiRouter.use('/auth', authRouter);

// Aceite de convite também é público — quem chega pelo link do e-mail ainda
// não tem senha para fazer login.
apiRouter.use('/invites', invitesPublicRouter);

// Cadastro público do teste grátis (módulo 11) — anônimo, sem tenant no
// contexto. Ver SIGNUP-TESTE-GRATIS.md.
apiRouter.use('/signup', signupRouter);

/* --- Vitrine pública (módulo 8) ------------------------------------------- */
export const storefrontRouter: Router = Router();
storefrontRouter.use(storefrontLimiter, resolveTenantByHost);
apiRouter.use('/storefront', storefrontRouter);

storefrontRouter.use(storefrontPublicRouter); //                módulo 8 ✅

// A agenda e o checkout de encomenda entram com o módulo 7, que é o dono das
// tabelas de disponibilidade.
// storefrontRouter.use(storefrontAvailabilityRouter);

/* --- Painel do lojista (módulos 1-7, 9, 10) ------------------------------- */

/**
 * Registra um módulo do painel.
 *
 * `requireAuth` entra aqui, num lugar só — nenhum módulo precisa lembrar de
 * aplicá-lo. O que cada módulo aplica por conta própria é
 * `requireActiveTenant` nas rotas de ESCRITA e `requireRole` onde o papel
 * importa, porque essas duas decisões são por rota, não por módulo.
 *
 * `hideCostsFromOperators` também entra aqui: custo e margem viajam dentro
 * de respostas abertas ao balcão (pedido, estoque), e cortá-los num lugar só
 * é o que impede um módulo novo de esquecer.
 */
export function mountPanelModule(path: string, router: Router): void {
  apiRouter.use(path, requireAuth, hideCostsFromOperators, router);
}

mountPanelModule('/users', usersRouter); //                    módulo 1 ✅
mountPanelModule('/settings', settingsRouter); //              módulo 1 ✅

mountPanelModule('/categories', categoriesRouter); //          módulo 2 ✅
mountPanelModule('/products', productsRouter); //              módulo 2 ✅
// Ficha técnica do produto inteiro. Depois do catálogo, pelo mesmo motivo
// do segundo router de `/variants`: `/:id/costing` não casa com nada lá.
mountPanelModule('/products', productCostingRouter); //        módulo 4 ✅
mountPanelModule('/variants', variantsRouter); //              módulo 2 ✅
mountPanelModule('/product-images', productImagesRouter); //   módulo 2 ✅

mountPanelModule('/stock', stockRouter); //                    módulo 3 ✅
mountPanelModule('/supplies', suppliesRouter); //              módulo 3 ✅
mountPanelModule('/suppliers', suppliersRouter); //            módulo 3 ✅
mountPanelModule('/supply-purchases', purchasesRouter); //     módulo 3 ✅
// Ficha técnica e custo penduram na variação, como o preço (P13). Segundo
// router sobre `/variants`: caminhos distintos dos do módulo 2, sem sombrear.
mountPanelModule('/variants', variantRecipesRouter); //        módulo 4 ✅
mountPanelModule('/sales-channels', salesChannelsRouter); //   módulo 4 ✅
mountPanelModule('/pricing', pricingRouter); //                módulo 4 ✅
// Produção vive sob `/stock` para quem usa; o código fica no módulo 4 porque
// explodir a receita exige `recipe_items`, que tem um dono só.
mountPanelModule('/stock', productionRouter); //               módulo 4 ✅

mountPanelModule('/customers', customersRouter); //            módulo 5 ✅
mountPanelModule('/delivery-orders', deliveryOrdersRouter); //  módulo 6 ✅
mountPanelModule('/preorders', preordersRouter); //            módulo 7 ✅
mountPanelModule('/availability', availabilityRouter); //      módulo 7 ✅
mountPanelModule('/calendar', calendarRouter); //              calendário da loja ✅
mountPanelModule('/finance', financeRouter); //                módulo 9 ✅
mountPanelModule('/reports', reportsRouter); //                módulo 10 ✅
mountPanelModule('/subscription', subscriptionRouter); //      módulo 11 ✅
// mountPanelModule('/notifications', notificationsRouter);  // módulo 14

/* --- Administração da plataforma (módulo 11) ------------------------------ */

/**
 * Sessão SEPARADA da do painel (D5).
 *
 * O login vem antes do middleware, pela mesma razão de sempre: é o que
 * acontece antes de existir sessão. O resto exige `requirePlatformAuth`, que
 * só aceita token de plataforma — o do painel não passa, porque as claims
 * dos dois são incompatíveis por construção.
 */
apiRouter.use('/platform/auth', platformAuthRouter); //        módulo 11 ✅
apiRouter.use('/platform', requirePlatformAuth, platformAdminRouter); // módulo 11 ✅

/* --- Webhooks (módulo 11) -------------------------------------------------- */

// Sem autenticação de sessão: o gateway se identifica por um segredo no
// header, verificado dentro do handler antes de qualquer parsing.
apiRouter.use('/webhooks', billingWebhookRouter); //           módulo 11 ✅
