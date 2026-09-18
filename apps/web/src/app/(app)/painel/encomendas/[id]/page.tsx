'use client';

import type { PaymentMethod, PreorderDetail } from '@cantina/contracts';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import { Form } from '../../../../../components/ui/form';
import {
  preordersApi,
  PREORDER_ACTION_LABELS,
} from '../../../../../features/preorders/api';
import { PAYMENT_METHOD_LABELS } from '../../../../../features/orders/api';
import {
  formatCents,
  formatDate,
  formatDateTime,
  formatPhone,
  formatQty,
} from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Detalhe da encomenda.
 *
 * Além do que o pedido de delivery tem, aqui estão as duas coisas próprias:
 * a data combinada — que pode ser trocada, movendo a vaga na agenda — e o
 * sinal.
 */
export default function EncomendaPage() {
  const params = useParams<{ id: string }>();
  const preorder = useApi<PreorderDetail>(`/preorders/${params.id}`);

  if (preorder.loading && !preorder.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (preorder.error || !preorder.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Encomenda" back={{ href: '/painel/encomendas', label: 'Encomendas' }} />
        <Alert tone="danger" title="Encomenda não encontrada.">
          {preorder.error?.message ?? 'Ela pode ter sido removida.'}
        </Alert>
      </div>
    );
  }

  const data = preorder.data;
  const finished = data.status === 'completed' || data.status === 'canceled';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Encomenda #${data.code}`}
        description={`Pedida em ${formatDateTime(data.placedAt)}`}
        back={{ href: '/painel/encomendas', label: 'Encomendas' }}
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
        <Alert tone="danger" title="Encomenda cancelada">
          {data.cancelReason}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Para quando" />
        <CardBody>
          <p className="font-display text-2xl text-ink">
            {formatDate(data.dueDate)}
            {data.dueTime ? (
              <span className="text-lg text-ink-soft"> às {data.dueTime}</span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {data.fulfillment === 'pickup' ? 'Retirada no local' : 'Entrega'}
          </p>
        </CardBody>
      </Card>

      {!finished ? <StatusCard preorder={data} onChanged={preorder.reload} /> : null}

      <Card>
        <CardHeader title="Itens" />
        <CardBody className="space-y-3">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
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
            <div className="flex justify-between text-ink-soft">
              <dt>Subtotal</dt>
              <dd data-numeric>{formatCents(data.subtotalCents)}</dd>
            </div>
            {data.discountCents > 0 ? (
              <div className="flex justify-between text-ink-soft">
                <dt>Desconto</dt>
                <dd data-numeric>− {formatCents(data.discountCents)}</dd>
              </div>
            ) : null}
            {data.deliveryFeeCents > 0 ? (
              <div className="flex justify-between text-ink-soft">
                <dt>Entrega</dt>
                <dd data-numeric>{formatCents(data.deliveryFeeCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between pt-1.5 text-base font-medium text-ink">
              <dt>Total</dt>
              <dd data-numeric>{formatCents(data.totalCents)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Cliente" />
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

          {data.fulfillment === 'delivery' && data.addressSnapshot ? (
            <address className="not-italic text-ink-soft">
              {[data.addressSnapshot.street, data.addressSnapshot.number]
                .filter(Boolean)
                .join(', ')}
              {data.addressSnapshot.complement ? ` — ${data.addressSnapshot.complement}` : ''}
              <br />
              {[data.addressSnapshot.neighborhood, data.addressSnapshot.city]
                .filter(Boolean)
                .join(' · ')}
            </address>
          ) : null}

          {data.notes ? (
            <p className="border-t border-border pt-3 text-ink-soft">
              <span className="text-ink-muted">Observações: </span>
              {data.notes}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <DepositCard preorder={data} onChanged={preorder.reload} />

      {!finished ? <RescheduleCard preorder={data} onChanged={preorder.reload} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatusCard({
  preorder,
  onChanged,
}: {
  preorder: PreorderDetail;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState('');

  const transitions = preorder.allowedTransitions.filter((status) => status !== 'canceled');

  return (
    <Card>
      <CardHeader title="Andamento" />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          {transitions.map((status, index) => (
            <Button
              key={status}
              variant={index === 0 ? 'primary' : 'secondary'}
              loading={mutation.submitting}
              onClick={async () => {
                if (await mutation.run(() => preordersApi.changeStatus(preorder.id, status))) {
                  onChanged();
                }
              }}
            >
              {PREORDER_ACTION_LABELS[status] ?? status}
            </Button>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          {canceling ? (
            <div className="space-y-3">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Por que a encomenda foi cancelada?"
                aria-label="Motivo do cancelamento"
                autoFocus
                invalid={Boolean(mutation.fieldErrors['reason'])}
              />
              <p className="text-sm text-ink-muted">
                O estoque reservado e a vaga na agenda voltam automaticamente.
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
                    if (await mutation.run(() => preordersApi.cancel(preorder.id, { reason }))) {
                      setCanceling(false);
                      onChanged();
                    }
                  }}
                >
                  Cancelar encomenda
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
              Cancelar encomenda
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function DepositCard({
  preorder,
  onChanged,
}: {
  preorder: PreorderDetail;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [amount, setAmount] = useState(
    preorder.depositCents || Math.round(preorder.totalCents / 2),
  );
  const [method, setMethod] = useState<PaymentMethod>(preorder.paymentMethod ?? 'pix');

  const paid = preorder.depositPaidAt !== null;
  const remaining = preorder.totalCents - preorder.depositCents;

  return (
    <Card>
      <CardHeader
        title="Sinal"
        description="Registrado aqui, cobrado por fora."
        {...(paid ? { action: <Badge tone="success">Recebido</Badge> } : {})}
      />
      <CardBody className="space-y-4">
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        {paid ? (
          <div className="space-y-2 text-sm">
            <p className="text-ink">
              <strong data-numeric>{formatCents(preorder.depositCents)}</strong> em{' '}
              {PAYMENT_METHOD_LABELS[preorder.paymentMethod ?? ''] ?? '—'}.
            </p>
            {remaining > 0 ? (
              <p className="text-ink-muted">
                Faltam <strong data-numeric>{formatCents(remaining)}</strong> na entrega.
              </p>
            ) : (
              <p className="text-success-700">Encomenda paga por completo.</p>
            )}
          </div>
        ) : (
          <Form
            className="flex flex-wrap items-end gap-3"
            fieldErrors={mutation.fieldErrors}
            error={mutation.error}
            onSubmit={async () => {
              if (amount <= 0) return;
              if (
                await mutation.run(() =>
                  preordersApi.registerDeposit(preorder.id, {
                    amountCents: amount,
                    method,
                  }),
                )
              ) {
                onChanged();
              }
            }}
          >
            <Field
              label="Valor do sinal"
              error={mutation.fieldErrors['amountCents']}
              className="min-w-36 flex-1"
            >
              {(props) => (
                <CurrencyInput {...props} value={amount} onValueChange={setAmount} />
              )}
            </Field>
            <Field label="Forma de pagamento" className="min-w-36 flex-1">
              {(props) => (
                <Select
                  {...props}
                  value={method}
                  onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              type="submit"
              variant="secondary"
              disabled={amount <= 0}
              loading={mutation.submitting}
            >
              Registrar sinal
            </Button>
          </Form>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Remarcar.
 *
 * Trocar a data move a vaga na agenda: o servidor reserva a nova antes de
 * liberar a antiga, então uma data lotada mantém tudo como estava — e a
 * mensagem de erro diz o porquê.
 */
function RescheduleCard({
  preorder,
  onChanged,
}: {
  preorder: PreorderDetail;
  onChanged: () => void;
}) {
  const mutation = useMutation();
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(preorder.dueDate);
  const [dueTime, setDueTime] = useState(preorder.dueTime ?? '');

  return (
    <Card>
      <CardBody className="space-y-3">
        {mutation.error ? <Alert tone="warning">{mutation.error}</Alert> : null}

        {open ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nova data" error={mutation.fieldErrors['dueDate']} required>
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Horário combinado">
                {(props) => (
                  <Input
                    {...props}
                    type="time"
                    value={dueTime}
                    onChange={(event) => setDueTime(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={mutation.submitting}
                onClick={async () => {
                  if (
                    await mutation.run(() =>
                      preordersApi.update(preorder.id, {
                        dueDate,
                        dueTime: dueTime || null,
                      }),
                    )
                  ) {
                    setOpen(false);
                    onChanged();
                  }
                }}
              >
                Remarcar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Remarcar</p>
              <p className="text-sm text-ink-muted">
                A vaga muda de dia junto. Se o novo dia estiver lotado, nada é alterado.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Mudar data
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
