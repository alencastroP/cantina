'use client';

import type {
  CostsReport,
  ProductsReport,
  ReportSummary,
  SalesGroupBy,
  SalesReport,
} from '@cantina/contracts';
import { useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../components/ui/feedback';
import { formatDayShort, reportPath, type ProductsOrderBy } from '../../../../features/reports/api';
import { BarList, Sparkline, StatCard, type BarRow } from '../../../../features/reports/charts';
import {
  defaultPeriod,
  PeriodPicker,
  type Period,
} from '../../../../features/reports/period-picker';
import { cn } from '../../../../lib/cn';
import { formatCents, formatPercent, formatQty } from '../../../../lib/format';
import { useApi } from '../../../../lib/use-api';

/**
 * Relatórios.
 *
 * A tela toda existe para responder três perguntas, nesta ordem: **quanto
 * entrou**, **quanto sobrou** e **por causa de quê**. Os indicadores vêm
 * primeiro porque são a resposta; os agrupamentos, depois, porque são a
 * explicação.
 *
 * Nenhuma conta acontece aqui — margem, ticket e participação vêm prontos do
 * servidor. Recalcular na tela é como um sistema acaba com duas margens
 * diferentes na mesma página.
 */

const GROUP_OPTIONS: Array<{ id: SalesGroupBy; label: string }> = [
  { id: 'day', label: 'Por dia' },
  { id: 'channel', label: 'Por canal' },
  { id: 'payment_method', label: 'Por pagamento' },
  { id: 'origin', label: 'Por origem' },
  { id: 'kind', label: 'Por tipo' },
];

const ORDER_OPTIONS: Array<{ id: ProductsOrderBy; label: string }> = [
  { id: 'revenue', label: 'Faturamento' },
  { id: 'qty', label: 'Quantidade' },
  { id: 'margin', label: 'Margem' },
];

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('past'));
  const [groupBy, setGroupBy] = useState<SalesGroupBy>('day');
  const [orderBy, setOrderBy] = useState<ProductsOrderBy>('revenue');

  const summary = useApi<ReportSummary>(reportPath.summary(period));
  const sales = useApi<SalesReport>(reportPath.sales(period, groupBy));
  const products = useApi<ProductsReport>(reportPath.products(period, orderBy, 10));
  const costs = useApi<CostsReport>(reportPath.costs(period));

  const loading = summary.loading && !summary.data;
  const data = summary.data;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Relatórios"
        description="O que entrou, o que sobrou e por causa de quê."
      />

      <PeriodPicker value={period} onChange={setPeriod} className="mb-5" />

      {summary.error ? (
        <Alert tone="danger" title="Não foi possível carregar o resumo." className="mb-5">
          {summary.error.message}
        </Alert>
      ) : null}

      {/* --- Os quatro números --- */}

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Faturamento"
          value={formatCents(data?.revenueCents ?? 0)}
          hint={`${data?.ordersCount ?? 0} pedidos concluídos`}
          tone="accent"
          loading={loading}
        />
        <StatCard
          label="Ticket médio"
          value={formatCents(data?.avgTicketCents ?? 0)}
          hint={
            data
              ? `${data.deliveryCount} do dia · ${data.preorderCount} encomendas`
              : undefined
          }
          loading={loading}
        />
        <StatCard
          label="Margem bruta"
          value={formatCents(data?.grossMarginCents ?? 0)}
          hint={
            data ? `${formatPercent(data.grossMarginPercent)} do faturamento` : undefined
          }
          tone={(data?.grossMarginCents ?? 0) < 0 ? 'negative' : 'positive'}
          loading={loading}
        />
        <StatCard
          label="Resultado"
          value={formatCents(data?.resultCents ?? 0)}
          hint="Margem bruta menos despesas pagas"
          tone={(data?.resultCents ?? 0) < 0 ? 'negative' : 'positive'}
          loading={loading}
        />
      </div>

      {/* A separação entre despesa e compra de insumo é a informação mais
          fácil de interpretar errado do relatório inteiro, então ela é dita
          por extenso em vez de ficar implícita num rodapé. */}
      <Card className="mb-6">
        <CardBody className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-ink-muted">Custo dos produtos vendidos</p>
            <p className="mt-0.5 tabular-nums text-ink">
              {formatCents(data?.costOfGoodsCents ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-ink-muted">Despesas pagas</p>
            <p className="mt-0.5 tabular-nums text-ink">
              {formatCents(data?.operatingExpensesCents ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-ink-muted">Compra de insumo</p>
            <p className="mt-0.5 tabular-nums text-ink">
              {formatCents(data?.supplyPurchasesCents ?? 0)}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Saiu do caixa, mas virou estoque — não entra no resultado.
            </p>
          </div>
        </CardBody>
      </Card>

      {data && data.receivableCents > 0 ? (
        <Alert tone="warning" title="Entregue e ainda não pago" className="mb-6">
          {formatCents(data.receivableCents)} em pedidos concluídos sem pagamento
          registrado. Eles contam no faturamento, mas ainda não no caixa.
        </Alert>
      ) : null}

      {/* --- Vendas --- */}

      <Card className="mb-6">
        <CardHeader
          title="Vendas"
          description="O mesmo faturamento, visto por ângulos diferentes."
          action={
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as SalesGroupBy)}
              aria-label="Agrupar vendas por"
              className="h-9 rounded-control border border-border bg-sunken px-2 text-sm text-ink"
            >
              {GROUP_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        />
        <CardBody>
          {sales.error ? (
            <Alert tone="danger">{sales.error.message}</Alert>
          ) : sales.loading && !sales.data ? (
            <Skeleton className="h-40" />
          ) : groupBy === 'day' ? (
            <Sparkline
              points={(sales.data?.rows ?? []).map((row) => ({
                label: formatDayShort(row.key),
                value: row.revenueCents,
              }))}
              format={formatCents}
            />
          ) : (
            <BarList
              rows={(sales.data?.rows ?? []).map<BarRow>((row) => ({
                key: row.key || row.label,
                label: row.label,
                value: row.revenueCents,
                display: formatCents(row.revenueCents),
                detail: `${row.ordersCount} pedidos · margem de ${formatPercent(row.marginPercent)}`,
              }))}
              emptyLabel="Nenhuma venda concluída no período."
            />
          )}
        </CardBody>
      </Card>

      {/* --- Produtos --- */}

      <Card className="mb-6">
        <CardHeader
          title="Produtos"
          description="Os dez primeiros do período."
          action={
            <div className="flex gap-1">
              {ORDER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setOrderBy(option.id)}
                  className={cn(
                    'rounded-control px-2.5 py-1 text-xs transition-colors',
                    orderBy === option.id
                      ? 'bg-clay-100 font-medium text-clay-700'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />
        <CardBody>
          {products.error ? (
            <Alert tone="danger">{products.error.message}</Alert>
          ) : products.loading && !products.data ? (
            <Skeleton className="h-40" />
          ) : (
            <BarList
              rows={(products.data?.rows ?? []).map<BarRow>((row) => ({
                key: row.productVariantId ?? `${row.productName}|${row.variantName ?? ''}`,
                label: row.variantName
                  ? `${row.productName} · ${row.variantName}`
                  : row.productName,
                value:
                  orderBy === 'qty'
                    ? row.qty
                    : orderBy === 'margin'
                      ? row.marginCents
                      : row.revenueCents,
                display:
                  orderBy === 'qty' ? formatQty(row.qty) : formatCents(row.revenueCents),
                detail: `${formatQty(row.qty)} un · margem de ${formatCents(row.marginCents)} (${formatPercent(row.marginPercent)}) · ${formatPercent(row.revenueSharePercent)} do total`,
              }))}
              emptyLabel="Nenhum item vendido no período."
            />
          )}
        </CardBody>
      </Card>

      {/* --- Insumos --- */}

      <Card>
        <CardHeader
          title="Insumos"
          description="O que foi consumido, o que se perdeu e o que foi comprado."
        />
        <CardBody>
          {costs.error ? (
            <Alert tone="danger">{costs.error.message}</Alert>
          ) : costs.loading && !costs.data ? (
            <Skeleton className="h-40" />
          ) : (costs.data?.rows.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              Nenhum movimento de insumo no período.
            </p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Comprado no período"
                  value={formatCents(costs.data?.totalPurchasedCents ?? 0)}
                />
                <StatCard
                  label="Perdido"
                  value={formatCents(costs.data?.totalLossCents ?? 0)}
                  tone={(costs.data?.totalLossCents ?? 0) > 0 ? 'negative' : 'neutral'}
                  hint="Estimado pelo custo médio atual"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-ink-muted">
                      <th className="pb-2 font-medium">Insumo</th>
                      <th className="pb-2 text-right font-medium">Consumido</th>
                      <th className="pb-2 text-right font-medium">Perdido</th>
                      <th className="pb-2 text-right font-medium">Comprado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(costs.data?.rows ?? []).map((row) => (
                      <tr key={row.supplyId}>
                        <td className="py-2.5 pr-3 text-ink">{row.supplyName}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-soft">
                          {formatQty(row.consumedQty, row.unit)}
                        </td>
                        <td
                          className={cn(
                            'py-2.5 text-right tabular-nums',
                            row.lostQty > 0 ? 'text-danger-700' : 'text-ink-muted',
                          )}
                        >
                          {row.lostQty > 0 ? formatQty(row.lostQty, row.unit) : '—'}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-ink-soft">
                          {row.purchasedCents > 0 ? formatCents(row.purchasedCents) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
