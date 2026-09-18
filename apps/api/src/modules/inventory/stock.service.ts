import type {
  ListMovementsQuery,
  ListStockQuery,
  Page,
  StockBalance as StockBalanceDto,
  StockMovement as StockMovementDto,
} from '@cantina/contracts';
import { productVariants, supplies, type Transaction } from '@cantina/db';
import {
  applyMovement,
  availableQty,
  MOVEMENTS_REQUIRING_REASON,
  type MovementType,
  type StockBalance,
  type StockKind,
} from '@cantina/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { conflict, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { getContext } from '../../shared/request-context';
import * as repository from './stock.repository';

/**
 * Motor de estoque (§4.6 do PLAN.md, invariante 3).
 *
 * TODA mudança de saldo passa por `applyMovements`. Ninguém escreve
 * `qty_on_hand` diretamente — nem este módulo, nem os kanbans, nem a
 * produção. É o que garante que o extrato explique o saldo.
 */

export type MovementSource =
  | 'delivery_order'
  | 'preorder'
  | 'supply_purchase'
  | 'production'
  | 'manual';

export interface MovementRequest {
  kind: StockKind;
  refId: string;
  type: MovementType;
  /** Sempre positiva, exceto em `adjustment`. */
  qty: number;
  unitCost?: number | null;
  reason?: string | null;
}

export interface ApplyOptions {
  source?: MovementSource;
  sourceId?: string | null;
  createdByUserId?: string | null;
}

export interface AppliedMovement {
  kind: StockKind;
  refId: string;
  balance: StockBalance;
}

function refKey(kind: StockKind, refId: string): string {
  return `${kind}:${refId}`;
}

/**
 * Itens únicos, em ordem determinística de travamento.
 *
 * Exportada para ter teste próprio: é a peça que evita deadlock, e o modo de
 * falhar dela (dois pedidos com os mesmos itens em ordens opostas) só
 * aparece sob concorrência, quando é tarde para descobrir.
 */
export function orderRefsForLocking(
  requests: readonly Pick<MovementRequest, 'kind' | 'refId'>[],
): Array<{ kind: StockKind; refId: string }> {
  const unique = new Map<string, { kind: StockKind; refId: string }>();
  for (const request of requests) {
    unique.set(refKey(request.kind, request.refId), {
      kind: request.kind,
      refId: request.refId,
    });
  }

  return [...unique.values()].sort((a, b) =>
    refKey(a.kind, a.refId).localeCompare(refKey(b.kind, b.refId)),
  );
}

/**
 * Confere que todo `ref_id` existe antes de movimentar.
 *
 * As tabelas de estoque são polimórficas e por isso não têm FK — esta é a
 * checagem que ocupa o lugar dela. Sem ela, um id errado criaria um saldo
 * fantasma que nunca apareceria em tela nenhuma.
 */
async function assertRefsExist(tx: Transaction, requests: readonly MovementRequest[]): Promise<void> {
  const supplyIds = [
    ...new Set(requests.filter((r) => r.kind === 'supply').map((r) => r.refId)),
  ];
  const variantIds = [
    ...new Set(requests.filter((r) => r.kind === 'product_variant').map((r) => r.refId)),
  ];

  if (supplyIds.length > 0) {
    const found = await tx
      .select({ id: supplies.id })
      .from(supplies)
      .where(and(inArray(supplies.id, supplyIds), isNull(supplies.deletedAt)));

    const known = new Set(found.map((row) => row.id));
    const missing = supplyIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw unprocessable('Insumo não encontrado.', { supplyIds: missing });
    }
  }

  if (variantIds.length > 0) {
    const found = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(inArray(productVariants.id, variantIds), isNull(productVariants.deletedAt)));

    const known = new Set(found.map((row) => row.id));
    const missing = variantIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw unprocessable('Variação de produto não encontrada.', { variantIds: missing });
    }
  }
}

/**
 * Aplica um lote de movimentos numa transação.
 *
 * As travas são adquiridas em ordem determinística (por `kind:refId`
 * ordenado). Isso não é preciosismo: dois pedidos com os mesmos dois itens em
 * ordens opostas travariam um o item do outro e o banco mataria uma das
 * transações por deadlock. Ordenar elimina o ciclo.
 *
 * Os movimentos são GRAVADOS na ordem original, para o extrato contar a
 * história na sequência em que ela aconteceu.
 */
export async function applyMovements(
  tx: Transaction,
  tenantId: string,
  requests: readonly MovementRequest[],
  options: ApplyOptions = {},
): Promise<AppliedMovement[]> {
  if (requests.length === 0) return [];

  for (const request of requests) {
    if (MOVEMENTS_REQUIRING_REASON.includes(request.type) && !request.reason?.trim()) {
      throw unprocessable(`Movimento "${request.type}" exige um motivo.`, { type: request.type });
    }
  }

  await assertRefsExist(tx, requests);

  const uniqueRefs = orderRefsForLocking(requests);
  const locked = new Map<string, { id: string; balance: StockBalance }>();

  for (const ref of uniqueRefs) {
    await repository.ensureStockItem(tx, tenantId, ref.kind, ref.refId);
    const row = await repository.lockStockItem(tx, ref.kind, ref.refId);
    if (!row) {
      // `ensureStockItem` acabou de garantir a linha; não achá-la aqui
      // significaria contexto de tenant errado, não corrida.
      throw new Error(`Saldo não encontrado após criação: ${refKey(ref.kind, ref.refId)}`);
    }
    locked.set(refKey(ref.kind, ref.refId), {
      id: row.id,
      balance: { qtyOnHand: row.qtyOnHand, qtyReserved: row.qtyReserved },
    });
  }

  const userId = options.createdByUserId ?? getContext()?.userId ?? null;

  for (const request of requests) {
    const key = refKey(request.kind, request.refId);
    const entry = locked.get(key)!;

    // A regra de qual movimento mexe em quê vive em `@cantina/domain` —
    // aqui só se aplica o resultado.
    entry.balance = applyMovement(entry.balance, request.type, request.qty);

    await repository.insertMovement(tx, {
      tenantId,
      kind: request.kind,
      refId: request.refId,
      type: request.type,
      qtyDelta: request.qty,
      balanceAfter: entry.balance.qtyOnHand,
      unitCost: request.unitCost ?? null,
      reason: request.reason ?? null,
      source: options.source ?? 'manual',
      sourceId: options.sourceId ?? null,
      createdByUserId: userId,
    });
  }

  // Uma escrita de saldo por item, no fim — não uma por movimento.
  for (const entry of locked.values()) {
    await repository.updateBalance(tx, entry.id, entry.balance);
  }

  return [...locked.entries()].map(([key, entry]) => {
    const [kind, refId] = key.split(':') as [StockKind, string];
    return { kind, refId, balance: entry.balance };
  });
}

/* -------------------------------------------------------------------------- */
/* Operações que os outros módulos chamam                                      */
/* -------------------------------------------------------------------------- */

export interface StockLine {
  kind: StockKind;
  refId: string;
  qty: number;
}

/** Checkout: segura o estoque sem tirá-lo do físico (D14). */
export function reserve(
  tx: Transaction,
  tenantId: string,
  lines: readonly StockLine[],
  options: ApplyOptions,
): Promise<AppliedMovement[]> {
  return applyMovements(
    tx,
    tenantId,
    lines.map((line) => ({ ...line, type: 'reservation' as const })),
    options,
  );
}

/** Pedido cancelado antes de confirmar, ou reserva expirada pelo job. */
export function releaseReservation(
  tx: Transaction,
  tenantId: string,
  lines: readonly StockLine[],
  options: ApplyOptions,
): Promise<AppliedMovement[]> {
  return applyMovements(
    tx,
    tenantId,
    lines.map((line) => ({ ...line, type: 'reservation_release' as const })),
    options,
  );
}

/** Confirmação do lojista: a reserva vira saída definitiva. */
export function commitSale(
  tx: Transaction,
  tenantId: string,
  lines: readonly StockLine[],
  options: ApplyOptions,
): Promise<AppliedMovement[]> {
  return applyMovements(
    tx,
    tenantId,
    lines.map((line) => ({ ...line, type: 'sale' as const })),
    options,
  );
}

/** Cancelamento depois de confirmado: devolve ao físico o que já saíra. */
export function restore(
  tx: Transaction,
  tenantId: string,
  lines: readonly StockLine[],
  options: ApplyOptions,
): Promise<AppliedMovement[]> {
  return applyMovements(
    tx,
    tenantId,
    lines.map((line) => ({ ...line, type: 'return' as const })),
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* Desfazer por documento                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Desfazer um pedido usa o LIVRO, não a receita atual.
 *
 * Recalcular a explosão da ficha técnica no cancelamento parece equivalente,
 * mas não é: se a receita mudou entre a reserva e o cancelamento, a devolução
 * teria quantidade diferente da saída, e o saldo passaria a mentir sem
 * nenhum erro aparecer. O livro registra o que de fato saiu.
 */
async function linesFromLedger(
  tx: Transaction,
  source: MovementSource,
  sourceId: string,
  type: MovementType,
): Promise<StockLine[]> {
  const rows = await repository.sumMovementsBySource(tx, source, sourceId, type);
  return rows.map((row) => ({ kind: row.kind, refId: row.refId, qty: row.qty }));
}

/** Cancelamento antes da confirmação, ou reserva expirada pelo job (D14). */
export async function releaseReservationBySource(
  tx: Transaction,
  tenantId: string,
  source: MovementSource,
  sourceId: string,
): Promise<void> {
  const lines = await linesFromLedger(tx, source, sourceId, 'reservation');
  if (lines.length === 0) return;
  await releaseReservation(tx, tenantId, lines, { source, sourceId });
}

/** Confirmação: a reserva daquele pedido vira saída definitiva. */
export async function commitSaleBySource(
  tx: Transaction,
  tenantId: string,
  source: MovementSource,
  sourceId: string,
): Promise<void> {
  const lines = await linesFromLedger(tx, source, sourceId, 'reservation');
  if (lines.length === 0) return;
  await commitSale(tx, tenantId, lines, { source, sourceId });
}

/** Cancelamento depois de confirmado: devolve ao físico o que já saíra. */
export async function restoreBySource(
  tx: Transaction,
  tenantId: string,
  source: MovementSource,
  sourceId: string,
): Promise<void> {
  const lines = await linesFromLedger(tx, source, sourceId, 'sale');
  if (lines.length === 0) return;
  await restore(tx, tenantId, lines, { source, sourceId });
}

/* -------------------------------------------------------------------------- */
/* Ajuste e perda (HTTP)                                                       */
/* -------------------------------------------------------------------------- */

export async function adjust(
  tx: Transaction,
  tenantId: string,
  input: { kind: StockKind; refId: string; qtyDelta: number; reason: string },
): Promise<StockBalance> {
  const [applied] = await applyMovements(
    tx,
    tenantId,
    [
      {
        kind: input.kind,
        refId: input.refId,
        type: 'adjustment',
        qty: input.qtyDelta,
        reason: input.reason,
      },
    ],
    { source: 'manual' },
  );

  await recordAudit(tx, {
    tenantId,
    action: 'stock.adjusted',
    entityType: 'stock_item',
    entityId: input.refId,
    after: { kind: input.kind, qtyDelta: input.qtyDelta, reason: input.reason },
  });

  return applied!.balance;
}

export async function registerLoss(
  tx: Transaction,
  tenantId: string,
  input: { kind: StockKind; refId: string; qty: number; reason: string },
): Promise<StockBalance> {
  const current = await repository.findBalance(tx, input.kind, input.refId);

  // Perda maior que o saldo é quase sempre erro de digitação. Ajuste manual
  // continua podendo negativar — lá o lojista está declarando que o saldo
  // estava errado, aqui está declarando que perdeu algo que tinha.
  if (current && current.qtyOnHand < input.qty) {
    throw conflict('A perda é maior que o saldo em estoque.', {
      qty: input.qty,
      qtyOnHand: current.qtyOnHand,
    });
  }

  const [applied] = await applyMovements(
    tx,
    tenantId,
    [{ kind: input.kind, refId: input.refId, type: 'loss', qty: input.qty, reason: input.reason }],
    { source: 'manual' },
  );

  await recordAudit(tx, {
    tenantId,
    action: 'stock.loss',
    entityType: 'stock_item',
    entityId: input.refId,
    after: { kind: input.kind, qty: input.qty, reason: input.reason },
  });

  return applied!.balance;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

function toBalanceDto(row: repository.BalanceRow, kind: StockKind): StockBalanceDto {
  const qtyAvailable = availableQty({
    qtyOnHand: row.qtyOnHand,
    qtyReserved: row.qtyReserved,
  });

  return {
    kind,
    refId: row.refId,
    refName: row.refName,
    unit: row.unit,
    qtyOnHand: row.qtyOnHand,
    qtyReserved: row.qtyReserved,
    qtyAvailable,
    minStockQty: row.minStockQty,
    isLow: row.minStockQty !== null && row.qtyOnHand <= row.minStockQty,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBalances(
  tx: Transaction,
  query: ListStockQuery,
): Promise<Page<StockBalanceDto>> {
  const filters = {
    cursor: query.cursor,
    limit: query.limit + 1,
    lowOnly: query.lowOnly,
    q: query.q,
  };

  const rows =
    query.kind === 'supply'
      ? await repository.listSupplyBalances(tx, filters)
      : await repository.listVariantBalances(tx, filters);

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) =>
    toBalanceDto(row, query.kind),
  );

  return { items, nextCursor: hasMore ? (items.at(-1)?.refId ?? null) : null };
}

export async function listMovements(
  tx: Transaction,
  query: ListMovementsQuery,
): Promise<Page<StockMovementDto>> {
  const rows = await repository.listMovements(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    kind: query.kind,
    refId: query.refId,
    type: query.type,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => ({
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    refName: row.refName,
    type: row.type,
    qtyDelta: row.qtyDelta,
    balanceAfter: row.balanceAfter,
    unitCost: row.unitCost,
    reason: row.reason,
    source: row.source,
    sourceId: row.sourceId,
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
