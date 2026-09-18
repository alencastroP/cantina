'use client';

import type { Cashflow, FinanceEntry, Page as ApiPage } from '@cantina/contracts';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Input } from '../../../../components/ui/field';
import {
  isAutomatic,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  financeApi,
} from '../../../../features/finance/api';
import { formatDayShort } from '../../../../features/reports/api';
import { Sparkline, StatCard } from '../../../../features/reports/charts';
import {
  defaultPeriod,
  PeriodPicker,
  type Period,
} from '../../../../features/reports/period-picker';
import { cn } from '../../../../lib/cn';
import { formatCents, formatDate } from '../../../../lib/format';
import { useApi, useDebounced, useMutation } from '../../../../lib/use-api';

/**
 * Financeiro.
 *
 * A tela responde uma pergunta antes de qualquer outra: **dá para pagar o que
 * vence esta semana?** Por isso o fluxo de caixa vem primeiro e o vencido
 * aparece em vermelho no topo — não numa aba que ninguém abre.
 *
 * A lista embaixo é a mesma coisa em detalhe, e a baixa acontece ali mesmo:
 * pagar uma conta não deveria custar dois cliques e uma tela nova.
 */

type StatusFilter = 'all' | 'open' | 'overdue' | 'paid';
type DirectionFilter = 'all' | 'in' | 'out';

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'overdue', label: 'Vencidos' },
  { id: 'open', label: 'Em aberto' },
  { id: 'paid', label: 'Pagos' },
];

export default function FinanceiroPage() {
  const [period, setPeriod] = useState<Period>(() => defaultPeriod('ahead'));
  const [status, setStatus] = useState<StatusFilter>('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50', from: period.from, to: period.to });
    if (status !== 'all') params.set('status', status);
    if (direction !== 'all') params.set('direction', direction);
    if (debounced.length >= 2) params.set('q', debounced);
    return `?${params.toString()}`;
  }, [period, status, direction, debounced]);

  const entries = useApi<ApiPage<FinanceEntry>>(`/finance/entries${query}`);
  const cashflow = useApi<Cashflow>(
    `/finance/cashflow?from=${period.from}&to=${period.to}`,
  );

  const settle = useMutation();
  const [settling, setSettling] = useState<string | null>(null);

  const items = entries.data?.items ?? [];
  const totals = cashflow.data?.totals;

  const onSettle = async (entry: FinanceEntry) => {
    setSettling(entry.id);
    const done = await settle.run(() => financeApi.settleEntry(entry.id, {}));
    setSettling(null);
    if (done) {
      entries.reload();
      cashflow.reload();
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Financeiro"
        description="Contas a pagar, a receber e o caixa projetado."
        action={
          <div className="flex gap-2">
            <LinkButton href="/painel/financeiro/ajustes" variant="ghost" size="sm">
              Contas e recorrências
            </LinkButton>
            <LinkButton href="/painel/financeiro/novo" variant="primary" size="sm">
              Novo lançamento
            </LinkButton>
          </div>
        }
      />

      <PeriodPicker value={period} onChange={setPeriod} direction="ahead" className="mb-5" />

      {cashflow.error ? (
        <Alert tone="danger" title="Não foi possível carregar o caixa." className="mb-5">
          {cashflow.error.message}
        </Alert>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Entradas no período"
          value={formatCents(totals?.inCents ?? 0)}
          tone="positive"
          loading={cashflow.loading && !cashflow.data}
        />
        <StatCard
          label="Saídas no período"
          value={formatCents(totals?.outCents ?? 0)}
          tone="negative"
          loading={cashflow.loading && !cashflow.data}
        />
        <StatCard
          label="Resultado"
          value={formatCents(totals?.netCents ?? 0)}
          tone={(totals?.netCents ?? 0) < 0 ? 'negative' : 'positive'}
          hint="Entradas menos saídas, pelo vencimento"
          loading={cashflow.loading && !cashflow.data}
        />
        <StatCard
          label="Vencido"
          value={formatCents((totals?.overdueOutCents ?? 0) + (totals?.overdueInCents ?? 0))}
          tone={
            (totals?.overdueOutCents ?? 0) + (totals?.overdueInCents ?? 0) > 0
              ? 'negative'
              : 'neutral'
          }
          hint={
            totals && totals.overdueInCents > 0
              ? `${formatCents(totals.overdueInCents)} a receber`
              : 'Em aberto com vencimento passado'
          }
          loading={cashflow.loading && !cashflow.data}
        />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Saldo dia a dia"
          description="Cheio até hoje, tracejado no que ainda vai vencer."
        />
        <CardBody>
          {cashflow.loading && !cashflow.data ? (
            <Skeleton className="h-32" />
          ) : (
            <Sparkline
              points={(cashflow.data?.days ?? []).map((day) => ({
                label: formatDayShort(day.date),
                value: day.balanceCents,
                projected: day.projected,
              }))}
              format={formatCents}
            />
          )}
        </CardBody>
      </Card>

      {/* --- Lista --- */}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              active={status === filter.id}
              onClick={() => setStatus(filter.id)}
            >
              {filter.label}
            </FilterChip>
          ))}
          <span className="w-px bg-border" aria-hidden="true" />
          {(
            [
              ['all', 'Entradas e saídas'],
              ['in', 'Só entradas'],
              ['out', 'Só saídas'],
            ] as const
          ).map(([id, label]) => (
            <FilterChip key={id} active={direction === id} onClick={() => setDirection(id)}>
              {label}
            </FilterChip>
          ))}
        </div>

        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar na descrição…"
          aria-label="Buscar lançamentos"
          className="max-w-sm"
        />
      </div>

      {settle.error ? (
        <Alert tone="danger" title="Não foi possível dar baixa." className="mb-4">
          {settle.error}
        </Alert>
      ) : null}

      {entries.error ? (
        <Alert tone="danger" title="Não foi possível carregar os lançamentos.">
          {entries.error.message}
        </Alert>
      ) : null}

      {entries.loading && !entries.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {entries.data && items.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento no período"
          description={
            debounced || status !== 'all' || direction !== 'all'
              ? 'Tente outro filtro ou um período maior.'
              : 'Pedidos concluídos e compras de insumo entram aqui sozinhos.'
          }
          action={
            <LinkButton href="/painel/financeiro/novo" variant="primary">
              Lançar manualmente
            </LinkButton>
          }
        />
      ) : null}

      <ul className="space-y-2">
        {items.map((entry) => (
          <li key={entry.id}>
            <EntryRow
              entry={entry}
              settling={settling === entry.id}
              onSettle={() => void onSettle(entry)}
            />
          </li>
        ))}
      </ul>

      {entries.data?.nextCursor ? (
        <p className="mt-4 text-center text-sm text-ink-muted">
          Mostrando os 50 mais recentes do período. Reduza o intervalo para ver o resto.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
        active
          ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
          : 'border-border bg-surface text-ink-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function EntryRow({
  entry,
  settling,
  onSettle,
}: {
  entry: FinanceEntry;
  settling: boolean;
  onSettle: () => void;
}) {
  const isIn = entry.direction === 'in';
  const paid = entry.status === 'paid';

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-soft">
      {/* Barra de cor em vez de ícone: entrada e saída se distinguem de
          relance, e a cor não é a única pista — o valor tem sinal. */}
      <span
        aria-hidden="true"
        className={cn('h-9 w-1 shrink-0 rounded-full', isIn ? 'bg-success-500' : 'bg-clay-400')}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{entry.description}</p>
        <p className="truncate text-xs text-ink-muted">
          {paid && entry.paidAt
            ? `Pago em ${formatDate(entry.paidAt)}`
            : `Vence em ${formatDate(entry.dueDate)}`}
          {entry.categoryName ? ` · ${entry.categoryName}` : ''}
          {isAutomatic(entry.source) ? ` · ${SOURCE_LABELS[entry.source] ?? entry.source}` : ''}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'tabular-nums',
            isIn ? 'text-success-700' : 'text-ink',
            paid && 'font-medium',
          )}
        >
          {isIn ? '+' : '−'}
          {formatCents(paid ? entry.paidAmountCents || entry.amountCents : entry.amountCents)}
        </p>
        <Badge tone={STATUS_TONES[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
      </div>

      {entry.status === 'open' || entry.status === 'overdue' ? (
        <Button size="sm" variant="secondary" loading={settling} onClick={onSettle}>
          Dar baixa
        </Button>
      ) : null}
    </div>
  );
}
