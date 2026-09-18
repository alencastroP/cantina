'use client';

import type { DeliveryOrder } from '@cantina/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { formatCents, formatElapsed } from '../../lib/format';
import { ORIGIN_LABELS, nextStatus, ordersApi } from './api';

/**
 * Cartão do pedido no board.
 *
 * O que fica grande é o que o balcão precisa de longe: o número do pedido, o
 * tempo de espera e o botão de avançar. Valor e origem ficam menores — eles
 * importam na conferência, não na operação.
 *
 * O tempo é destacado quando passa de 30 minutos: é o sinal de que algo
 * travou, e é o único alarme que este cartão precisa dar.
 */
const LATE_MINUTES = 30;

export function OrderCard({
  order,
  nextLabel,
  onChanged,
}: {
  order: DeliveryOrder;
  /** Rótulo que a empresa deu ao próximo status (D18). */
  nextLabel: string | null;
  onChanged: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = nextStatus(order);
  const waitingMinutes = Math.floor(
    (Date.now() - new Date(order.placedAt).getTime()) / 60_000,
  );
  const late = waitingMinutes >= LATE_MINUTES;

  async function advance() {
    if (!next) return;
    setMoving(true);
    setError(null);
    try {
      await ordersApi.changeStatus(order.id, next);
      onChanged();
    } catch {
      // A mensagem exata vem da API na tela de detalhe; aqui basta avisar que
      // não andou, para o atendente não achar que andou.
      setError('Não foi possível avançar. Abra o pedido.');
      setMoving(false);
    }
  }

  return (
    <article className="rounded-card border border-border bg-surface p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/painel/pedidos/${order.id}`}
          className="min-w-0 flex-1 transition-colors hover:text-clay-600"
        >
          <p className="font-display text-lg leading-none text-ink" data-numeric>
            #{order.code}
          </p>
          <p className="mt-1 truncate text-sm text-ink-soft">
            {order.customerName ?? 'Sem cliente'}
          </p>
        </Link>

        <div className="shrink-0 text-right">
          <p className="font-medium text-ink" data-numeric>
            {formatCents(order.totalCents)}
          </p>
          <p
            className={
              late ? 'text-sm font-medium text-danger-700' : 'text-sm text-ink-muted'
            }
          >
            {formatElapsed(order.placedAt)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={order.fulfillment === 'pickup' ? 'accent' : 'neutral'}>
          {order.fulfillment === 'pickup' ? 'Retirada' : 'Entrega'}
        </Badge>
        <Badge>{ORIGIN_LABELS[order.origin] ?? order.origin}</Badge>
        {order.paymentStatus === 'paid' ? <Badge tone="success">Pago</Badge> : null}
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
