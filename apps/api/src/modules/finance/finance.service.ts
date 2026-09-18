import type {
  Cashflow,
  CreateAccountRequest,
  CreateEntryRequest,
  CreateFinanceCategoryRequest,
  CreateRecurrenceRequest,
  FinanceAccount,
  FinanceCategory,
  FinanceEntry,
  FinanceRecurrence,
  ListEntriesQuery,
  Page,
  SettleEntryRequest,
  UpdateEntryRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import { addDays, dateOnlyIn, eachDay, type DateOnly } from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as repository from './finance.repository';

/**
 * Financeiro (§6.9 do PLAN.md, D20).
 *
 * Dois caminhos alimentam esta tabela:
 *
 *   manual       o lojista lança aluguel, energia, uma venda avulsa
 *   automático   pedido concluído vira receita, compra de insumo vira despesa
 *
 * O segundo é ligado por `source` + `source_id`, com índice único: um pedido
 * nunca vira receita duas vezes, mesmo que a transição seja reprocessada.
 */

function today(timeZone = 'America/Sao_Paulo'): DateOnly {
  return dateOnlyIn(new Date(), timeZone);
}

/** `overdue` é derivado na leitura, não gravado (ver contrato). */
function statusOf(row: repository.EntryRow, now: DateOnly): FinanceEntry['status'] {
  if (row.status === 'open' && row.dueDate < now) return 'overdue';
  return row.status;
}

function toEntry(row: repository.EntryWithNames, now: DateOnly): FinanceEntry {
  return {
    id: row.id,
    direction: row.direction,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    accountId: row.accountId,
    accountName: row.accountName,
    description: row.description,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    paidAt: row.paidAt?.toISOString() ?? null,
    paidAmountCents: row.paidAmountCents,
    status: statusOf(row, now),
    source: row.source,
    sourceId: row.sourceId,
    notes: row.notes,
  };
}

/* -------------------------------------------------------------------------- */
/* Contas e categorias                                                         */
/* -------------------------------------------------------------------------- */

export async function listAccounts(tx: Transaction): Promise<FinanceAccount[]> {
  const rows = await repository.listAccounts(tx);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    openingBalanceCents: row.openingBalanceCents,
    isDefault: row.isDefault,
    active: row.active,
    balanceCents: Number(row.balanceCents),
  }));
}

export async function createAccount(
  tx: Transaction,
  tenantId: string,
  input: CreateAccountRequest,
): Promise<FinanceAccount> {
  const created = await repository.insertAccount(tx, { tenantId, ...input });

  await recordAudit(tx, {
    tenantId,
    action: 'finance.account_created',
    entityType: 'finance_account',
    entityId: created.id,
    after: { name: created.name, openingBalanceCents: created.openingBalanceCents },
  });

  const accounts = await listAccounts(tx);
  return accounts.find((account) => account.id === created.id)!;
}

export async function listCategories(tx: Transaction): Promise<FinanceCategory[]> {
  const rows = await repository.listCategories(tx);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    direction: row.direction,
    active: row.active,
  }));
}

export async function createCategory(
  tx: Transaction,
  tenantId: string,
  input: CreateFinanceCategoryRequest,
): Promise<FinanceCategory> {
  try {
    const created = await repository.insertCategory(tx, { tenantId, ...input });
    return {
      id: created.id,
      name: created.name,
      direction: created.direction,
      active: created.active,
    };
  } catch (error) {
    if (isUniqueViolation(error, 'finance_categories_tenant_name_uq')) {
      throw conflict('Já existe uma categoria com este nome neste fluxo.');
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Lançamentos                                                                 */
/* -------------------------------------------------------------------------- */

export async function listEntries(
  tx: Transaction,
  query: ListEntriesQuery,
): Promise<Page<FinanceEntry>> {
  const now = today();

  const rows = await repository.listEntries(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    direction: query.direction,
    status: query.status,
    categoryId: query.categoryId,
    from: query.from,
    to: query.to,
    q: query.q,
    today: now,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => toEntry(row, now));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function createEntry(
  tx: Transaction,
  tenantId: string,
  input: CreateEntryRequest,
): Promise<FinanceEntry> {
  const accountId =
    input.accountId ?? (input.paidNow ? (await repository.findDefaultAccount(tx))?.id : null);

  const created = await repository.insertEntry(tx, {
    tenantId,
    direction: input.direction,
    description: input.description,
    amountCents: input.amountCents,
    dueDate: input.dueDate,
    categoryId: input.categoryId ?? null,
    accountId: accountId ?? null,
    notes: input.notes ?? null,
    source: 'manual',
    ...(input.paidNow
      ? { status: 'paid' as const, paidAt: new Date(), paidAmountCents: input.amountCents }
      : {}),
  });

  await recordAudit(tx, {
    tenantId,
    action: 'finance.entry_created',
    entityType: 'finance_entry',
    entityId: created.id,
    after: {
      direction: input.direction,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
    },
  });

  const entry = await repository.findEntryById(tx, created.id);
  return toEntry(entry!, today());
}

export async function updateEntry(
  tx: Transaction,
  tenantId: string,
  id: string,
  patch: UpdateEntryRequest,
): Promise<FinanceEntry> {
  const before = await repository.findEntryById(tx, id);
  if (!before) throw notFound('Lançamento não encontrado.');

  /**
   * Lançamento automático não é editável.
   *
   * Ele espelha um pedido ou uma compra; mudar o valor aqui faria o
   * financeiro discordar do documento que o originou, sem deixar rastro de
   * qual dos dois está certo. Para corrigir, corrija a origem.
   */
  if (before.source !== 'manual') {
    throw conflict(
      'Este lançamento veio de um pedido ou compra. Corrija o documento de origem.',
      { source: before.source },
    );
  }

  const updated = await repository.updateEntry(tx, id, patch);
  if (!updated) throw notFound('Lançamento não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'finance.entry_updated',
    entityType: 'finance_entry',
    entityId: id,
    before: { amountCents: before.amountCents, dueDate: before.dueDate },
    after: { amountCents: updated.amountCents, dueDate: updated.dueDate },
  });

  const entry = await repository.findEntryById(tx, id);
  return toEntry(entry!, today());
}

/**
 * Baixa de pagamento.
 *
 * O valor pago pode divergir do previsto — desconto por antecipação, juro por
 * atraso, pagamento parcial. Guardar os dois separados é o que permite o
 * relatório mostrar quanto se ganhou (ou perdeu) na negociação.
 */
export async function settleEntry(
  tx: Transaction,
  tenantId: string,
  id: string,
  input: SettleEntryRequest,
): Promise<FinanceEntry> {
  const before = await repository.findEntryById(tx, id);
  if (!before) throw notFound('Lançamento não encontrado.');
  if (before.status === 'paid') throw conflict('Este lançamento já foi baixado.');

  const accountId =
    input.accountId ?? before.accountId ?? (await repository.findDefaultAccount(tx))?.id ?? null;

  const updated = await repository.updateEntry(tx, id, {
    status: 'paid',
    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    paidAmountCents: input.paidAmountCents ?? before.amountCents,
    accountId,
  });
  if (!updated) throw notFound('Lançamento não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'finance.entry_settled',
    entityType: 'finance_entry',
    entityId: id,
    after: { paidAmountCents: updated.paidAmountCents, accountId },
  });

  const entry = await repository.findEntryById(tx, id);
  return toEntry(entry!, today());
}

export async function removeEntry(
  tx: Transaction,
  tenantId: string,
  id: string,
): Promise<void> {
  const entry = await repository.findEntryById(tx, id);
  if (!entry) throw notFound('Lançamento não encontrado.');

  if (entry.source !== 'manual') {
    throw conflict('Este lançamento veio de um pedido ou compra e não pode ser removido.');
  }

  await repository.softDeleteEntry(tx, id);

  await recordAudit(tx, {
    tenantId,
    action: 'finance.entry_removed',
    entityType: 'finance_entry',
    entityId: id,
    before: { description: entry.description, amountCents: entry.amountCents },
  });
}

/* -------------------------------------------------------------------------- */
/* Lançamentos automáticos — chamados pelos outros módulos                     */
/* -------------------------------------------------------------------------- */

export interface AutoEntryInput {
  source: 'delivery_order' | 'preorder' | 'supply_purchase';
  sourceId: string;
  direction: 'in' | 'out';
  description: string;
  amountCents: number;
  dueDate: DateOnly;
  categoryName: string;
  /** Venda concluída já entrou no caixa; compra pode ser a prazo. */
  paid: boolean;
}

/**
 * Cria o lançamento espelho de um documento.
 *
 * Silencioso na colisão: `finance_entries` tem índice único em
 * `(tenant_id, source, source_id)`, então reprocessar a mesma conclusão de
 * pedido não gera receita dobrada. Falhar aqui derrubaria a transição de
 * status por um efeito colateral — e o pedido é o fato principal.
 */
export async function recordAutoEntry(
  tx: Transaction,
  tenantId: string,
  input: AutoEntryInput,
): Promise<void> {
  if (input.amountCents <= 0) return;

  const category = await repository.findOrCreateCategory(
    tx,
    tenantId,
    input.direction,
    input.categoryName,
  );

  const account = input.paid ? await repository.findDefaultAccount(tx) : null;

  try {
    await repository.insertEntry(tx, {
      tenantId,
      direction: input.direction,
      description: input.description,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      categoryId: category.id,
      accountId: account?.id ?? null,
      source: input.source,
      sourceId: input.sourceId,
      ...(input.paid
        ? { status: 'paid' as const, paidAt: new Date(), paidAmountCents: input.amountCents }
        : {}),
    });
  } catch (error) {
    if (isUniqueViolation(error, 'finance_entries_source_uq')) return;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Fluxo de caixa                                                              */
/* -------------------------------------------------------------------------- */

export async function cashflow(
  tx: Transaction,
  from: DateOnly,
  to: DateOnly,
): Promise<Cashflow> {
  const now = today();

  const [rows, opening, overdue] = await Promise.all([
    repository.cashflowByDay(tx, from, to),
    repository.balanceBefore(tx, from),
    repository.overdueTotals(tx, now),
  ]);

  const byDate = new Map(rows.map((row) => [row.date, row]));

  let balance = opening;
  let totalIn = 0;
  let totalOut = 0;

  const days = eachDay(from, to).map((date) => {
    const row = byDate.get(date);
    const inCents = Number(row?.inCents ?? 0);
    const outCents = Number(row?.outCents ?? 0);

    balance += inCents - outCents;
    totalIn += inCents;
    totalOut += outCents;

    return {
      date,
      inCents,
      outCents,
      balanceCents: balance,
      // Depois de hoje o saldo é projeção, não fato — e a tela precisa
      // desenhar essa fronteira, senão a linha inteira parece extrato.
      projected: date > now,
    };
  });

  return {
    openingBalanceCents: opening,
    days,
    totals: {
      inCents: totalIn,
      outCents: totalOut,
      netCents: totalIn - totalOut,
      overdueInCents: overdue.inCents,
      overdueOutCents: overdue.outCents,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Recorrências                                                                */
/* -------------------------------------------------------------------------- */

export async function listRecurrences(tx: Transaction): Promise<FinanceRecurrence[]> {
  const rows = await repository.listRecurrences(tx);

  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    accountId: row.accountId,
    description: row.description,
    amountCents: row.amountCents,
    frequency: row.frequency,
    nextDueDate: row.nextDueDate,
    endsAt: row.endsAt,
    active: row.active,
  }));
}

export async function createRecurrence(
  tx: Transaction,
  tenantId: string,
  input: CreateRecurrenceRequest,
): Promise<FinanceRecurrence> {
  if (input.endsAt && input.endsAt < input.nextDueDate) {
    throw unprocessable('O fim da recorrência é anterior ao primeiro vencimento.');
  }

  const created = await repository.insertRecurrence(tx, {
    tenantId,
    direction: input.direction,
    description: input.description,
    amountCents: input.amountCents,
    frequency: input.frequency,
    nextDueDate: input.nextDueDate,
    endsAt: input.endsAt ?? null,
    categoryId: input.categoryId ?? null,
    accountId: input.accountId ?? null,
  });

  await recordAudit(tx, {
    tenantId,
    action: 'finance.recurrence_created',
    entityType: 'finance_recurrence',
    entityId: created.id,
    after: { description: created.description, frequency: created.frequency },
  });

  const all = await listRecurrences(tx);
  return all.find((recurrence) => recurrence.id === created.id)!;
}

export async function removeRecurrence(
  tx: Transaction,
  tenantId: string,
  id: string,
): Promise<void> {
  const removed = await repository.deleteRecurrence(tx, id);
  if (!removed) throw notFound('Recorrência não encontrada.');

  await recordAudit(tx, {
    tenantId,
    action: 'finance.recurrence_removed',
    entityType: 'finance_recurrence',
    entityId: id,
  });
}

/** Quanto avançar em cada frequência. Meses são somados como meses. */
export function nextDueDate(current: DateOnly, frequency: string): DateOnly {
  const monthsBy: Record<string, number> = {
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    semiannual: 6,
    yearly: 12,
  };

  const months = monthsBy[frequency];
  if (months) {
    const [year, month, day] = current.split('-').map(Number) as [number, number, number];
    const target = new Date(Date.UTC(year, month - 1 + months, day));

    // 31 de janeiro + 1 mês não existe: o `Date` transborda para março, e o
    // aluguel do dia 31 passaria a vencer no dia 3. Voltar para o último dia
    // do mês pretendido é o comportamento que o boleto tem.
    if (target.getUTCMonth() !== (month - 1 + months) % 12) {
      target.setUTCDate(0);
    }
    return target.toISOString().slice(0, 10);
  }

  return addDays(current, frequency === 'biweekly' ? 14 : 7);
}

/**
 * Materializa os lançamentos vencidos de cada recorrência.
 *
 * O fluxo de caixa lê lançamentos concretos, nunca uma regra que precisaria
 * ser reinterpretada a cada consulta — é o que mantém a projeção auditável.
 */
export async function materializeRecurrences(
  tx: Transaction,
  tenantId: string,
): Promise<number> {
  const now = today();
  const due = await repository.findDueRecurrences(tx, now, 200);
  let created = 0;

  for (const recurrence of due) {
    let cursor = recurrence.nextDueDate;

    // Uma recorrência parada há meses gera todos os lançamentos que faltaram,
    // não só o último — senão o histórico ficaria com buracos.
    while (cursor <= now && (!recurrence.endsAt || cursor <= recurrence.endsAt)) {
      await repository.insertEntry(tx, {
        tenantId,
        direction: recurrence.direction,
        description: recurrence.description,
        amountCents: recurrence.amountCents,
        dueDate: cursor,
        categoryId: recurrence.categoryId,
        accountId: recurrence.accountId,
        recurrenceId: recurrence.id,
        source: 'manual',
      });
      created += 1;
      cursor = nextDueDate(cursor, recurrence.frequency);
    }

    await repository.updateRecurrence(tx, recurrence.id, { nextDueDate: cursor });
  }

  return created;
}
