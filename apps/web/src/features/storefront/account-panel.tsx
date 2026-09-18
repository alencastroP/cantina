'use client';

import type { StorefrontOrder, StorefrontPreorder } from '@cantina/contracts';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

import { CalendarIcon, OrdersIcon, ScooterIcon } from '../../components/layout/icons';
import { Badge, type BadgeTone } from '../../components/ui/badge';
import { storefrontFetch } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatCents, formatDateTime } from '../../lib/format';
import { useOrderHistory, type OrderHistoryEntry } from './order-history';
import { Sheet, SheetHeader } from './sheet';
import { useStorePaths } from './store-paths';

/** Pílula de vidro sobre a capa — legível em qualquer foto. */
export const GLASS_PILL =
  'inline-flex items-center gap-1.5 rounded-full bg-sand-900/35 px-3.5 py-2 text-sm font-medium text-sand-50 ring-1 ring-inset ring-sand-50/25 backdrop-blur-md transition-[background-color,transform] duration-200 hover:bg-sand-900/50 active:scale-95';

/**
 * "Meus pedidos" e a folha que ele abre.
 *
 * Sem conta de cliente (D4): o que abre aqui é o histórico DESTE aparelho
 * (`useOrderHistory`), reconsultado pelo mesmo caminho código+telefone que a
 * página de acompanhamento já usa — nenhuma rota nova de autenticação. Cada
 * linha leva a cor do seu modo, para "pedido de hoje" e "encomenda de sábado"
 * não se confundirem nem aqui.
 */
export function AccountButton({ host }: { host: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={GLASS_PILL}>
        <OrdersIcon size={17} />
        Meus pedidos
      </button>

      <AccountPanel host={host} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type Tracked =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ok'; status: string; statusLabel: string; totalCents: number };

function entryKey(entry: OrderHistoryEntry): string {
  return `${entry.kind}:${entry.code}`;
}

function statusTone(status: string): BadgeTone {
  if (status === 'completed') return 'success';
  if (status === 'canceled') return 'danger';
  return 'neutral';
}

function AccountPanel({
  host,
  open,
  onClose,
}: {
  host: string;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const { href } = useStorePaths(host);
  const { entries, ready, clear } = useOrderHistory(host);
  const [tracked, setTracked] = useState<Record<string, Tracked>>({});

  useEffect(() => {
    if (!open || !ready || entries.length === 0) return;

    setTracked(Object.fromEntries(entries.map((entry) => [entryKey(entry), { state: 'loading' }])));

    entries.forEach((entry) => {
      const path =
        entry.kind === 'order'
          ? `/orders/${entry.code}?phone=${encodeURIComponent(entry.phone)}`
          : `/preorders/${entry.code}?phone=${encodeURIComponent(entry.phone)}`;

      storefrontFetch<StorefrontOrder | StorefrontPreorder>(path, { tenantHost: host })
        .then((result) => {
          setTracked((current) => ({
            ...current,
            [entryKey(entry)]: {
              state: 'ok',
              status: result.status,
              statusLabel: result.statusLabel,
              totalCents: result.totalCents,
            },
          }));
        })
        .catch(() => {
          setTracked((current) => ({ ...current, [entryKey(entry)]: { state: 'error' } }));
        });
    });
    // Só quando a folha abre ou o histórico muda — não a cada render de `tracked`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, entries, host]);

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <SheetHeader
        id={titleId}
        title="Meus pedidos"
        description="Guardados neste aparelho — não precisa de login."
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {!ready ? null : entries.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-ink-muted">
            Nada por aqui ainda. Depois do primeiro pedido, ele aparece nesta lista para você
            acompanhar.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {entries.map((entry, index) => {
                const status = tracked[entryKey(entry)];
                const isOrder = entry.kind === 'order';
                const query = `?phone=${encodeURIComponent(entry.phone)}${isOrder ? '' : '&kind=preorder'}`;

                return (
                  <li
                    key={entryKey(entry)}
                    data-mode={isOrder ? 'now' : 'later'}
                    className="animate-rise"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <Link
                      href={href(`/pedido/${entry.code}${query}`)}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-sand-100"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mode-tint text-mode-ink">
                        {isOrder ? <ScooterIcon size={19} /> : <CalendarIcon size={19} />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {isOrder ? 'Pedido' : 'Encomenda'}{' '}
                          <span data-numeric>#{entry.code}</span>
                        </p>
                        <p className="text-xs text-ink-muted">{formatDateTime(entry.placedAt)}</p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {status?.state === 'ok' ? (
                          <>
                            <span className="text-sm font-medium text-ink" data-numeric>
                              {formatCents(status.totalCents)}
                            </span>
                            <Badge
                              tone={statusTone(status.status)}
                              className={cn(
                                !['completed', 'canceled'].includes(status.status) &&
                                  'bg-mode-tint text-mode-ink',
                              )}
                            >
                              {status.statusLabel}
                            </Badge>
                          </>
                        ) : status?.state === 'error' ? (
                          <span className="text-xs text-ink-muted">indisponível</span>
                        ) : (
                          <span aria-hidden="true" className="shimmer h-5 w-20 rounded-full" />
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={clear}
              className="mx-2 mt-4 text-sm text-ink-muted underline-offset-4 hover:underline"
            >
              Esquecer histórico neste aparelho
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
