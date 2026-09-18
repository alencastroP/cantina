import type {
  AddressSnapshot,
  Board,
  BoardColumn,
  CreateDeliveryOrderRequest,
  DeliveryOrder,
  DeliveryOrderDetail,
  ListDeliveryOrdersQuery,
  OrderItem,
  Page,
  RegisterPaymentRequest,
  UpdateDeliveryOrderRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  allowedDeliveryTransitions,
  DEFAULT_DELIVERY_LABELS,
  DELIVERY_BOARD_COLUMNS,
  roundCents,
  type DeliveryStatus,
} from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as customersService from '../customers/customers.service';
import { reserve } from '../inventory/stock.service';
import { computeUnitCost, stockLinesForSale } from '../recipes/recipes.service';
import * as settingsService from '../settings/settings.service';
import * as repository from './orders.repository';
import { changeStatus } from './status.service';

/**
 * Pedidos de delivery (§6.7 do PLAN.md).
 *
 * É aqui que o motor de estoque, o custo congelado e as estatísticas de
 * cliente se encontram. Nada disso é recalculado depois: o item guarda preço
 * e custo do momento da venda (invariante 4), e é o livro de estoque que
 * lembra o que foi reservado.
 */

const BOARD_PAGE_SIZE = 50;

/* -------------------------------------------------------------------------- */
/* Apresentação                                                                */
/* -------------------------------------------------------------------------- */

type StatusLabels = Map<string, { label: string; color: string | null }>;

async function loadStatusLabels(tx: Transaction): Promise<StatusLabels> {
  const labels = await settingsService.getStatusLabels(tx);
  return new Map(
    labels
      .filter((label) => label.flow === 'delivery')
      .map((label) => [label.statusCode, { label: label.label, color: label.color }]),
  );
}

function toOrder(row: repository.OrderRow, labels: StatusLabels): DeliveryOrder {
  const label = labels.get(row.status);

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    statusLabel: label?.label ?? DEFAULT_DELIVERY_LABELS[row.status],
    statusColor: label?.color ?? null,
    origin: row.origin,
    fulfillment: row.fulfillment,
    customerId: row.customerId,
    customerName: row.customerNameSnapshot,
    customerPhone: row.customerPhoneSnapshot,
    salesChannelId: row.salesChannelId,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    costCents: row.costCents,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    changeForCents: row.changeForCents,
    addressSnapshot: row.addressSnapshot ?? null,
    notes: row.notes,
    placedAt: row.placedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function toItem(row: repository.OrderItemRow): OrderItem {
  return {
    id: row.id,
    productVariantId: row.productVariantId,
    productName: row.productNameSnapshot,
    variantName: row.variantNameSnapshot,
    qty: row.qty,
    unitPriceCents: row.unitPriceCents,
    unitCostCents: row.unitCostCents,
    totalCents: row.totalCents,
    notes: row.notes,
  };
}

async function assemble(
  tx: Transaction,
  row: repository.OrderRow,
  labels?: StatusLabels,
): Promise<DeliveryOrderDetail> {
  const [items, resolvedLabels] = await Promise.all([
    repository.listItems(tx, row.id),
    labels ? Promise.resolve(labels) : loadStatusLabels(tx),
  ]);

  return {
    ...toOrder(row, resolvedLabels),
    items: items.map(toItem),
    allowedTransitions: [...allowedDeliveryTransitions(row.status, row.fulfillment)],
  };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export async function get(tx: Transaction, orderId: string): Promise<DeliveryOrderDetail> {
  const order = await repository.findOrderById(tx, orderId);
  if (!order) throw notFound('Pedido não encontrado.');
  return assemble(tx, order);
}

export async function list(
  tx: Transaction,
  query: ListDeliveryOrdersQuery,
): Promise<Page<DeliveryOrder>> {
  const rows = await repository.listOrders(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    status: query.status,
    customerId: query.customerId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    q: query.q,
  });

  const hasMore = rows.length > query.limit;
  const labels = await loadStatusLabels(tx);
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => toOrder(row, labels));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/**
 * Board do kanban.
 *
 * Colunas terminais (`completed`, `canceled`) ficam de fora: o board é a
 * fila de trabalho do dia, não o histórico. Dentro de cada coluna a ordem é
 * a de chegada — quem pediu primeiro sai primeiro.
 */
export async function board(tx: Transaction): Promise<Board> {
  const [labels, counts] = await Promise.all([
    loadStatusLabels(tx),
    repository.countByStatus(tx),
  ]);

  const columns: BoardColumn[] = [];

  for (const [position, status] of DELIVERY_BOARD_COLUMNS.entries()) {
    const rows = await repository.listByStatus(tx, status, BOARD_PAGE_SIZE);
    const label = labels.get(status);

    columns.push({
      status,
      label: label?.label ?? DEFAULT_DELIVERY_LABELS[status],
      color: label?.color ?? null,
      position,
      count: counts.get(status) ?? 0,
      orders: rows.map((row) => toOrder(row, labels)),
    });
  }

  return { columns };
}

/* -------------------------------------------------------------------------- */
/* Criação                                                                     */
/* -------------------------------------------------------------------------- */

function addressFromRow(row: {
  street: string;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  reference: string | null;
}): AddressSnapshot {
  return {
    ...(row.street ? { street: row.street } : {}),
    ...(row.number ? { number: row.number } : {}),
    ...(row.complement ? { complement: row.complement } : {}),
    ...(row.neighborhood ? { neighborhood: row.neighborhood } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.state ? { state: row.state } : {}),
    ...(row.zip ? { zip: row.zip } : {}),
    ...(row.reference ? { reference: row.reference } : {}),
  };
}

export interface CreateOptions {
  idempotencyKey?: string | null;
  /** Vem da vitrine (módulo 8). Pedido manual do painel já nasce confirmado. */
  keepPending?: boolean;
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateDeliveryOrderRequest,
  options: CreateOptions = {},
): Promise<DeliveryOrderDetail> {
  // Invariante 6: a mesma chave devolve o mesmo pedido, não um segundo.
  if (options.idempotencyKey) {
    const existing = await repository.findOrderByIdempotencyKey(tx, options.idempotencyKey);
    if (existing) return assemble(tx, existing);
  }

  /* --- Cliente --- */
  const customer =
    'customerId' in input.customer
      ? await repository.findCustomerForOrder(tx, input.customer.customerId)
      : await customersService.findOrCreate(tx, tenantId, input.customer);

  if (!customer) throw unprocessable('Cliente não encontrado.');

  /* --- Endereço --- */
  let addressSnapshot: AddressSnapshot | null = null;
  if (input.fulfillment === 'delivery') {
    if (input.addressId) {
      const address = await repository.findAddressForOrder(tx, input.addressId);
      if (!address || address.customerId !== customer.id) {
        throw unprocessable('Endereço não encontrado para este cliente.');
      }
      addressSnapshot = addressFromRow(address);
    } else if (input.address?.street) {
      addressSnapshot = addressFromRow({
        street: input.address.street,
        number: input.address.number ?? null,
        complement: input.address.complement ?? null,
        neighborhood: input.address.neighborhood ?? null,
        city: input.address.city ?? null,
        state: input.address.state ?? null,
        zip: input.address.zip ?? null,
        reference: input.address.reference ?? null,
      });
    } else {
      throw unprocessable('Informe o endereço de entrega.');
    }
  }

  /* --- Itens: preço e custo congelados aqui (invariante 4, D11) --- */
  const variantIds = [...new Set(input.items.map((item) => item.productVariantId))];
  const variants = await repository.findVariantsForOrder(tx, variantIds);

  const missing = variantIds.filter((id) => !variants.has(id));
  if (missing.length > 0) {
    throw unprocessable('Produto não encontrado.', { productVariantIds: missing });
  }

  const inactive = variantIds.filter((id) => {
    const variant = variants.get(id)!;
    return !variant.active || !variant.productActive;
  });
  if (inactive.length > 0) {
    throw conflict('Há produtos inativos no pedido.', { productVariantIds: inactive });
  }

  const notForDelivery = variantIds.filter(
    (id) => variants.get(id)!.availableFor === 'preorder',
  );
  if (notForDelivery.length > 0) {
    throw conflict('Há produtos que só são vendidos por encomenda.', {
      productVariantIds: notForDelivery,
    });
  }

  // Uma consulta de custo por variação distinta, não por item do pedido.
  const costs = new Map<string, number>();
  for (const variantId of variantIds) {
    const cost = await computeUnitCost(tx, variantId);
    costs.set(variantId, cost.unitCostCents);
  }

  const items = input.items.map((item) => {
    const variant = variants.get(item.productVariantId)!;
    const unitPriceCents = item.unitPriceCents ?? variant.priceCents;
    const unitCostCents = costs.get(item.productVariantId) ?? 0;

    return {
      productVariantId: item.productVariantId,
      productNameSnapshot: variant.productName,
      variantNameSnapshot: variant.variantName,
      qty: item.qty,
      unitPriceCents,
      unitCostCents,
      totalCents: roundCents(unitPriceCents * item.qty),
      notes: item.notes ?? null,
    };
  });

  const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0);
  const costCents = items.reduce(
    (total, item) => total + roundCents(item.unitCostCents * item.qty),
    0,
  );

  if (input.discountCents > subtotalCents) {
    throw unprocessable('O desconto é maior que o valor dos itens.');
  }

  const totalCents = subtotalCents - input.discountCents + input.deliveryFeeCents;

  /* --- Persistência --- */
  const settings = await settingsService.get(tx, tenantId);
  const code = await repository.nextCode(tx, tenantId, 'delivery_order');

  const keepPending = options.keepPending ?? false;

  let order: repository.OrderRow;
  try {
    order = await repository.insertOrder(tx, {
      tenantId,
      code,
      customerId: customer.id,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      status: 'pending',
      origin: input.origin,
      fulfillment: input.fulfillment,
      salesChannelId: input.salesChannelId ?? null,
      subtotalCents,
      discountCents: input.discountCents,
      deliveryFeeCents: input.deliveryFeeCents,
      totalCents,
      costCents,
      paymentMethod: input.paymentMethod ?? null,
      changeForCents: input.changeForCents ?? null,
      addressSnapshot,
      notes: input.notes ?? null,
      idempotencyKey: options.idempotencyKey ?? null,
      // Só pedido pendente expira: a reserva de quem nunca confirmou não pode
      // segurar estoque para sempre (D14).
      expiresAt: keepPending
        ? new Date(Date.now() + settings.reservationTtlMinutes * 60_000)
        : null,
    });
  } catch (error) {
    if (isUniqueViolation(error, 'delivery_orders_idempotency_uq')) {
      const existing = await repository.findOrderByIdempotencyKey(tx, options.idempotencyKey!);
      if (existing) return assemble(tx, existing);
    }
    throw error;
  }

  await repository.insertItems(
    tx,
    items.map((item) => ({ ...item, tenantId, orderId: order.id })),
  );

  /**
   * Reserva de estoque (D14).
   *
   * A explosão vem do módulo 4: produto `tracked` reserva a própria variação,
   * `on_demand` reserva os INSUMOS da receita. Reservar a variação de um
   * produto sob demanda não seguraria nada, e dois clientes conseguiriam
   * pedir o último bolo que a farinha permite.
   */
  const lines = await stockLinesForSale(
    tx,
    input.items.map((item) => ({
      productVariantId: item.productVariantId,
      qty: item.qty,
    })),
  );

  if (lines.length > 0) {
    await reserve(tx, tenantId, lines, { source: 'delivery_order', sourceId: order.id });
  }

  await recordAudit(tx, {
    tenantId,
    action: 'delivery_order.created',
    entityType: 'delivery_order',
    entityId: order.id,
    after: { code, totalCents, costCents, items: items.length, origin: input.origin },
  });

  /**
   * Pedido lançado no painel já nasce confirmado: o lojista está registrando
   * algo que ele já aceitou. A confirmação passa pela MESMA porta de
   * transição, então a reserva vira saída pelo caminho normal — não há um
   * segundo jeito de dar baixa no estoque.
   */
  if (!keepPending) {
    const confirmed = await changeStatus(tx, tenantId, order.id, 'confirmed');
    return assemble(tx, confirmed);
  }

  if (customer.id) await customersService.refreshStats(tx, customer.id);

  return assemble(tx, order);
}

/* -------------------------------------------------------------------------- */
/* Edição, cancelamento e pagamento                                            */
/* -------------------------------------------------------------------------- */

export async function update(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  patch: UpdateDeliveryOrderRequest,
): Promise<DeliveryOrderDetail> {
  const before = await repository.findOrderById(tx, orderId);
  if (!before) throw notFound('Pedido não encontrado.');

  if (before.status === 'completed' || before.status === 'canceled') {
    // Pedido fechado é histórico: mexer nos valores depois reescreveria
    // faturamento já contabilizado.
    throw conflict('Pedido concluído ou cancelado não pode ser alterado.');
  }

  const values: Partial<repository.OrderRow> = {};
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.salesChannelId !== undefined) values.salesChannelId = patch.salesChannelId;
  if (patch.address) {
    values.addressSnapshot = addressFromRow({
      street: patch.address.street ?? before.addressSnapshot?.street ?? '',
      number: patch.address.number ?? null,
      complement: patch.address.complement ?? null,
      neighborhood: patch.address.neighborhood ?? null,
      city: patch.address.city ?? null,
      state: patch.address.state ?? null,
      zip: patch.address.zip ?? null,
      reference: patch.address.reference ?? null,
    });
  }

  // Mudar taxa ou desconto refaz o total; o subtotal e o custo vêm dos itens
  // e não se mexem por aqui.
  const discountCents = patch.discountCents ?? before.discountCents;
  const deliveryFeeCents = patch.deliveryFeeCents ?? before.deliveryFeeCents;

  if (discountCents > before.subtotalCents) {
    throw unprocessable('O desconto é maior que o valor dos itens.');
  }

  if (patch.discountCents !== undefined || patch.deliveryFeeCents !== undefined) {
    values.discountCents = discountCents;
    values.deliveryFeeCents = deliveryFeeCents;
    values.totalCents = before.subtotalCents - discountCents + deliveryFeeCents;
  }

  const updated = await repository.updateOrder(tx, orderId, values);
  if (!updated) throw notFound('Pedido não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'delivery_order.updated',
    entityType: 'delivery_order',
    entityId: orderId,
    before: {
      totalCents: before.totalCents,
      discountCents: before.discountCents,
      deliveryFeeCents: before.deliveryFeeCents,
    },
    after: {
      totalCents: updated.totalCents,
      discountCents: updated.discountCents,
      deliveryFeeCents: updated.deliveryFeeCents,
    },
  });

  if (updated.customerId) await customersService.refreshStats(tx, updated.customerId);

  return assemble(tx, updated);
}

export async function transition(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  to: DeliveryStatus,
  actorId?: string,
): Promise<DeliveryOrderDetail> {
  const updated = await changeStatus(tx, tenantId, orderId, to, { actorId: actorId ?? null });
  return assemble(tx, updated);
}

export async function cancel(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  reason: string,
  actorId?: string,
): Promise<DeliveryOrderDetail> {
  const updated = await changeStatus(tx, tenantId, orderId, 'canceled', {
    reason,
    actorId: actorId ?? null,
  });
  return assemble(tx, updated);
}

export async function registerPayment(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  input: RegisterPaymentRequest,
): Promise<DeliveryOrderDetail> {
  const order = await repository.findOrderById(tx, orderId);
  if (!order) throw notFound('Pedido não encontrado.');

  const updated = await repository.updateOrder(tx, orderId, {
    paymentMethod: input.method,
    paymentStatus: input.status,
    paidAt: input.status === 'paid' ? new Date() : null,
    changeForCents: input.changeForCents ?? order.changeForCents,
  });
  if (!updated) throw notFound('Pedido não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'delivery_order.payment_registered',
    entityType: 'delivery_order',
    entityId: orderId,
    before: { paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod },
    after: { paymentStatus: updated.paymentStatus, paymentMethod: updated.paymentMethod },
  });

  return assemble(tx, updated);
}
