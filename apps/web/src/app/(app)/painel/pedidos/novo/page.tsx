'use client';

import type { PaymentMethod } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { PageHeader } from '../../../../../components/layout/page-header';
import { Button } from '../../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../../components/ui/card';
import { CurrencyInput } from '../../../../../components/ui/currency-input';
import { Alert } from '../../../../../components/ui/feedback';
import { Field, Input, Select, Textarea } from '../../../../../components/ui/field';
import { ordersApi, PAYMENT_METHOD_LABELS } from '../../../../../features/orders/api';
import {
  CartLines,
  ItemPicker,
  type CartLine,
} from '../../../../../features/orders/item-picker';
import { formatCents } from '../../../../../lib/format';
import { useMutation } from '../../../../../lib/use-api';

/**
 * Pedido lançado no balcão.
 *
 * O cliente é identificado por nome + telefone, e o servidor encontra ou cria
 * o cadastro (D4) — quem está atendendo não deve precisar buscar antes para
 * descobrir se a pessoa já comprou.
 *
 * Este pedido nasce já confirmado: o lojista está registrando algo que ele
 * aceitou. A baixa de estoque acontece na mesma transação.
 */
export default function NovoPedidoPage() {
  const router = useRouter();
  const mutation = useMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const [lines, setLines] = useState<CartLine[]>([]);

  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [reference, setReference] = useState('');

  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [discountCents, setDiscountCents] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');

  const subtotal = useMemo(
    () => lines.reduce((total, line) => total + line.unitPriceCents * line.qty, 0),
    [lines],
  );
  const total = subtotal - discountCents + (fulfillment === 'delivery' ? deliveryFeeCents : 0);

  const canSubmit = lines.length > 0 && name.trim().length >= 2 && phone.trim().length >= 10;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const created = await mutation.run(() =>
      ordersApi.create({
        customer: { name: name.trim(), phone: phone.trim() },
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
                ...(reference ? { reference } : {}),
              },
              deliveryFeeCents,
            }
          : { deliveryFeeCents: 0 }),
        discountCents,
        ...(paymentMethod ? { paymentMethod } : {}),
        origin: 'manual',
        ...(notes ? { notes } : {}),
      }),
    );

    if (created) router.replace(`/painel/pedidos/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Novo pedido" back={{ href: '/painel/pedidos', label: 'Pedidos' }} />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {mutation.error ? <Alert tone="danger">{mutation.error}</Alert> : null}

        <Card>
          <CardHeader title="Cliente" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={mutation.fieldErrors['customer.name']} required>
              {(props) => (
                <Input
                  {...props}
                  autoFocus
                  required
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Maria"
                />
              )}
            </Field>
            <Field
              label="Telefone"
              hint="Se já comprou antes, o cadastro é reaproveitado."
              error={mutation.fieldErrors['customer.phone']}
              required
            >
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
                  // Somar em vez de repetir a linha: "mais uma coxinha" é a
                  // mesma coxinha, e duas linhas iguais confundem a cozinha.
                  const existing = current.findIndex(
                    (item) => item.productVariantId === line.productVariantId,
                  );
                  if (existing === -1) return [...current, line];
                  return current.map((item, index) =>
                    index === existing ? { ...item, qty: item.qty + 1 } : item,
                  );
                })
              }
            />
            <CartLines lines={lines} onChange={setLines} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Entrega" />
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
                  <option value="delivery">Entrega</option>
                  <option value="pickup">Retirada no local</option>
                </Select>
              )}
            </Field>

            {fulfillment === 'delivery' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                  <Field label="Rua" error={mutation.fieldErrors['address.street']} required>
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
                  <Field label="Referência">
                    {(props) => (
                      <Input
                        {...props}
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Portão verde"
                      />
                    )}
                  </Field>
                </div>

                <Field label="Taxa de entrega">
                  {(props) => (
                    <CurrencyInput
                      {...props}
                      value={deliveryFeeCents}
                      onValueChange={setDeliveryFeeCents}
                    />
                  )}
                </Field>
              </>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Fechamento" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Sem cebola, entregar depois das 19h…"
                />
              )}
            </Field>

            <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-ink-soft">
                <dt>Subtotal</dt>
                <dd data-numeric>{formatCents(subtotal)}</dd>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between text-ink-soft">
                  <dt>Desconto</dt>
                  <dd data-numeric>− {formatCents(discountCents)}</dd>
                </div>
              ) : null}
              {fulfillment === 'delivery' && deliveryFeeCents > 0 ? (
                <div className="flex justify-between text-ink-soft">
                  <dt>Entrega</dt>
                  <dd data-numeric>{formatCents(deliveryFeeCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between pt-1.5 text-base font-medium text-ink">
                <dt>Total</dt>
                <dd data-numeric>{formatCents(Math.max(0, total))}</dd>
              </div>
            </dl>

            <p className="text-sm text-ink-muted">
              Valor estimado. O total definitivo é calculado ao registrar o pedido, com o
              preço vigente de cada item.
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
            Registrar pedido
          </Button>
        </div>
      </form>
    </div>
  );
}
