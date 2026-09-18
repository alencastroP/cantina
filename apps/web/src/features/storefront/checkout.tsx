'use client';

import type {
  CreateStorefrontOrderRequest,
  DeliveryQuote,
  DeliveryZonePublic,
  PaymentMethod,
  StorefrontConfig,
  StorefrontOrder,
  WhatsappDraft,
} from '@cantina/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

import {
  ArrowRightIcon,
  BasketIcon,
  ChatIcon,
  CheckIcon,
  ScooterIcon,
  StoreIcon,
} from '../../components/layout/icons';
import { Alert } from '../../components/ui/feedback';
import { Field, Input, Textarea } from '../../components/ui/field';
import { FormErrors } from '../../components/ui/form';
import { ApiError, newIdempotencyKey, storefrontFetch } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatCents } from '../../lib/format';
import { useCart } from './cart';
import { joinList, OptionCard, Panel, PaymentChoice, SubmitButton } from './choices';
import { recordOrder } from './order-history';
import { Stepper } from './stepper';
import { useStorePaths } from './store-paths';

/**
 * Sacola e checkout, numa página só.
 *
 * Menos passos, menos abandono: no celular, cada tela nova é uma chance de a
 * pessoa desistir. O selo "Pedido para hoje" no topo lembra em qual dos dois
 * modos ela está — encomenda tem fluxo próprio.
 *
 * O total e o botão de enviar ficam numa barra grudada no rodapé, onde o
 * polegar está; é também ali que aparece o que falta e o erro do envio, que
 * no meio da página ficaria fora da tela.
 *
 * A chave de idempotência é gerada UMA vez por tentativa de envio e mantida
 * enquanto a tentativa dura — reenviar depois de um erro de rede reaproveita
 * a mesma chave, e a API devolve o pedido que já existia em vez de criar um
 * segundo (invariante 6).
 */
export function Checkout({
  host,
  config,
  zones,
}: {
  host: string;
  config: StorefrontConfig;
  zones: DeliveryZonePublic[];
}) {
  const router = useRouter();
  const { href } = useStorePaths(host);
  const cart = useCart();
  const zonesListId = useId();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>(
    config.acceptsDelivery ? 'delivery' : 'pickup',
  );

  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [reference, setReference] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');

  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(newIdempotencyKey);

  /**
   * Cota o frete quando o bairro para de mudar.
   *
   * A taxa exibida é só informativa — o servidor recota no envio, a partir do
   * mesmo bairro. Mostrar aqui evita a surpresa de ver o total mudar na hora
   * de confirmar.
   */
  useEffect(() => {
    if (fulfillment !== 'delivery' || neighborhood.trim().length < 2) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(() => {
      void storefrontFetch<DeliveryQuote>('/delivery-quote', {
        method: 'POST',
        tenantHost: host,
        body: { neighborhood: neighborhood.trim() },
      })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 400);

    return () => clearTimeout(timer);
  }, [neighborhood, fulfillment, host]);

  const delivery = fulfillment === 'delivery';
  const deliveryFeeCents = delivery ? (quote?.feeCents ?? 0) : 0;
  const totalCents = cart.subtotalCents + deliveryFeeCents;
  const minOrder = quote?.minOrderCents ?? config.minOrderCents;
  const belowMinimum = cart.subtotalCents < minOrder;

  const canSubmit =
    cart.items.length > 0 &&
    name.trim().length >= 2 &&
    phone.replace(/\D/g, '').length >= 10 &&
    (!delivery || (street.trim().length >= 3 && quote?.available === true)) &&
    !belowMinimum;

  // O botão desabilitado diz o que falta. Sem isso, quem chegou ao fim só vê
  // um botão apagado e não sabe se o problema é o telefone ou o bairro.
  const missing = [
    delivery && quote?.available !== true ? 'um bairro atendido' : null,
    delivery && street.trim().length < 3 ? 'a rua' : null,
    name.trim().length < 2 ? 'seu nome' : null,
    phone.replace(/\D/g, '').length < 10 ? 'um telefone com DDD' : null,
  ].filter((item): item is string => item !== null);

  const blocker = belowMinimum
    ? `Faltam ${formatCents(minOrder - cart.subtotalCents)} para o pedido mínimo de ${formatCents(minOrder)}.`
    : missing.length > 0
      ? `Para enviar, falta ${joinList(missing)}.`
      : null;

  function buildPayload(): CreateStorefrontOrderRequest {
    return {
      customer: { name: name.trim(), phone: phone.trim() },
      fulfillment,
      items: cart.items.map((item) => ({
        productVariantId: item.variantId,
        qty: item.qty,
        ...(item.notes ? { notes: item.notes } : {}),
      })),
      ...(delivery
        ? {
            address: {
              street: street.trim(),
              ...(number ? { number } : {}),
              ...(complement ? { complement } : {}),
              ...(neighborhood ? { neighborhood: neighborhood.trim() } : {}),
              ...(reference ? { reference } : {}),
            },
          }
        : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(notes ? { notes } : {}),
    };
  }

  function handleError(caught: unknown) {
    if (caught instanceof ApiError) {
      if (caught.code === 'validation_error') setFieldErrors(caught.fieldErrors);
      else setError(caught.message);
    } else {
      setError('Não foi possível enviar. Verifique sua conexão e tente de novo.');
    }
    setSubmitting(false);
  }

  async function submitOnline() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const order = await storefrontFetch<StorefrontOrder>('/orders', {
        method: 'POST',
        tenantHost: host,
        body: buildPayload(),
        idempotencyKey,
      });

      recordOrder(host, {
        kind: 'order',
        code: order.code,
        phone: phone.trim(),
        placedAt: order.placedAt,
      });

      cart.clear();
      router.replace(
        href(`/pedido/${order.code}?phone=${encodeURIComponent(phone.trim())}&novo=1`),
      );
    } catch (caught) {
      handleError(caught);
    }
  }

  async function submitWhatsapp() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const draft = await storefrontFetch<WhatsappDraft>('/whatsapp-draft', {
        method: 'POST',
        tenantHost: host,
        body: buildPayload(),
        idempotencyKey,
      });

      // Só existe pedido para acompanhar se a loja usa o modo `persist` (D7).
      if (draft.order) {
        recordOrder(host, {
          kind: 'order',
          code: draft.order.code,
          phone: phone.trim(),
          placedAt: draft.order.placedAt,
        });
      }

      cart.clear();
      // Sai da página para o WhatsApp. Se a loja grava o pedido (D7), ele já
      // está no kanban antes de a conversa começar.
      window.location.href = draft.whatsappUrl;
    } catch (caught) {
      handleError(caught);
    }
  }

  if (!cart.ready) {
    return (
      <div className="space-y-4" aria-label="Carregando sacola">
        <div className="shimmer h-40 rounded-[1.5rem]" />
        <div className="shimmer h-28 rounded-[1.5rem]" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div data-mode="now" className="flex animate-rise flex-col items-center px-6 py-14 text-center">
        <span className="grid size-20 place-items-center rounded-full bg-mode-tint text-mode-ink">
          <BasketIcon size={36} />
        </span>
        <p className="mt-5 font-display text-2xl text-ink">Sua sacola está vazia</p>
        <p className="mt-1 max-w-xs text-sm text-ink-muted">
          Escolha algo no cardápio de hoje — a sacola fica guardada neste aparelho.
        </p>
        <Link
          href={href('/')}
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-mode px-6 font-semibold text-ink-inverse shadow-[0_14px_28px_-14px_var(--color-mode)] transition-transform active:scale-[0.98]"
        >
          Ver cardápio
          <ArrowRightIcon size={18} />
        </Link>
      </div>
    );
  }

  const both = config.acceptsDelivery && config.acceptsPickup;
  const minFee = zones.length > 0 ? Math.min(...zones.map((zone) => zone.feeCents)) : null;
  const pickupAddress = [config.address?.street, config.address?.number].filter(Boolean).join(', ');
  const zoneName = (zone: DeliveryZonePublic) => zone.neighborhood ?? zone.name;

  const primary = config.acceptsOnlineCheckout ? (
    <SubmitButton disabled={!canSubmit} loading={submitting} onClick={() => void submitOnline()}>
      Enviar pedido
    </SubmitButton>
  ) : config.whatsappNumber ? (
    <SubmitButton
      disabled={!canSubmit}
      loading={submitting}
      icon={<ChatIcon size={20} />}
      onClick={() => void submitWhatsapp()}
    >
      Enviar pelo WhatsApp
    </SubmitButton>
  ) : null;

  return (
    <div data-mode="now" className="space-y-4">
      <div className="flex animate-rise flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mode px-3 py-1 text-xs font-semibold text-ink-inverse">
          <ScooterIcon size={14} />
          Pedido para hoje
        </span>
        <span className="text-sm text-ink-muted" data-numeric>
          {cart.count === 1 ? '1 item' : `${cart.count} itens`}
        </span>
      </div>

      {!config.isOpenNow ? (
        <Alert tone="warning" title="A loja está fechada agora.">
          Você pode enviar mesmo assim — o pedido é visto quando ela abrir.
        </Alert>
      ) : null}

      <Panel
        title="Itens"
        aside={
          <Link href={href('/')} className="font-medium text-mode-ink underline-offset-4 hover:underline">
            + Adicionar mais
          </Link>
        }
      >
        <ul className="divide-y divide-dashed divide-border">
          {cart.items.map((item, index) => (
            <li
              key={item.variantId}
              className="flex animate-rise items-center gap-3 py-3 first:pt-0 last:pb-0"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.productName}</p>
                <p className="mt-0.5 text-xs text-ink-muted" data-numeric>
                  {item.variantName ? `${item.variantName} · ` : ''}
                  {formatCents(item.priceCents)} cada
                </p>
              </div>
              <Stepper
                size="sm"
                qty={item.qty}
                label={item.productName}
                onChange={(qty) => cart.setQty(item.variantId, qty)}
              />
              <span className="w-[4.5rem] text-right text-sm font-semibold text-ink" data-numeric>
                {formatCents(item.priceCents * item.qty)}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {both ? (
        <Panel title="Como você quer receber?">
          <div className="grid grid-cols-2 gap-2.5">
            <OptionCard
              name="fulfillment"
              checked={delivery}
              onSelect={() => setFulfillment('delivery')}
              icon={<ScooterIcon size={21} />}
              title="Entrega"
              description={minFee !== null ? `a partir de ${formatCents(minFee)}` : 'no seu endereço'}
            />
            <OptionCard
              name="fulfillment"
              checked={!delivery}
              onSelect={() => setFulfillment('pickup')}
              icon={<StoreIcon size={21} />}
              title="Retirada"
              description={pickupAddress ? `sem taxa · ${pickupAddress}` : 'no balcão, sem taxa'}
            />
          </div>
        </Panel>
      ) : null}

      {/* O endereço abre e fecha com a escolha acima, sem saltar a página. */}
      <div className="reveal" data-open={delivery} inert={!delivery}>
        <div className="-mx-1 px-1 pb-1">
          <Panel title="Endereço de entrega">
            <div className="space-y-4">
              <Field label="Bairro" hint="É por ele que calculamos a taxa." required>
                {(props) => (
                  <Input
                    {...props}
                    required
                    name="neighborhood"
                    list={zones.length > 0 ? zonesListId : undefined}
                    autoComplete="address-level3"
                    enterKeyHint="next"
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                  />
                )}
              </Field>

              {zones.length > 0 ? (
                <datalist id={zonesListId}>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zoneName(zone)} />
                  ))}
                </datalist>
              ) : null}

              {/* Com poucos bairros, um toque resolve — digitar "Jardins" com
                  acento errado no celular é o erro mais comum desta tela. */}
              {zones.length > 0 && zones.length <= 8 ? (
                <div className="-mt-1 flex flex-wrap gap-1.5">
                  {zones.map((zone) => {
                    const picked =
                      neighborhood.trim().toLowerCase() === zoneName(zone).toLowerCase();
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        onClick={() => setNeighborhood(zoneName(zone))}
                        aria-pressed={picked}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs transition-[background-color,color,transform] duration-200 active:scale-95',
                          picked ? 'bg-mode text-ink-inverse' : 'bg-sand-200 text-ink-soft hover:bg-sand-300',
                        )}
                      >
                        {zoneName(zone)} · <span data-numeric>{formatCents(zone.feeCents)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {quote ? (
                <p
                  key={quote.zoneName ?? quote.message ?? ''}
                  role="status"
                  className={cn(
                    'flex animate-rise items-start gap-2 rounded-xl px-3 py-2.5 text-sm',
                    quote.available ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700',
                  )}
                >
                  {quote.available ? (
                    <>
                      <CheckIcon size={17} className="mt-0.5 shrink-0" />
                      <span>
                        Bairro atendido: {quote.zoneName} · {formatCents(quote.feeCents)}
                        {quote.etaMinutes ? ` · cerca de ${quote.etaMinutes} min` : ''}
                      </span>
                    </>
                  ) : (
                    quote.message
                  )}
                </p>
              ) : null}

              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <Field label="Rua" error={fieldErrors['address.street']} required>
                  {(props) => (
                    <Input
                      {...props}
                      required
                      name="street"
                      autoComplete="address-line1"
                      enterKeyHint="next"
                      value={street}
                      onChange={(event) => setStreet(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Número">
                  {(props) => (
                    <Input
                      {...props}
                      name="number"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={number}
                      onChange={(event) => setNumber(event.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Complemento">
                  {(props) => (
                    <Input
                      {...props}
                      name="complement"
                      autoComplete="address-line2"
                      value={complement}
                      onChange={(event) => setComplement(event.target.value)}
                      placeholder="Apto 42"
                    />
                  )}
                </Field>
                <Field label="Ponto de referência">
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
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Seus dados">
        <div className="space-y-4">
          <Field label="Nome" error={fieldErrors['customer.name']} required>
            {(props) => (
              <Input
                {...props}
                required
                name="name"
                autoComplete="name"
                enterKeyHint="next"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Como podemos te chamar?"
              />
            )}
          </Field>
          <Field
            label="Telefone"
            hint="Para a loja falar com você sobre o pedido."
            error={fieldErrors['customer.phone']}
            required
          >
            {(props) => (
              <Input
                {...props}
                required
                type="tel"
                inputMode="tel"
                name="tel"
                autoComplete="tel-national"
                enterKeyHint="next"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(11) 98765-4321"
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="Pagamento" aside={delivery ? 'na entrega' : 'na retirada'}>
        <PaymentChoice
          name="pagamento"
          methods={config.acceptedPaymentMethods}
          value={paymentMethod}
          onChange={setPaymentMethod}
        />
        <div className="mt-4">
          <Field label="Observações">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Sem cebola, entregar depois das 19h…"
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-soft">
            <dt>Subtotal</dt>
            <dd data-numeric>{formatCents(cart.subtotalCents)}</dd>
          </div>
          {delivery ? (
            <div className="flex justify-between text-ink-soft">
              <dt>Entrega</dt>
              <dd data-numeric>{quote?.available ? formatCents(deliveryFeeCents) : 'a calcular'}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-dashed border-border pt-2.5">
            <dt className="text-ink">Total</dt>
            <dd className="font-display text-2xl text-ink" data-numeric>
              {formatCents(totalCents)}
            </dd>
          </div>
        </dl>

        {config.acceptsOnlineCheckout && config.whatsappNumber ? (
          <div className="mt-4">
            <SubmitButton
              variant="outline"
              disabled={!canSubmit}
              loading={submitting}
              icon={<ChatIcon size={20} />}
              onClick={() => void submitWhatsapp()}
            >
              Prefiro pedir pelo WhatsApp
            </SubmitButton>
          </div>
        ) : null}
      </Panel>

      {primary ? (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-border/70 bg-canvas/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <FormErrors
            className="mb-2.5"
            error={error}
            fieldErrors={fieldErrors}
            labels={{
              'customer.name': 'Nome',
              'customer.phone': 'Telefone',
              address: 'Endereço',
              'address.street': 'Rua',
              items: 'Itens',
            }}
          />
          {!canSubmit && blocker ? (
            <p key={blocker} className="mb-2 animate-rise text-xs leading-snug text-ink-muted">
              {blocker}
            </p>
          ) : null}
          <div className="flex items-center gap-4">
            <div className="shrink-0 leading-tight">
              <span className="block text-xs text-ink-muted">Total</span>
              <span className="block font-display text-[1.35rem] text-ink" data-numeric>
                {formatCents(totalCents)}
              </span>
            </div>
            <div className="min-w-0 flex-1">{primary}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
