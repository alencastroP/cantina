'use client';

import type { DayAvailability, PaymentMethod } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Alert, Skeleton } from '../../../../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import {
  CartLines,
  ItemPicker,
  type CartLine,
} from '../../../../../features/orders/item-picker';
import { PAYMENT_METHOD_LABELS } from '../../../../../features/orders/api';
import { preordersApi } from '../../../../../features/preorders/api';
import { DatePicker, dateRange } from '../../../../../features/preorders/date-picker';
import { formatCents } from '../../../../../lib/format';
import { useApi, useMutation } from '../../../../../lib/use-api';

/**
 * Encomenda lançada no balcão.
 *
 * A data vem primeiro, e não por acaso: é ela que pode não estar disponível, e
 * descobrir isso depois de montar o pedido inteiro seria trabalho jogado fora.
 */
export default function NovaEncomendaPage() {
  const router = useRouter();
  const mutation = useMutation();

  const range = useMemo(() => dateRange(90), []);
  const days = useApi<DayAvailability[]>(
    `/availability/days?from=${range.from}&to=${range.to}`,
  );

  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('pickup');
  const [lines, setLines] = useState<CartLine[]>([]);

  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');

  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [discountCents, setDiscountCents] = useState(0);
  const [depositCents, setDepositCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');

  const subtotal = lines.reduce((total, line) => total + line.unitPriceCents * line.qty, 0);
  const total = subtotal - discountCents + (fulfillment === 'delivery' ? deliveryFeeCents : 0);

  const canSubmit =
    Boolean(dueDate) &&
    lines.length > 0 &&
    name.trim().length >= 2 &&
    phone.replace(/\D/g, '').length >= 10 &&
    (fulfillment === 'pickup' || street.trim().length >= 3);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dueDate) return;

    const created = await mutation.run(() =>
      preordersApi.create({
        customer: { name: name.trim(), phone: phone.trim() },
        dueDate,
        ...(dueTime ? { dueTime } : {}),
        fulfillment,
        items: lines.map((line) => ({
          productVariantId: line.productVariantId,
          qty: line.qty,
        })),
        ...(fulfillment === 'delivery'
          ? {
              address: {
                street,
                ...(number ? { number } : {}),
                ...(neighborhood ? { neighborhood } : {}),
              },
              deliveryFeeCents,
            }
          : { deliveryFeeCents: 0 }),
        discountCents,
        depositCents,
        ...(paymentMethod ? { paymentMethod } : {}),
        origin: 'manual',
        ...(notes ? { notes } : {}),
      }),
    );

    if (created) router.replace(`/painel/encomendas/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Nova encomenda"
        back={{ href: '/painel/encomendas', label: 'Encomendas' }}
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <Card>
          <CardHeader
            title="Para quando"
            description="Só os dias que a agenda aceita ficam clicáveis."
          />
          <CardBody className="space-y-4">
            {days.loading && !days.data ? (
              <Skeleton className="h-24" />
            ) : days.data && days.data.length > 0 ? (
              <DatePicker days={days.data} value={dueDate} onChange={setDueDate} />
            ) : (
              <Alert tone="warning">
                Nenhum dia configurado na agenda. Defina a semana em Encomendas → Agenda.
              </Alert>
            )}

            <div className="max-w-40">
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
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cliente" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={mutation.fieldErrors['customer.name']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Telefone" error={mutation.fieldErrors['customer.phone']} required>
              {(props) => (
                <Input
                  {...props}
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 98765-4321"
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Itens" />
          <CardBody className="space-y-4">
            <ItemPicker
              onAdd={(line) =>
                setLines((current) => {
                  const index = current.findIndex(
                    (item) => item.productVariantId === line.productVariantId,
                  );
                  if (index === -1) return [...current, line];
                  return current.map((item, i) =>
                    i === index ? { ...item, qty: item.qty + 1 } : item,
                  );
                })
              }
            />
            <CartLines lines={lines} onChange={setLines} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Entrega e fechamento" />
          <CardBody className="space-y-4">
            <Field label="Como o cliente recebe">
              {(props) => (
                <Select
                  {...props}
                  value={fulfillment}
                  onChange={(event) =>
                    setFulfillment(event.target.value as 'delivery' | 'pickup')
                  }
                >
                  <option value="pickup">Retirada no local</option>
                  <option value="delivery">Entrega</option>
                </Select>
              )}
            </Field>

            {fulfillment === 'delivery' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                  <Field label="Rua" required>
                    {(props) => (
                      <Input
                        {...props}
                        required
                        value={street}
                        onChange={(event) => setStreet(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Número">
                    {(props) => (
                      <Input
                        {...props}
                        value={number}
                        onChange={(event) => setNumber(event.target.value)}
                      />
                    )}
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bairro">
                    {(props) => (
                      <Input
                        {...props}
                        value={neighborhood}
                        onChange={(event) => setNeighborhood(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Taxa de entrega">
                    {(props) => (
                      <CurrencyInput
                        {...props}
                        value={deliveryFeeCents}
                        onValueChange={setDeliveryFeeCents}
                      />
                    )}
                  </Field>
                </div>
              </>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Desconto">
                {(props) => (
                  <CurrencyInput
                    {...props}
                    value={discountCents}
                    onValueChange={setDiscountCents}
                    invalid={discountCents > subtotal}
                  />
                )}
              </Field>
              <Field label="Sinal" hint="Registrado, cobrado por fora.">
                {(props) => (
                  <CurrencyInput
                    {...props}
                    value={depositCents}
                    onValueChange={setDepositCents}
                    invalid={depositCents > total}
                  />
                )}
              </Field>
              <Field label="Forma de pagamento">
                {(props) => (
                  <Select
                    {...props}
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value as PaymentMethod | '')
                    }
                  >
                    <option value="">Definir depois</option>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Observações">
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Bolo sem lactose, escrever 'Parabéns Ana'…"
                />
              )}
            </Field>

            <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-ink-soft">
                <dt>Subtotal</dt>
                <dd data-numeric>{formatCents(subtotal)}</dd>
              </div>
              <div className="flex justify-between pt-1.5 text-base font-medium text-ink">
                <dt>Total</dt>
                <dd data-numeric>{formatCents(Math.max(0, total))}</dd>
              </div>
              {depositCents > 0 ? (
                <div className="flex justify-between text-ink-muted">
                  <dt>Fica para a entrega</dt>
                  <dd data-numeric>{formatCents(Math.max(0, total - depositCents))}</dd>
                </div>
              ) : null}
            </dl>

            <p className="text-sm text-ink-muted">
              Valor estimado. O total definitivo é calculado ao registrar a encomenda.
            </p>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSubmit}
            loading={mutation.submitting}
          >
            Registrar encomenda
          </Button>
        </div>
      </form>
    </div>
  );
}
