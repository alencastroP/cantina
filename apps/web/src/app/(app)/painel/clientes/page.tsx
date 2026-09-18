'use client';

import type { Page as ApiPage, Customer } from '@cantina/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../../../components/layout/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Button, LinkButton } from '../../../../components/ui/button';
import { Alert, EmptyState, Skeleton } from '../../../../components/ui/feedback';
import { Input } from '../../../../components/ui/field';
import { cn } from '../../../../lib/cn';
import { formatCents, formatElapsed, formatPhone } from '../../../../lib/format';
import { useApi, useDebounced } from '../../../../lib/use-api';

/**
 * Clientes.
 *
 * A busca aceita nome ou telefone no mesmo campo — quem atende digita o que
 * tiver na mão, e obrigar a escolher o campo antes é atrito no meio do
 * pedido.
 *
 * A ordenação por atividade é o padrão que a operação quer ("quem comprou por
 * último"); por cadastro serve para conferência.
 */
export default function ClientesPage() {
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState(true);
  const debounced = useDebounced(search);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (debounced.length >= 2) params.set('q', debounced);
    if (recent) params.set('recent', 'true');
    return `?${params.toString()}`;
  }, [debounced, recent]);

  const customers = useApi<ApiPage<Customer>>(`/customers${query}`);
  const items = customers.data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Clientes"
        description="Quem já comprou com você."
        action={
          <LinkButton href="/painel/clientes/novo" variant="primary" size="sm">
            Novo cliente
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou telefone…"
          aria-label="Buscar clientes"
          className="max-w-sm"
        />
        <div className="flex gap-2">
          {(
            [
              [true, 'Compraram recentemente'],
              [false, 'Cadastro mais novo'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setRecent(value)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                recent === value
                  ? 'border-clay-300 bg-clay-100 font-medium text-clay-700'
                  : 'border-border bg-surface text-ink-soft hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {customers.error ? (
        <Alert tone="danger" title="Não foi possível carregar os clientes.">
          {customers.error.message}
        </Alert>
      ) : null}

      {customers.loading && !customers.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {customers.data && items.length === 0 ? (
        debounced ? (
          <EmptyState
            title="Nenhum cliente encontrado"
            description="Tente outro nome ou telefone."
            action={
              <Button variant="secondary" onClick={() => setSearch('')}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nenhum cliente ainda"
            description="O cadastro é criado sozinho quando alguém faz o primeiro pedido."
            action={
              <LinkButton href="/painel/clientes/novo" variant="primary">
                Cadastrar cliente
              </LinkButton>
            }
          />
        )
      ) : null}

      <ul className="space-y-2">
        {items.map((customer) => (
          <li key={customer.id}>
            <Link
              href={`/painel/clientes/${customer.id}`}
              className="flex items-center gap-4 rounded-card border border-border bg-surface px-4 py-3 shadow-soft transition-colors hover:border-border-strong hover:bg-sand-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">{customer.name}</p>
                  {customer.anonymizedAt ? <Badge>Anonimizado</Badge> : null}
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {customer.anonymizedAt ? '—' : formatPhone(customer.phone)}
                  {customer.lastOrderAt ? ` · ${formatElapsed(customer.lastOrderAt)}` : ''}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-medium text-ink" data-numeric>
                  {formatCents(customer.totalSpentCents)}
                </p>
                <p className="text-sm text-ink-muted" data-numeric>
                  {customer.ordersCount === 1
                    ? '1 pedido'
                    : `${customer.ordersCount} pedidos`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
