'use client';

import type { TenantStatus } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../components/ui/feedback';
import { Input } from '../../../components/ui/field';
import { adminApi } from '../../../features/admin/api';
import { useAdminApi } from '../../../features/admin/use-admin-api';
import { useAdminSession } from '../../../features/admin/session';
import {
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONES,
} from '../../../features/billing/api';
import { cn } from '../../../lib/cn';
import { formatCents, formatDate } from '../../../lib/format';
import { useDebounced } from '../../../lib/use-api';
import { NewTenantForm } from './new-tenant-form';

/**
 * Empresas assinantes.
 *
 * O filtro por status é o que mais se usa: "quem está em atraso" e "quem está
 * em teste" são as duas perguntas que abrem esta tela. A busca por nome ou
 * endereço serve para quando o suporte já sabe de quem se trata.
 */

const STATUSES: Array<{ id: TenantStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'trial', label: 'Em teste' },
  { id: 'active', label: 'Ativas' },
  { id: 'past_due', label: 'Em atraso' },
  { id: 'suspended', label: 'Suspensas' },
  { id: 'canceled', label: 'Canceladas' },
];

export default function EmpresasPage() {
  const { session } = useAdminSession();
  const canWrite = session?.user.role === 'owner';

  const [status, setStatus] = useState<TenantStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (status !== 'all') params.set('status', status);
    if (debounced.length >= 2) params.set('q', debounced);
    return `?${params.toString()}`;
  }, [status, debounced]);

  const tenants = useAdminApi(() => adminApi.listTenants(query), [query]);
  const items = tenants.data?.items ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">Empresas</h1>
          <p className="mt-1 text-sm text-ink-muted">Quem assina a Cantina.</p>
        </div>

        {canWrite ? (
          <Button
            variant={creating ? 'ghost' : 'primary'}
            size="sm"
            onClick={() => setCreating(!creating)}
          >
            {creating ? 'Cancelar' : 'Nova empresa'}
          </Button>
        ) : null}
      </header>

      {creating ? (
        <NewTenantForm
          onCreated={() => {
            setCreating(false);
            tenants.reload();
          }}
        />
      ) : null}

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

      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome ou endereço…"
        aria-label="Buscar empresas"
        className="max-w-sm"
      />

      {tenants.error ? (
        <Alert tone="danger" title="Não foi possível carregar as empresas.">
          {tenants.error.message}
        </Alert>
      ) : null}

      {tenants.loading && !tenants.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {tenants.data && items.length === 0 ? (
        <EmptyState
          title="Nenhuma empresa encontrada"
          description="Tente outro filtro ou outro termo de busca."
        />
      ) : null}

      <ul className="space-y-2">
        {items.map((tenant) => (
          <li key={tenant.id}>
            <Link
              href={`/admin/empresas/${tenant.id}`}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-soft transition-colors hover:border-border-strong"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{tenant.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {tenant.slug}
                  {tenant.plan ? ` · ${tenant.plan.name}` : ' · sem plano'}
                  {tenant.trialEndsAt && tenant.status === 'trial'
                    ? ` · teste até ${formatDate(tenant.trialEndsAt)}`
                    : ''}
                </p>
              </div>

              {tenant.overdueInvoices > 0 ? (
                <Badge tone="danger">
                  {tenant.overdueInvoices}{' '}
                  {tenant.overdueInvoices === 1 ? 'fatura vencida' : 'faturas vencidas'}
                </Badge>
              ) : null}

              {tenant.plan ? (
                <span className="hidden shrink-0 text-sm tabular-nums text-ink-muted sm:block">
                  {formatCents(tenant.plan.priceCents)}
                </span>
              ) : null}

              <Badge tone={TENANT_STATUS_TONES[tenant.status]}>
                {TENANT_STATUS_LABELS[tenant.status]}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>

      {tenants.data?.nextCursor ? (
        <p className="text-center text-sm text-ink-muted">
          Mostrando as 50 mais recentes. Use o filtro ou a busca para chegar às demais.
        </p>
      ) : null}
    </div>
  );
}
