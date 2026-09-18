import type {
  Calendar,
  CreatePreorderRequest,
  ListPreordersQuery,
  Page,
  Preorder,
  PreorderBoard,
  PreorderDetail,
  RegisterDepositRequest,
  UpdatePreorderRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  addDays,
  allowedPreorderTransitions,
  DEFAULT_PREORDER_LABELS,
  PREORDER_BOARD_COLUMNS,
  roundCents,
  type PreorderStatus,
} from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as customersService from '../customers/customers.service';
import * as ordersRepository from '../delivery-orders/orders.repository';
import { reserve } from '../inventory/stock.service';
import { computeUnitCost, stockLinesForSale } from '../recipes/recipes.service';
import * as settingsService from '../settings/settings.service';
import * as availabilityService from './availability.service';
import * as repository from './preorders.repository';
import { changeStatus } from './status.service';

/**
 * Encomendas (§6.8 do PLAN.md).
 *
 * Reaproveita do delivery tudo que é igual — snapshot de preço e custo,
 * reserva de estoque, agregados do cliente — e acrescenta o que é próprio:
 * data combinada, vaga na agenda e sinal.
 */

const BOARD_PAGE_SIZE = 60;

type StatusLabels = Map<string, { label: string; color: string | null }>;

async function loadStatusLabels(tx: Transaction): Promise<StatusLabels> {
  const labels = await settingsService.getStatusLabels(tx);
  return new Map(
    labels
      .filter((label) => label.flow === 'preorder')
      .map((label) => [label.statusCode, { label: label.label, color: label.color }]),
  );
}

function toPreorder(row: repository.PreorderRow, labels: StatusLabels): Preorder {
  const label = labels.get(row.status);

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    statusLabel: label?.label ?? DEFAULT_PREORDER_LABELS[row.status],
    statusColor: label?.color ?? null,
    origin: row.origin,
    fulfillment: row.fulfillment,
    customerId: row.customerId,
    customerName: row.customerNameSnapshot,
    customerPhone: row.customerPhoneSnapshot,
    dueDate: row.dueDate,
    dueTime: row.dueTime?.slice(0, 5) ?? null,
    subtotalCents: row.subtotalCents,
    discountCents: row.discountCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    costCents: row.costCents,
    depositCents: row.depositCents,
    depositPaidAt: row.depositPaidAt?.toISOString() ?? null,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    addressSnapshot: row.addressSnapshot ?? null,
    notes: row.notes,
    placedAt: row.placedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

async function assemble(
  tx: Transaction,
  row: repository.PreorderRow,
  labels?: StatusLabels,
): Promise<PreorderDetail> {
  const [items, resolved] = await Promise.all([
    repository.listItems(tx, row.id),
    labels ? Promise.resolve(labels) : loadStatusLabels(tx),
  ]);

  return {
    ...toPreorder(row, resolved),
    items: items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      qty: item.qty,
      unitPriceCents: item.unitPriceCents,
      unitCostCents: item.unitCostCents,
      totalCents: item.totalCents,
      notes: item.notes,
    })),
    allowedTransitions: [...allowedPreorderTransitions(row.status)],
  };
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export async function get(tx: Transaction, id: string): Promise<PreorderDetail> {
  const row = await repository.findById(tx, id);
  if (!row) throw notFound('Encomenda não encontrada.');
  return assemble(tx, row);
}

export async function list(
  tx: Transaction,
  query: ListPreordersQuery,
): Promise<Page<Preorder>> {
  const rows = await repository.list(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    status: query.status,
    customerId: query.customerId,
    dueFrom: query.dueFrom,
    dueTo: query.dueTo,
    q: query.q,
  });

  const hasMore = rows.length > query.limit;
  const labels = await loadStatusLabels(tx);
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) =>
    toPreorder(row, labels),
  );

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function board(tx: Transaction): Promise<PreorderBoard> {
  const [labels, counts] = await Promise.all([
    loadStatusLabels(tx),
    repository.countByStatus(tx),
  ]);

  const columns = [];

  for (const [position, status] of PREORDER_BOARD_COLUMNS.entries()) {
    const rows = await repository.listByStatus(tx, status, BOARD_PAGE_SIZE);
    const label = labels.get(status);

    columns.push({
      status,
      label: label?.label ?? DEFAULT_PREORDER_LABELS[status],
      color: label?.color ?? null,
      position,
      count: counts.get(status) ?? 0,
      orders: rows.map((row) => toPreorder(row, labels)),
    });
  }

  return { columns };
}

/**
 * Calendário do mês.
 *
 * Junta as encomendas com os contadores da agenda: a célula do dia precisa
 * mostrar tanto o que foi vendido quanto quanto ainda cabe.
 */
export async function calendar(tx: Transaction, month: string): Promise<Calendar> {
  const from = `${month}-01`;
  // Primeiro dia do mês seguinte, menos um: evita a tabela de "quantos dias
  // tem cada mês" e acerta fevereiro bissexto de graça.
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const nextMonth =
    monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
  const to = addDays(nextMonth, -1);

  const [rows, counters] = await Promise.all([
    repository.listForCalendar(tx, from, to),
    repository.listDayCounters(tx, from, to),
  ]);

  const byDate = new Map<string, Calendar['days'][number]>();

  for (const counter of counters) {
    byDate.set(counter.date, {
      date: counter.date,
      capacity: counter.capacity,
      used: counter.usedCount,
      reserved: counter.reservedCount,
      preorders: [],
    });
  }

  for (const row of rows) {
    const day = byDate.get(row.dueDate) ?? {
      date: row.dueDate,
      capacity: 0,
      used: 0,
      reserved: 0,
      preorders: [],
    };

    day.preorders.push({
      id: row.id,
      code: row.code,
      customerName: row.customerName,
      status: row.status,
      totalCents: row.totalCents,
      dueTime: row.dueTime?.slice(0, 5) ?? null,
    });

    byDate.set(row.dueDate, day);
  }

  return {
    month,
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export interface CalendarPreorder {
  id: string;
  code: number;
  customerName: string | null;
  status: PreorderStatus;
  statusLabel: string;
  totalCents: number;
  dueDate: string;
  dueTime: string | null;
}

/**
 * Encomendas de um intervalo qualquer, para o calendário da loja.
 *
 * O calendário mostra semanas inteiras, que atravessam a virada do mês — por
 * isso intervalo livre, e não `month`. Cancelada fica de fora pelo mesmo
 * motivo de `calendar`: a vaga já foi devolvida.
 */
export async function calendarRange(
  tx: Transaction,
  from: string,
  to: string,
): Promise<CalendarPreorder[]> {
  const [rows, labels] = await Promise.all([
    repository.listForCalendar(tx, from, to),
    loadStatusLabels(tx),
  ]);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    customerName: row.customerName,
    status: row.status,
    statusLabel: labels.get(row.status)?.label ?? DEFAULT_PREORDER_LABELS[row.status],
    totalCents: row.totalCents,
    dueDate: row.dueDate,
    dueTime: row.dueTime?.slice(0, 5) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Criação                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateOptions {
  idempotencyKey?: string | null;
  keepPending?: boolean;
  timeZone: string;
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreatePreorderRequest,
  options: CreateOptions,
): Promise<PreorderDetail> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey(tx, options.idempotencyKey);
    if (existing) return assemble(tx, existing);
  }

  const settings = await settingsService.get(tx, tenantId);
  if (!settings.acceptsPreorder) {
    throw conflict('Esta loja não está aceitando encomendas.');
  }

  /* --- Cliente --- */
  const customer =
    'customerId' in input.customer
      ? await ordersRepository.findCustomerForOrder(tx, input.customer.customerId)
      : await customersService.findOrCreate(tx, tenantId, input.customer);

  if (!customer) throw unprocessable('Cliente não encontrado.');

  /* --- Endereço --- */
  let addressSnapshot = null;
  if (input.fulfillment === 'delivery') {
    if (input.addressId) {
      const address = await ordersRepository.findAddressForOrder(tx, input.addressId);
      if (!address || address.customerId !== customer.id) {
        throw unprocessable('Endereço não encontrado para este cliente.');
      }
      addressSnapshot = pickAddress(address);
    } else if (input.address?.street) {
      addressSnapshot = pickAddress(input.address);
    } else {
      throw unprocessable('Informe o endereço de entrega.');
    }
  }

  /* --- Itens --- */
  const variantIds = [...new Set(input.items.map((item) => item.productVariantId))];
  const variants = await ordersRepository.findVariantsForOrder(tx, variantIds);

  const missing = variantIds.filter((id) => !variants.has(id));
  if (missing.length > 0) {
    throw unprocessable('Produto não encontrado.', { productVariantIds: missing });
  }

  const notForPreorder = variantIds.filter(
    (id) => variants.get(id)!.availableFor === 'delivery',
  );
  if (notForPreorder.length > 0) {
    throw conflict('Há produtos que não são vendidos por encomenda.', {
      productVariantIds: notForPreorder,
    });
  }

  const costs = new Map<string, number>();
  for (const variantId of variantIds) {
    costs.set(variantId, (await computeUnitCost(tx, variantId)).unitCostCents);
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
  if (input.depositCents > totalCents) {
    throw unprocessable('O sinal é maior que o total da encomenda.');
  }

  /**
   * A vaga é reservada ANTES de gravar a encomenda.
   *
   * Se o dia lotou, não há encomenda para desfazer — a transação inteira cai
   * antes de existir linha. A ordem inversa deixaria um pedido órfão sempre
   * que duas pessoas disputassem a última vaga.
   */
  const availabilityDayId = await availabilityService.reserveSlot(
    tx,
    tenantId,
    input.dueDate,
    options.timeZone,
  );

  const code = await ordersRepository.nextCode(tx, tenantId, 'preorder');
  const keepPending = options.keepPending ?? false;

  let preorder: repository.PreorderRow;
  try {
    preorder = await repository.insert(tx, {
      tenantId,
      code,
      customerId: customer.id,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      status: 'pending',
      origin: input.origin,
      fulfillment: input.fulfillment,
      dueDate: input.dueDate,
      dueTime: input.dueTime ?? null,
      availabilityDayId,
      salesChannelId: input.salesChannelId ?? null,
      subtotalCents,
      discountCents: input.discountCents,
      deliveryFeeCents: input.deliveryFeeCents,
      totalCents,
      costCents,
      depositCents: input.depositCents,
      paymentMethod: input.paymentMethod ?? null,
      addressSnapshot,
      notes: input.notes ?? null,
      idempotencyKey: options.idempotencyKey ?? null,
      expiresAt: keepPending
        ? new Date(Date.now() + settings.reservationTtlMinutes * 60_000)
        : null,
    });
  } catch (error) {
    if (isUniqueViolation(error, 'preorders_idempotency_uq')) {
      const existing = await repository.findByIdempotencyKey(tx, options.idempotencyKey!);
      if (existing) return assemble(tx, existing);
    }
    throw error;
  }

  await repository.insertItems(
    tx,
    items.map((item) => ({ ...item, tenantId, preorderId: preorder.id })),
  );

  const lines = await stockLinesForSale(
    tx,
    input.items.map((item) => ({
      productVariantId: item.productVariantId,
      qty: item.qty,
    })),
  );

  if (lines.length > 0) {
    await reserve(tx, tenantId, lines, { source: 'preorder', sourceId: preorder.id });
  }

  await recordAudit(tx, {
    tenantId,
    action: 'preorder.created',
    entityType: 'preorder',
    entityId: preorder.id,
    after: { code, dueDate: input.dueDate, totalCents, items: items.length },
  });

  if (!keepPending) {
    const confirmed = await changeStatus(tx, tenantId, preorder.id, 'confirmed');
    return assemble(tx, confirmed);
  }

  if (customer.id) await customersService.refreshStats(tx, customer.id);

  return assemble(tx, preorder);
}

function pickAddress(source: {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  reference?: string | null;
}) {
  return {
    ...(source.street ? { street: source.street } : {}),
    ...(source.number ? { number: source.number } : {}),
    ...(source.complement ? { complement: source.complement } : {}),
    ...(source.neighborhood ? { neighborhood: source.neighborhood } : {}),
    ...(source.city ? { city: source.city } : {}),
    ...(source.state ? { state: source.state } : {}),
    ...(source.zip ? { zip: source.zip } : {}),
    ...(source.reference ? { reference: source.reference } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Edição, transições e sinal                                                  */
/* -------------------------------------------------------------------------- */

export async function update(
  tx: Transaction,
  tenantId: string,
  id: string,
  patch: UpdatePreorderRequest,
  timeZone: string,
): Promise<PreorderDetail> {
  const before = await repository.findById(tx, id);
  if (!before) throw notFound('Encomenda não encontrada.');

  if (before.status === 'completed' || before.status === 'canceled') {
    throw conflict('Encomenda concluída ou cancelada não pode ser alterada.');
  }

  const values: Partial<repository.PreorderRow> = {};
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.dueTime !== undefined) values.dueTime = patch.dueTime;

  /**
   * Mudar a data move a vaga: libera a antiga e reserva na nova.
   *
   * Nessa ordem — se a nova data estiver lotada, a transação cai e a vaga
   * antiga continua de pé. Liberar primeiro deixaria a encomenda sem vaga
   * nenhuma quando a troca falhasse.
   */
  if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) {
    const newDayId = await availabilityService.reserveSlot(
      tx,
      tenantId,
      patch.dueDate,
      timeZone,
    );

    if (before.availabilityDayId) {
      await availabilityService.releaseSlot(
        tx,
        before.availabilityDayId,
        before.status === 'pending',
      );
    }

    // A nova vaga nasce como reserva; se a encomenda já estava confirmada,
    // ela precisa virar uso, como estava na data anterior.
    if (before.status !== 'pending') {
      await availabilityService.consumeSlot(tx, newDayId);
    }

    values.dueDate = patch.dueDate;
    values.availabilityDayId = newDayId;
  }

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

  const updated = await repository.update(tx, id, values);
  if (!updated) throw notFound('Encomenda não encontrada.');

  await recordAudit(tx, {
    tenantId,
    action: 'preorder.updated',
    entityType: 'preorder',
    entityId: id,
    before: { dueDate: before.dueDate, totalCents: before.totalCents },
    after: { dueDate: updated.dueDate, totalCents: updated.totalCents },
  });

  return assemble(tx, updated);
}

export async function transition(
  tx: Transaction,
  tenantId: string,
  id: string,
  to: PreorderStatus,
  actorId?: string,
): Promise<PreorderDetail> {
  return assemble(tx, await changeStatus(tx, tenantId, id, to, { actorId: actorId ?? null }));
}

export async function cancel(
  tx: Transaction,
  tenantId: string,
  id: string,
  reason: string,
  actorId?: string,
): Promise<PreorderDetail> {
  return assemble(
    tx,
    await changeStatus(tx, tenantId, id, 'canceled', { reason, actorId: actorId ?? null }),
  );
}

/**
 * Sinal.
 *
 * Registrado, não cobrado online (D8). Pagar o sinal inteiro marca a
 * encomenda como paga — é o que costuma acontecer com bolo pequeno, e obrigar
 * um segundo passo para dizer isso seria burocracia.
 */
export async function registerDeposit(
  tx: Transaction,
  tenantId: string,
  id: string,
  input: RegisterDepositRequest,
): Promise<PreorderDetail> {
  const preorder = await repository.findById(tx, id);
  if (!preorder) throw notFound('Encomenda não encontrada.');

  if (input.amountCents > preorder.totalCents) {
    throw unprocessable('O sinal é maior que o total da encomenda.');
  }

  const updated = await repository.update(tx, id, {
    depositCents: input.amountCents,
    depositPaidAt: new Date(),
    paymentMethod: input.method,
    ...(input.amountCents === preorder.totalCents
      ? { paymentStatus: 'paid' as const, paidAt: new Date() }
      : {}),
  });
  if (!updated) throw notFound('Encomenda não encontrada.');

  await recordAudit(tx, {
    tenantId,
    action: 'preorder.deposit_registered',
    entityType: 'preorder',
    entityId: id,
    after: { amountCents: input.amountCents, method: input.method },
  });

  return assemble(tx, updated);
}
