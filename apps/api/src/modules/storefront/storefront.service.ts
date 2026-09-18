import type {
  CreateStorefrontOrderRequest,
  CreateStorefrontPreorderRequest,
  PublicDay,
  DeliveryQuote,
  Menu,
  MenuProduct,
  StorefrontConfig,
  StorefrontOrder,
  StorefrontPreorder,
  WhatsappDraft,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import { DEFAULT_DELIVERY_LABELS, DEFAULT_PREORDER_LABELS, timeIn } from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { formatOrderMessage, waLinkProvider } from '../../integrations/whatsapp';
import * as ordersService from '../delivery-orders/orders.service';
import * as availabilityService from '../preorders/availability.service';
import * as preordersRepository from '../preorders/preorders.repository';
import * as preordersService from '../preorders/preorders.service';
import { availabilityForVariants } from '../recipes/recipes.service';
import * as settingsService from '../settings/settings.service';
import type { ResolvedTenant } from '../../types/express';
import * as repository from './storefront.repository';

/**
 * Vitrine pública (§6.1 do PLAN.md).
 *
 * Este módulo é a única superfície da API sem autenticação, e por isso ele
 * PROJETA em vez de repassar: cada resposta é montada campo a campo, nunca
 * devolvendo o objeto do painel. Um `select *` aqui vazaria custo e margem
 * para o cliente final.
 */

/* -------------------------------------------------------------------------- */
/* Configuração                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A loja está aberta agora?
 *
 * Calculado no servidor, no fuso da LOJA. O relógio do cliente não serve:
 * quem abre a vitrine viajando veria a padaria fechada no horário errado.
 */
const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Dia da semana (0 = domingo) no fuso da loja, não no do servidor. */
export function weekdayIn(now: Date, timeZone: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return WEEKDAY_CODES.indexOf(short);
}

export function isOpenNow(
  hours: Array<{ weekday: number; opensAt: string; closesAt: string }>,
  timeZone: string,
  now = new Date(),
): boolean {
  const weekday = weekdayIn(now, timeZone);
  const current = timeIn(now, timeZone);

  // Comparação de `HH:MM` como string funciona porque o formato é fixo e
  // zero-padded — "09:30" < "14:00" ordena certo sem converter para número.
  return hours.some(
    (hour) =>
      hour.weekday === weekday &&
      current >= hour.opensAt.slice(0, 5) &&
      current <= hour.closesAt.slice(0, 5),
  );
}

export async function getConfig(
  tx: Transaction,
  tenant: ResolvedTenant,
): Promise<StorefrontConfig> {
  const [settings, hours] = await Promise.all([
    settingsService.get(tx, tenant.id),
    repository.listStoreHours(tx),
  ]);

  const publicHours = hours.map((hour) => ({
    weekday: hour.weekday,
    opensAt: hour.opensAt.slice(0, 5),
    closesAt: hour.closesAt.slice(0, 5),
  }));

  return {
    name: tenant.name,
    slug: tenant.slug,
    about: settings.about,
    theme: settings.theme,
    address: Object.keys(settings.address).length > 0
      ? (settings.address as Record<string, string>)
      : null,
    contactPhone: settings.contactPhone,
    isOpenNow: isOpenNow(publicHours, tenant.timeZone),
    hours: publicHours,
    acceptsDelivery: settings.acceptsDelivery,
    acceptsPickup: settings.acceptsPickup,
    acceptsPreorder: settings.acceptsPreorder,
    acceptsOnlineCheckout: settings.acceptsOnlineCheckout,
    minOrderCents: settings.minOrderCents,
    acceptedPaymentMethods: settings.acceptedPaymentMethods,
    whatsappNumber: settings.whatsappNumber,
    whatsappMode: settings.whatsappMode,
  };
}

/* -------------------------------------------------------------------------- */
/* Cardápio                                                                    */
/* -------------------------------------------------------------------------- */

async function buildProducts(
  tx: Transaction,
  rows: repository.MenuRow[],
): Promise<Map<string, MenuProduct & { categoryId: string | null }>> {
  const variantIds = rows.map((row) => row.variantId);
  const availability = await availabilityForVariants(tx, variantIds);

  const byProduct = new Map<string, MenuProduct & { categoryId: string | null }>();

  for (const row of rows) {
    const units = availability.get(row.variantId)?.availableUnits ?? null;

    const variant = {
      id: row.variantId,
      name: row.variantName,
      priceCents: row.priceCents,
      compareAtPriceCents: row.compareAtPriceCents,
      // `Infinity` não sobrevive a JSON: vira `null`, que é o mesmo
      // significado do contrato ("sem limite conhecido").
      availableUnits: units === null || !Number.isFinite(units) ? null : units,
    };

    const existing = byProduct.get(row.productId);
    if (existing) {
      existing.variants.push(variant);
      continue;
    }

    byProduct.set(row.productId, {
      categoryId: row.categoryId,
      id: row.productId,
      slug: row.productSlug,
      name: row.productName,
      description: row.productDescription,
      imageUrl: row.productImageUrl,
      variants: [variant],
      soldOut: false,
    });
  }

  // Esgotado = TODAS as variações zeradas. Com uma disponível o produto
  // continua comprável, só com menos opções.
  for (const product of byProduct.values()) {
    product.soldOut = product.variants.every((variant) => variant.availableUnits === 0);
  }

  return byProduct;
}

export async function getMenu(
  tx: Transaction,
  availableFor: 'delivery' | 'preorder',
): Promise<Menu> {
  const rows = await repository.listMenu(tx, availableFor);
  const products = await buildProducts(tx, rows);

  const categoryOrder: string[] = [];
  const categoryMeta = new Map<string, { name: string; slug: string }>();

  for (const row of rows) {
    if (!row.categoryId || categoryMeta.has(row.categoryId)) continue;
    categoryMeta.set(row.categoryId, {
      name: row.categoryName ?? '',
      slug: row.categorySlug ?? '',
    });
    categoryOrder.push(row.categoryId);
  }

  const grouped = new Map<string, MenuProduct[]>();
  const uncategorized: MenuProduct[] = [];

  for (const product of products.values()) {
    const { categoryId, ...rest } = product;
    if (!categoryId) {
      uncategorized.push(rest);
      continue;
    }
    const bucket = grouped.get(categoryId);
    if (bucket) bucket.push(rest);
    else grouped.set(categoryId, [rest]);
  }

  return {
    categories: categoryOrder
      .map((id) => ({
        id,
        name: categoryMeta.get(id)!.name,
        slug: categoryMeta.get(id)!.slug,
        products: grouped.get(id) ?? [],
      }))
      // Categoria que ficou sem produto visível não aparece no cardápio.
      .filter((category) => category.products.length > 0),
    uncategorized,
  };
}

export async function getProduct(tx: Transaction, slug: string): Promise<MenuProduct> {
  const rows = await repository.findProductBySlug(tx, slug);
  if (rows.length === 0) throw notFound('Produto não encontrado.');

  const products = await buildProducts(tx, rows);
  const [product] = [...products.values()];
  if (!product) throw notFound('Produto não encontrado.');

  const { categoryId: _categoryId, ...rest } = product;
  return rest;
}

/* -------------------------------------------------------------------------- */
/* Entrega                                                                     */
/* -------------------------------------------------------------------------- */

export async function listZones(tx: Transaction) {
  return repository.listActiveZones(tx);
}

export async function quoteDelivery(
  tx: Transaction,
  tenantId: string,
  input: { neighborhood?: string | undefined; zip?: string | undefined },
): Promise<DeliveryQuote> {
  const settings = await settingsService.get(tx, tenantId);

  if (!settings.acceptsDelivery) {
    return {
      available: false,
      zoneName: null,
      feeCents: 0,
      minOrderCents: settings.minOrderCents,
      etaMinutes: null,
      message: 'Esta loja não faz entrega no momento. Você pode retirar no local.',
    };
  }

  const zone = input.neighborhood
    ? await repository.findZoneByNeighborhood(tx, input.neighborhood)
    : null;

  if (!zone) {
    return {
      available: false,
      zoneName: null,
      feeCents: 0,
      minOrderCents: settings.minOrderCents,
      etaMinutes: null,
      message: 'Ainda não entregamos nessa região. Confira os bairros atendidos.',
    };
  }

  return {
    available: true,
    zoneName: zone.name,
    feeCents: zone.feeCents,
    // O mínimo do bairro tem precedência sobre o da loja quando é maior:
    // bairro distante costuma exigir pedido maior para valer a corrida.
    minOrderCents: Math.max(zone.minOrderCents, settings.minOrderCents),
    etaMinutes: zone.etaMinutes,
    message: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                    */
/* -------------------------------------------------------------------------- */

function toPublicOrder(
  order: Awaited<ReturnType<typeof ordersService.get>>,
  whatsappUrl: string | null,
): StorefrontOrder {
  return {
    code: order.code,
    status: order.status,
    statusLabel: order.statusLabel,
    fulfillment: order.fulfillment,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      qty: item.qty,
      totalCents: item.totalCents,
      notes: item.notes,
    })),
    whatsappUrl,
  };
}

async function resolveFee(
  tx: Transaction,
  tenantId: string,
  input: CreateStorefrontOrderRequest,
): Promise<number> {
  if (input.fulfillment === 'pickup') return 0;

  // A taxa vem SEMPRE do servidor, nunca do corpo da requisição: aceitar o
  // frete que o cliente mandou seria aceitar o frete que ele escolheu.
  const quote = await quoteDelivery(tx, tenantId, {
    neighborhood: input.address?.neighborhood,
  });

  if (!quote.available) {
    throw unprocessable(quote.message ?? 'Não entregamos nessa região.');
  }

  return quote.feeCents;
}

export async function createOrder(
  tx: Transaction,
  tenant: ResolvedTenant,
  input: CreateStorefrontOrderRequest,
  idempotencyKey: string,
): Promise<StorefrontOrder> {
  const settings = await settingsService.get(tx, tenant.id);

  if (!settings.acceptsOnlineCheckout) {
    throw conflict('Esta loja recebe pedidos apenas pelo WhatsApp.');
  }
  if (input.fulfillment === 'delivery' && !settings.acceptsDelivery) {
    throw conflict('Esta loja não está entregando no momento.');
  }
  if (input.fulfillment === 'pickup' && !settings.acceptsPickup) {
    throw conflict('Esta loja não aceita retirada no local.');
  }

  const deliveryFeeCents = await resolveFee(tx, tenant.id, input);

  const order = await ordersService.create(
    tx,
    tenant.id,
    {
      customer: input.customer,
      fulfillment: input.fulfillment,
      items: input.items.map((item) => ({
        productVariantId: item.productVariantId,
        qty: item.qty,
        ...(item.notes ? { notes: item.notes } : {}),
      })),
      ...(input.address ? { address: input.address } : {}),
      deliveryFeeCents,
      discountCents: 0,
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.changeForCents ? { changeForCents: input.changeForCents } : {}),
      origin: 'storefront_checkout',
      ...(input.notes ? { notes: input.notes } : {}),
    },
    {
      idempotencyKey,
      // Pedido da vitrine nasce PENDENTE: quem confirma é o lojista. A reserva
      // segura o estoque e expira sozinha se ninguém confirmar (D14).
      keepPending: true,
    },
  );

  if (order.subtotalCents < settings.minOrderCents) {
    throw unprocessable(
      `O pedido mínimo desta loja é de R$ ${(settings.minOrderCents / 100).toFixed(2).replace('.', ',')}.`,
    );
  }

  return toPublicOrder(order, null);
}

/* -------------------------------------------------------------------------- */
/* WhatsApp (D7)                                                               */
/* -------------------------------------------------------------------------- */

export async function whatsappDraft(
  tx: Transaction,
  tenant: ResolvedTenant,
  input: CreateStorefrontOrderRequest,
  idempotencyKey: string,
): Promise<WhatsappDraft> {
  const settings = await settingsService.get(tx, tenant.id);

  if (!settings.whatsappNumber) {
    throw conflict('Esta loja não cadastrou um número de WhatsApp.');
  }

  /**
   * Os dois modos de D7, e a diferença é grande:
   *
   *   `persist`    o pedido é gravado antes de abrir o WhatsApp — entra no
   *                kanban, reserva estoque e conta no relatório. A mensagem
   *                leva o código.
   *   `link_only`  só a mensagem. Nada é gravado, então o pedido não existe
   *                para o sistema até o lojista lançá-lo à mão.
   */
  if (settings.whatsappMode === 'persist') {
    const deliveryFeeCents = await resolveFee(tx, tenant.id, input);

    const order = await ordersService.create(
      tx,
      tenant.id,
      {
        customer: input.customer,
        fulfillment: input.fulfillment,
        items: input.items.map((item) => ({
          productVariantId: item.productVariantId,
          qty: item.qty,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
        ...(input.address ? { address: input.address } : {}),
        deliveryFeeCents,
        discountCents: 0,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        origin: 'storefront_whatsapp',
        ...(input.notes ? { notes: input.notes } : {}),
      },
      { idempotencyKey, keepPending: true },
    );

    const message = formatOrderMessage({
      storeName: tenant.name,
      orderCode: order.code,
      customerName: input.customer.name,
      items: order.items.map((item) => ({
        qty: item.qty,
        productName: item.productName,
        variantName: item.variantName,
        totalCents: item.totalCents,
        notes: item.notes,
      })),
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      totalCents: order.totalCents,
      fulfillment: order.fulfillment,
      address: addressLine(input),
      notes: input.notes ?? null,
    });

    const whatsappUrl = waLinkProvider.buildLink({
      phone: settings.whatsappNumber,
      message,
    });

    return { whatsappUrl, message, order: toPublicOrder(order, whatsappUrl) };
  }

  // `link_only`: preço e nome vêm do cardápio, sem gravar nada.
  const menu = await getMenu(tx, 'delivery');
  const catalog = new Map(
    [...menu.categories.flatMap((category) => category.products), ...menu.uncategorized]
      .flatMap((product) =>
        product.variants.map(
          (variant) =>
            [
              variant.id,
              {
                productName: product.name,
                variantName: variant.name === 'Padrão' ? null : variant.name,
                priceCents: variant.priceCents,
              },
            ] as const,
        ),
      ),
  );

  const items = input.items.map((item) => {
    const found = catalog.get(item.productVariantId);
    if (!found) throw unprocessable('Há itens indisponíveis no seu pedido.');

    return {
      qty: item.qty,
      productName: found.productName,
      variantName: found.variantName,
      totalCents: found.priceCents * item.qty,
      notes: item.notes ?? null,
    };
  });

  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const deliveryFeeCents = await resolveFee(tx, tenant.id, input);

  const message = formatOrderMessage({
    storeName: tenant.name,
    customerName: input.customer.name,
    items,
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
    fulfillment: input.fulfillment,
    address: addressLine(input),
    notes: input.notes ?? null,
  });

  return {
    whatsappUrl: waLinkProvider.buildLink({ phone: settings.whatsappNumber, message }),
    message,
    order: null,
  };
}

function addressLine(input: CreateStorefrontOrderRequest): string | null {
  if (input.fulfillment === 'pickup' || !input.address) return null;

  const { street, number, complement, neighborhood, reference } = input.address;
  return [
    [street, number].filter(Boolean).join(', '),
    complement,
    neighborhood,
    reference ? `ref: ${reference}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

/* -------------------------------------------------------------------------- */
/* Encomendas (D10)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A agenda como o cliente vê.
 *
 * `slotsLeft` diz quanto ainda cabe; capacidade total e quantas encomendas a
 * loja já tem ficam de fora — é informação de gestão, não de compra.
 */
export async function getPublicAvailability(
  tx: Transaction,
  tenant: ResolvedTenant,
  from: string,
  to: string,
): Promise<PublicDay[]> {
  const days = await availabilityService.getRange(tx, tenant.id, from, to, tenant.timeZone);

  return days.map((day) => ({
    date: day.date,
    available: day.available,
    slotsLeft: day.slotsLeft,
    reason: day.reason,
  }));
}

export async function createPreorder(
  tx: Transaction,
  tenant: ResolvedTenant,
  input: CreateStorefrontPreorderRequest,
  idempotencyKey: string,
): Promise<StorefrontPreorder> {
  const settings = await settingsService.get(tx, tenant.id);

  if (!settings.acceptsPreorder) {
    throw conflict('Esta loja não está aceitando encomendas.');
  }
  if (!settings.acceptsOnlineCheckout) {
    throw conflict('Esta loja recebe encomendas apenas pelo WhatsApp.');
  }

  const deliveryFeeCents =
    input.fulfillment === 'delivery'
      ? await resolveFee(tx, tenant.id, {
          fulfillment: 'delivery',
          address: input.address,
        } as CreateStorefrontOrderRequest)
      : 0;

  const preorder = await preordersService.create(
    tx,
    tenant.id,
    {
      customer: input.customer,
      dueDate: input.dueDate,
      ...(input.dueTime ? { dueTime: input.dueTime } : {}),
      fulfillment: input.fulfillment,
      items: input.items.map((item) => ({
        productVariantId: item.productVariantId,
        qty: item.qty,
        ...(item.notes ? { notes: item.notes } : {}),
      })),
      ...(input.address ? { address: input.address } : {}),
      deliveryFeeCents,
      discountCents: 0,
      depositCents: 0,
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      origin: 'storefront_checkout',
      ...(input.notes ? { notes: input.notes } : {}),
    },
    { idempotencyKey, keepPending: true, timeZone: tenant.timeZone },
  );

  return {
    code: preorder.code,
    status: preorder.status,
    statusLabel: preorder.statusLabel,
    fulfillment: preorder.fulfillment,
    dueDate: preorder.dueDate,
    dueTime: preorder.dueTime,
    subtotalCents: preorder.subtotalCents,
    deliveryFeeCents: preorder.deliveryFeeCents,
    totalCents: preorder.totalCents,
    paymentMethod: preorder.paymentMethod,
    placedAt: preorder.placedAt,
    items: preorder.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      qty: item.qty,
      totalCents: item.totalCents,
      notes: item.notes,
    })),
    whatsappUrl: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Acompanhamento                                                              */
/* -------------------------------------------------------------------------- */

export async function trackOrder(
  tx: Transaction,
  code: number,
  phone: string,
): Promise<StorefrontOrder> {
  const order = await repository.findOrderForTracking(tx, code, phone);
  // Código errado e telefone errado dão a MESMA resposta: distinguir
  // transformaria a rota num verificador de pedidos por número.
  if (!order) throw notFound('Pedido não encontrado. Confira o código e o telefone.');

  const [items, labels] = await Promise.all([
    repository.listOrderItems(tx, order.id),
    settingsService.getStatusLabels(tx),
  ]);

  const label = labels.find(
    (item) => item.flow === 'delivery' && item.statusCode === order.status,
  );

  return {
    code: order.code,
    status: order.status,
    statusLabel: label?.label ?? DEFAULT_DELIVERY_LABELS[order.status],
    fulfillment: order.fulfillment,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt.toISOString(),
    items: items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      qty: item.qty,
      totalCents: item.totalCents,
      notes: item.notes,
    })),
    whatsappUrl: null,
  };
}

export async function trackPreorder(
  tx: Transaction,
  code: number,
  phone: string,
): Promise<StorefrontPreorder> {
  const preorder = await preordersRepository.findByCodeAndPhone(tx, code, phone);
  // Mesma resposta para código errado e telefone errado (ver trackOrder acima).
  if (!preorder) throw notFound('Encomenda não encontrada. Confira o código e o telefone.');

  const [items, labels] = await Promise.all([
    preordersRepository.listItems(tx, preorder.id),
    settingsService.getStatusLabels(tx),
  ]);

  const label = labels.find(
    (item) => item.flow === 'preorder' && item.statusCode === preorder.status,
  );

  return {
    code: preorder.code,
    status: preorder.status,
    statusLabel: label?.label ?? DEFAULT_PREORDER_LABELS[preorder.status],
    fulfillment: preorder.fulfillment,
    dueDate: preorder.dueDate,
    dueTime: preorder.dueTime?.slice(0, 5) ?? null,
    subtotalCents: preorder.subtotalCents,
    deliveryFeeCents: preorder.deliveryFeeCents,
    totalCents: preorder.totalCents,
    paymentMethod: preorder.paymentMethod,
    placedAt: preorder.placedAt.toISOString(),
    items: items.map((item) => ({
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      qty: item.qty,
      totalCents: item.totalCents,
      notes: item.notes,
    })),
    whatsappUrl: null,
  };
}
