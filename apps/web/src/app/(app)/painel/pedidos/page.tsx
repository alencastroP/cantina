'use client';

import type { Board, BoardColumn } from '@cantina/contracts';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { LinkButton } from '../../../../components/ui/button';
import { Dot } from '../../../../components/ui/badge';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { nextStatus } from '../../../../features/orders/api';
import { OrderCard } from '../../../../features/orders/order-card';
import { cn } from '../../../../lib/cn';
import { useApi } from '../../../../lib/use-api';

/**
 * Kanban de delivery.
 *
 * Duas leituras da mesma informação, não uma redimensionada:
 *
 *   desktop  colunas lado a lado — a visão de quem coordena a cozinha
 *   celular  uma coluna por vez, escolhida por abas — a visão de quem está
 *            executando uma etapa e não quer rolar o resto
 *
 * Recarrega a cada 5 segundos (P10). Pedido novo entra sozinho; a alternativa
 * seria alguém apertar F5 no meio do almoço.
 */
const REFRESH_MS = 5000;

export default function PedidosPage() {
  const board = useApi<Board>('/delivery-orders/board', { refreshMs: REFRESH_MS });
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
        title="Pedidos"
        description={
          board.data
            ? totalOpen === 0
              ? 'Nenhum pedido em aberto.'
              : `${totalOpen} pedido(s) em aberto.`
            : undefined
        }
        action={
          <LinkButton href="/painel/pedidos/novo" variant="primary" size="sm">
            Novo pedido
          </LinkButton>
        }
      />

      {board.error ? (
        <Alert tone="danger" title="Não foi possível carregar o quadro.">
          {board.error.message}
        </Alert>
      ) : null}

      {board.loading && !board.data ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : null}

      {board.data && totalOpen === 0 ? (
        <EmptyState
          title="Nenhum pedido em aberto"
          description="Pedidos da vitrine caem aqui automaticamente. Você também pode lançar um do balcão."
          action={
            <LinkButton href="/painel/pedidos/novo" variant="primary">
              Lançar pedido
            </LinkButton>
          }
        />
      ) : null}

      {board.data && totalOpen > 0 ? (
        <>
          {/* --- Celular: abas + uma coluna --- */}
          <div className="lg:hidden">
            <div
              className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
              role="tablist"
              aria-label="Etapas do pedido"
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
                column={current}
                labelByStatus={labelByStatus}
                onChanged={board.reload}
              />
            ) : null}
          </div>

          {/* --- Desktop: colunas lado a lado --- */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-5">
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
                  column={column}
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
  column,
  labelByStatus,
  onChanged,
}: {
  column: BoardColumn;
  labelByStatus: Map<string, string>;
  onChanged: () => void;
}) {
  if (column.orders.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-sm text-ink-muted">
        Vazio
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {column.orders.map((order) => {
        const next = nextStatus(order);
        return (
          <li key={order.id}>
            <OrderCard
              order={order}
              nextLabel={next ? (labelByStatus.get(next) ?? null) : null}
              onChanged={onChanged}
            />
          </li>
        );
      })}
    </ul>
  );
}
