'use client';

import type { DeliveryOrderDetail, PaymentMethod } from '@cantina/contracts';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Select, Textarea } from '../../../../../components/ui/field';
import {
  ORIGIN_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  ordersApi,
} from '../../../../../features/orders/api';
import { formatCents, formatDateTime, formatPhone, formatQty } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Detalhe do pedido.
 *
 * É a tela de exceção: no fluxo normal o balcão só usa o botão do cartão. Aqui
 * ficam as coisas que exigem atenção — pular etapa, cancelar com motivo,
 * registrar pagamento e conferir o que foi pedido.
 */
export default function PedidoPage() {
  const params = useParams<{ id: string }>();
  const order = useApi<DeliveryOrderDetail>(`/delivery-orders/${params.id}`);

  if (order.loading && !order.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (order.error || !order.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Pedido" back={{ href: '/painel/pedidos', label: 'Pedidos' }} />
        <Alert tone="danger" title="Pedido não encontrado.">
          {order.error?.message ?? 'Ele pode ter sido removido.'}
        </Alert>
      </div>
    );
  }

  const data = order.data;
  const finished = data.status === 'completed' || data.status === 'canceled';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Pedido #${data.code}`}
        description={`${ORIGIN_LABELS[data.origin] ?? data.origin} · ${formatDateTime(data.placedAt)}`}
        back={{ href: '/painel/pedidos', label: 'Pedidos' }}
        action={
          <Badge
            tone={
              data.status === 'canceled'
                ? 'danger'
                : data.status === 'completed'
                  ? 'success'
                  : 'primary'
            }
          >
            {data.statusLabel}
          </Badge>
        }
      />

      {data.status === 'canceled' && data.cancelReason ? (
        <Alert tone="danger" title="Pedido cancelado">
          {data.cancelReason}
        </Alert>
      ) : null}

      {!finished ? <StatusCard order={data} onChanged={order.reload} /> : null}

      <Card>
        <CardHeader title="Itens" />
        <CardBody className="space-y-3">
          {data.items.map((item) => (
            <div key={item.id} className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <span className="shrink-0 font-medium text-ink-soft" data-numeric>
                {formatQty(item.qty)}×
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ink">
                  {item.productName}
                  {item.variantName && item.variantName !== 'Padrão'
                    ? ` (${item.variantName})`
                    : ''}
                </p>
                {item.notes ? (
                  <p className="mt-0.5 text-sm text-ink-muted">obs: {item.notes}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-ink" data-numeric>
                {formatCents(item.totalCents)}
              </span>
            </div>
          ))}

          <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
            <Row label="Subtotal" value={formatCents(data.subtotalCents)} />
            {data.discountCents > 0 ? (
              <Row label="Desconto" value={`− ${formatCents(data.discountCents)}`} />
            ) : null}
            {data.deliveryFeeCents > 0 ? (
              <Row label="Entrega" value={formatCents(data.deliveryFeeCents)} />
            ) : null}
            <div className="flex justify-between pt-1.5 text-base font-medium text-ink">
              <dt>Total</dt>
              <dd data-numeric>{formatCents(data.totalCents)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cliente e entrega" />
        <CardBody className="space-y-3 text-sm">
          <div>
            <p className="text-ink">{data.customerName ?? 'Sem cliente'}</p>
            {data.customerPhone ? (
              <a
                href={`tel:${data.customerPhone}`}
                className="text-ink-muted underline-offset-4 hover:underline"
              >
                {formatPhone(data.customerPhone)}
              </a>
            ) : null}
          </div>

          <div className="border-t border-border pt-3">
            {data.fulfillment === 'pickup' ? (
              <p className="text-ink-soft">Retirada no local</p>
            ) : data.addressSnapshot ? (
              <address className="not-italic text-ink-soft">
                {[data.addressSnapshot.street, data.addressSnapshot.number]
                  .filter(Boolean)
                  .join(', ')}
                {data.addressSnapshot.complement ? ` — ${data.addressSnapshot.complement}` : ''}
                <br />
                {[data.addressSnapshot.neighborhood, data.addressSnapshot.city]
                  .filter(Boolean)
                  .join(' · ')}
                {data.addressSnapshot.reference ? (
                  <>
                    <br />
                    <span className="text-ink-muted">
                      Referência: {data.addressSnapshot.reference}
                    </span>
                  </>
                ) : null}
              </address>
            ) : (
              <p className="text-ink-muted">Sem endereço registrado.</p>
            )}
          </div>

          {data.notes ? (
            <p className="border-t border-border pt-3 text-ink-soft">
              <span className="text-ink-muted">Observações: </span>
              {data.notes}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <PaymentCard order={data} onChanged={order.reload} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-soft">
      <dt>{label}</dt>
      <dd data-numeric>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatusCard({
  order,
  onChanged,
}: {
  order: DeliveryOrderDetail;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState('');

  // A API já devolve para onde este pedido pode ir — não recalculamos aqui.
  const transitions = order.allowedTransitions.filter((status) => status !== 'canceled');

  return (
    <Card>
      <CardHeader title="Andamento" />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          {transitions.map((status, index) => (
            <Button
              key={status}
              // Só o próximo passo é primário; os demais são desvios.
              variant={index === 0 ? 'primary' : 'secondary'}
              loading={mutation.submitting}
              onClick={async () => {
                if (await mutation.run(() => ordersApi.changeStatus(order.id, status))) {
                  onChanged();
                }
              }}
            >
              {STATUS_ACTION_LABELS[status] ?? status}
            </Button>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          {canceling ? (
            <div className="space-y-3">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Por que o pedido foi cancelado?"
                aria-label="Motivo do cancelamento"
                autoFocus
                invalid={Boolean(mutation.fieldErrors['reason'])}
              />
              {mutation.fieldErrors['reason'] ? (
                <p className="text-sm text-danger-700">{mutation.fieldErrors['reason']}</p>
              ) : null}
              <p className="text-sm text-ink-muted">
                O estoque reservado volta automaticamente.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCanceling(false)}>
                  Voltar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={mutation.submitting}
                  onClick={async () => {
                    if (await mutation.run(() => ordersApi.cancel(order.id, { reason }))) {
                      setCanceling(false);
                      onChanged();
                    }
                  }}
                >
                  Cancelar pedido
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-700"
              onClick={() => setCanceling(true)}
            >
              Cancelar pedido
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

const STATUS_ACTION_LABELS: Record<string, string> = {
  confirmed: 'Confirmar',
  preparing: 'Iniciar preparo',
  ready: 'Marcar como pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Concluir',
};

/* -------------------------------------------------------------------------- */

function PaymentCard({
  order,
  onChanged,
}: {
  order: DeliveryOrderDetail;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [method, setMethod] = useState<PaymentMethod>(order.paymentMethod ?? 'pix');

  const paid = order.paymentStatus === 'paid';

  return (
    <Card>
      <CardHeader
        title="Pagamento"
        action={
          <Badge tone={paid ? 'success' : 'warning'}>
            {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {order.changeForCents ? (
          <p className="text-sm text-ink-soft">
            Troco para <strong data-numeric>{formatCents(order.changeForCents)}</strong> —
            levar {formatCents(order.changeForCents - order.totalCents)}.
          </p>
        ) : null}

        {paid ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              Recebido em {PAYMENT_METHOD_LABELS[order.paymentMethod ?? ''] ?? '—'}.
            </p>
            <Button
              variant="ghost"
              size="sm"
              loading={mutation.submitting}
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    ordersApi.registerPayment(order.id, {
                      method: order.paymentMethod ?? 'other',
                      status: 'pending',
                    }),
                  )
                ) {
                  onChanged();
                }
              }}
            >
              Desfazer
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <Select
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                aria-label="Forma de pagamento"
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              loading={mutation.submitting}
              onClick={async () => {
                if (
                  await mutation.run(() =>
                    ordersApi.registerPayment(order.id, { method, status: 'paid' }),
                  )
                ) {
                  onChanged();
                }
              }}
            >
              Marcar como pago
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
