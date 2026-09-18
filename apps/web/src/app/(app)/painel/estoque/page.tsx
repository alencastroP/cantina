'use client';

import type { Page as ApiPage, StockBalance, StockMovement } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Input } from '../../../../components/ui/field';
import {
  INBOUND_MOVEMENTS,
  MOVEMENT_TYPE_LABELS,
} from '../../../../features/inventory/api';
import { StockActions } from '../../../../features/inventory/stock-actions';
import { cn } from '../../../../lib/cn';
import { formatDateTime, formatQty } from '../../../../lib/format';
import { useApi, useDebounced } from '../../../../lib/use-api';

type Tab = 'supply' | 'product_variant' | 'movements';

/**
 * Estoque.
 *
 * `disponível = físico − reservado`. A tela mostra os três porque a diferença
 * entre eles é o que explica "tenho farinha mas a vitrine diz que acabou": há
 * pedido pendente segurando.
 */
export default function EstoquePage() {
  const [tab, setTab] = useState<Tab>('supply');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debounced = useDebounced(search);

  const stockQuery = useMemo(() => {
    const params = new URLSearchParams({ kind: tab === 'movements' ? 'supply' : tab, limit: '60' });
    if (debounced.length >= 2) params.set('q', debounced);
    if (lowOnly && tab === 'supply') params.set('lowOnly', 'true');
    return `?${params.toString()}`;
  }, [tab, debounced, lowOnly]);

  const stock = useApi<ApiPage<StockBalance>>(
    tab === 'movements' ? null : `/stock${stockQuery}`,
  );
  const movements = useApi<ApiPage<StockMovement>>(
    tab === 'movements' ? '/stock/movements?limit=60' : null,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Estoque"
        description="Saldos, correções e histórico."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/painel/estoque/insumos/novo" variant="secondary" size="sm">
              Novo insumo
            </LinkButton>
            <LinkButton href="/painel/estoque/compras/nova" variant="primary" size="sm">
              Registrar compra
            </LinkButton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {(
          [
            ['supply', 'Insumos'],
            ['product_variant', 'Produtos'],
            ['movements', 'Movimentos'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setExpandedId(null);
            }}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              tab === value
                ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
                : 'border-border bg-surface text-ink-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}

        <LinkButton
          href="/painel/estoque/fornecedores"
          variant="ghost"
          size="sm"
          className="ml-auto"
        >
          Fornecedores
        </LinkButton>
      </div>

      {tab !== 'movements' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar no estoque"
              className="max-w-xs"
            />
            {tab === 'supply' ? (
              <Button
                variant={lowOnly ? 'primary' : 'secondary'}
                size="md"
                onClick={() => setLowOnly((value) => !value)}
              >
                Só abaixo do mínimo
              </Button>
            ) : null}
          </div>

          {stock.error ? (
            <Alert tone="danger" title="Não foi possível carregar o estoque.">
              {stock.error.message}
            </Alert>
          ) : null}

          {stock.loading && !stock.data ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : null}

          {stock.data && stock.data.items.length === 0 ? (
            <EmptyState
              title={
                tab === 'supply'
                  ? lowOnly
                    ? 'Nada abaixo do mínimo'
                    : 'Nenhum insumo com saldo'
                  : 'Nenhum produto com estoque contado'
              }
              description={
                tab === 'supply'
                  ? 'O saldo de um insumo nasce na primeira compra.'
                  : 'Só produtos configurados para contar unidades aparecem aqui.'
              }
            />
          ) : null}

          <ul className="space-y-2">
            {stock.data?.items.map((item) => (
              <li
                key={item.refId}
                className="overflow-hidden rounded-card border border-border bg-surface shadow-soft"
              >
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {tab === 'supply' ? (
                        <Link
                          href={`/painel/estoque/insumos/${item.refId}`}
                          className="truncate font-medium text-ink underline-offset-4 hover:underline"
                        >
                          {item.refName}
                        </Link>
                      ) : (
                        <p className="truncate font-medium text-ink">{item.refName}</p>
                      )}
                      {item.isLow ? <Badge tone="warning">Estoque baixo</Badge> : null}
                    </div>
                    {item.qtyReserved > 0 ? (
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {formatQty(item.qtyReserved, item.unit)} reservado em pedidos
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-medium text-ink" data-numeric>
                      {formatQty(item.qtyAvailable, item.unit)}
                    </p>
                    {item.qtyReserved > 0 ? (
                      <p className="text-sm text-ink-muted" data-numeric>
                        de {formatQty(item.qtyOnHand)}
                      </p>
                    ) : null}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpandedId((current) => (current === item.refId ? null : item.refId))
                    }
                    aria-expanded={expandedId === item.refId}
                  >
                    {expandedId === item.refId ? 'Fechar' : 'Corrigir'}
                  </Button>
                </div>

                {expandedId === item.refId ? (
                  <StockActions
                    item={item}
                    onDone={() => {
                      setExpandedId(null);
                      stock.reload();
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <MovementList result={movements} />
      )}
    </div>
  );
}

function MovementList({
  result,
}: {
  result: ReturnType<typeof useApi<ApiPage<StockMovement>>>;
}) {
  if (result.loading && !result.data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    );
  }

  if (result.data && result.data.items.length === 0) {
    return (
      <EmptyState
        title="Nenhum movimento ainda"
        description="Compras, vendas, produções e ajustes aparecem aqui."
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {result.data?.items.map((movement) => {
        const inbound = INBOUND_MOVEMENTS.has(movement.type);
        return (
          <li key={movement.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{movement.refName ?? '—'}</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {MOVEMENT_TYPE_LABELS[movement.type] ?? movement.type}
                {movement.reason ? ` · ${movement.reason}` : ''}
                {' · '}
                {formatDateTime(movement.createdAt)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  'font-medium',
                  inbound ? 'text-success-700' : 'text-ink',
                )}
                data-numeric
              >
                {inbound ? '+' : ''}
                {formatQty(movement.qtyDelta)}
              </p>
              <p className="text-sm text-ink-muted" data-numeric>
                saldo {formatQty(movement.balanceAfter)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
