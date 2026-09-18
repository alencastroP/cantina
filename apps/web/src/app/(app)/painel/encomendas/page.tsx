'use client';

import type { Preorder, PreorderBoard } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge, Dot } from '../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import {
  nextPreorderStatus,
  preordersApi,
  PREORDER_ACTION_LABELS,
} from '../../../../features/preorders/api';
import { cn } from '../../../../lib/cn';
import { formatCents, formatDate } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';

/**
 * Kanban de encomendas.
 *
 * A diferença visual em relação ao de delivery é a data: aqui o cartão
 * destaca PARA QUANDO é, não há quanto tempo entrou. Uma encomenda de dez
 * dias atrás não é urgente; uma para amanhã é.
 */
const REFRESH_MS = 15_000;

export default function EncomendasPage() {
  const board = useApi<PreorderBoard>('/preorders/board', { refreshMs: REFRESH_MS });
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const columns = board.data?.columns ?? [];
  const labelByStatus = useMemo(
    () => new Map(columns.map((column) => [column.status, column.label])),
    [columns],
  );

  const totalOpen = columns.reduce((sum, column) => sum + column.count, 0);
  const current =
    columns.find((column) => column.status === activeColumn) ?? columns[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Encomendas"
        description={
          board.data
            ? totalOpen === 0
              ? 'Nenhuma encomenda em aberto.'
              : `${totalOpen} encomenda(s) em aberto.`
            : undefined
        }
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/painel/encomendas/agenda" variant="secondary" size="sm">
              Agenda
            </LinkButton>
            <LinkButton href="/painel/encomendas/nova" variant="primary" size="sm">
              Nova encomenda
            </LinkButton>
          </div>
        }
      />

      {board.error ? (
        <Alert tone="danger" title="Não foi possível carregar o quadro.">
          {board.error.message}
        </Alert>
      ) : null}

      {board.loading && !board.data ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : null}

      {board.data && totalOpen === 0 ? (
        <EmptyState
          title="Nenhuma encomenda em aberto"
          description="Encomendas da vitrine caem aqui. Configure a agenda para o cliente poder escolher a data."
          action={
            <LinkButton href="/painel/encomendas/agenda" variant="primary">
              Configurar agenda
            </LinkButton>
          }
        />
      ) : null}

      {board.data && totalOpen > 0 ? (
        <>
          <div className="lg:hidden">
            <div
              className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
              role="tablist"
              aria-label="Etapas da encomenda"
            >
              {columns.map((column) => {
                const selected = current?.status === column.status;
                return (
                  <button
                    key={column.status}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveColumn(column.status)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                      selected
                        ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
                        : 'border-border bg-surface text-ink-soft',
                    )}
                  >
                    <Dot color={column.color} />
                    {column.label}
                    <span className="text-xs text-ink-muted" data-numeric>
                      {column.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {current ? (
              <ColumnBody
                orders={current.orders}
                labelByStatus={labelByStatus}
                onChanged={board.reload}
              />
            ) : null}
          </div>

          <div className="hidden gap-4 lg:grid lg:grid-cols-4">
            {columns.map((column) => (
              <section key={column.status} className="min-w-0">
                <header className="mb-3 flex items-center gap-2">
                  <Dot color={column.color} />
                  <h2 className="truncate text-sm font-medium text-ink-soft">
                    {column.label}
                  </h2>
                  <span
                    className="ml-auto rounded-full bg-sand-200 px-2 text-xs text-ink-muted"
                    data-numeric
                  >
                    {column.count}
                  </span>
                </header>

                <ColumnBody
                  orders={column.orders}
                  labelByStatus={labelByStatus}
                  onChanged={board.reload}
                />
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ColumnBody({
  orders,
  labelByStatus,
  onChanged,
}: {
  orders: Preorder[];
  labelByStatus: Map<string, string>;
  onChanged: () => void;
}) {
  if (orders.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-sm text-ink-muted">
        Vazio
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((preorder) => (
        <li key={preorder.id}>
          <PreorderCard
            preorder={preorder}
            labelByStatus={labelByStatus}
            onChanged={onChanged}
          />
        </li>
      ))}
    </ul>
  );
}

/** `AAAA-MM-DD` de hoje no fuso da loja, para comparar com `dueDate`. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function PreorderCard({
  preorder,
  labelByStatus,
  onChanged,
}: {
  preorder: Preorder;
  labelByStatus: Map<string, string>;
  onChanged: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = nextPreorderStatus(preorder);
  const nextLabel = next ? (labelByStatus.get(next) ?? PREORDER_ACTION_LABELS[next]) : null;

  const now = today();
  const overdue = preorder.dueDate < now;
  const isToday = preorder.dueDate === now;

  async function advance() {
    if (!next) return;
    setMoving(true);
    setError(null);
    try {
      await preordersApi.changeStatus(preorder.id, next);
      onChanged();
    } catch {
      setError('Não foi possível avançar. Abra a encomenda.');
      setMoving(false);
    }
  }

  return (
    <article className="rounded-card border border-border bg-surface p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/painel/encomendas/${preorder.id}`}
          className="min-w-0 flex-1 transition-colors hover:text-clay-600"
        >
          <p className="font-display text-lg leading-none text-ink" data-numeric>
            #{preorder.code}
          </p>
          <p className="mt-1 truncate text-sm text-ink-soft">
            {preorder.customerName ?? 'Sem cliente'}
          </p>
        </Link>

        <div className="shrink-0 text-right">
          <p className="font-medium text-ink" data-numeric>
            {formatCents(preorder.totalCents)}
          </p>
        </div>
      </div>

      {/* A data é o que aperta numa encomenda — vem em destaque, não no rodapé. */}
      <p
        className={cn(
          'mt-2 text-sm font-medium',
          overdue ? 'text-danger-700' : isToday ? 'text-warning-700' : 'text-ink-soft',
        )}
      >
        {overdue ? 'Atrasada · ' : isToday ? 'Hoje · ' : 'Para '}
        {formatDate(preorder.dueDate)}
        {preorder.dueTime ? ` às ${preorder.dueTime}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={preorder.fulfillment === 'pickup' ? 'accent' : 'neutral'}>
          {preorder.fulfillment === 'pickup' ? 'Retirada' : 'Entrega'}
        </Badge>
        {preorder.depositPaidAt ? (
          <Badge tone="success">Sinal {formatCents(preorder.depositCents)}</Badge>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-danger-700">{error}</p> : null}

      {next && nextLabel ? (
        <Button
          variant="primary"
          size="sm"
          fullWidth
          className="mt-3"
          loading={moving}
          onClick={() => void advance()}
        >
          {nextLabel}
        </Button>
      ) : null}
    </article>
  );
}
