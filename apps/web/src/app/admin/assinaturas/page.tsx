'use client';

import type { SubscriptionStatus } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Alert, EmptyState, Skeleton } from '../../../components/ui/feedback';
import { adminApi } from '../../../features/admin/api';
import { useAdminApi } from '../../../features/admin/use-admin-api';
import { SUBSCRIPTION_STATUS_LABELS } from '../../../features/billing/api';
import { cn } from '../../../lib/cn';
import { formatCents, formatDate } from '../../../lib/format';

/**
 * Assinaturas.
 *
 * A lista de empresas responde "quem é o cliente"; esta responde "o que está
 * sendo cobrado". São recortes diferentes do mesmo dado, e mantê-los
 * separados evita uma tabela de doze colunas que ninguém lê inteira.
 */

const STATUSES: Array<{ id: SubscriptionStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'active', label: 'Ativas' },
  { id: 'past_due', label: 'Em atraso' },
  { id: 'trialing', label: 'Em teste' },
  { id: 'canceled', label: 'Canceladas' },
  { id: 'expired', label: 'Expiradas' },
];

const TONES: Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  trialing: 'warning',
  past_due: 'danger',
  canceled: 'neutral',
  expired: 'neutral',
};

export default function AssinaturasPage() {
  const [status, setStatus] = useState<SubscriptionStatus | 'all'>('all');

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (status !== 'all') params.set('status', status);
    return `?${params.toString()}`;
  }, [status]);

  const subscriptions = useAdminApi(() => adminApi.listSubscriptions(query), [query]);
  const items = subscriptions.data?.items ?? [];

  const total = items
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + item.priceCents, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-ink">Assinaturas</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {status === 'all' || status === 'active'
            ? `${formatCents(total)} por mês nas ativas desta página.`
            : 'O que está sendo cobrado de cada empresa.'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStatus(option.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              status === option.id
                ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
                : 'border-border bg-surface text-ink-soft hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {subscriptions.error ? (
        <Alert tone="danger" title="Não foi possível carregar as assinaturas.">
          {subscriptions.error.message}
        </Alert>
      ) : null}

      {subscriptions.loading && !subscriptions.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {subscriptions.data && items.length === 0 ? (
        <EmptyState
          title="Nenhuma assinatura"
          description="Nenhuma empresa contratou um plano com este status."
        />
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/admin/empresas/${item.tenantId}`}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-soft transition-colors hover:border-border-strong"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{item.tenantName}</p>
                <p className="truncate text-xs text-ink-muted">
                  {item.planName} · {item.provider}
                  {item.currentPeriodEnd
                    ? ` · válida até ${formatDate(item.currentPeriodEnd)}`
                    : ''}
                </p>
              </div>

              {item.overdueInvoices > 0 ? (
                <Badge tone="danger">{item.overdueInvoices} vencida(s)</Badge>
              ) : null}

              <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                {formatCents(item.priceCents)}
              </span>

              <Badge tone={TONES[item.status]}>
                {SUBSCRIPTION_STATUS_LABELS[item.status]}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
