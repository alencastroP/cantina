'use client';

import type {
  Menu,
  MenuProduct,
  MenuVariant,
  PaymentMethod,
  PublicDay,
  StorefrontConfig,
  StorefrontPreorder,
} from '@cantina/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { CalendarIcon, CheckIcon, PhoneIcon } from '../../components/layout/icons';
import { Field, Input, Textarea } from '../../components/ui/field';
import { FormErrors } from '../../components/ui/form';
import { ApiError, newIdempotencyKey, storefrontFetch } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatCents, formatDayLong, formatDayShort } from '../../lib/format';
import { dateRange } from '../preorders/date-picker';
import { joinList, Panel, PaymentChoice, SubmitButton } from './choices';
import { DateStrip } from './date-strip';
import { FloatingBar } from './floating-bar';
import { MenuSections, type MenuCart } from './menu-sections';
import { scrollToElement } from './motion';
import { recordOrder } from './order-history';
import { Stepper } from './stepper';
import { useStorePaths } from './store-paths';

interface Line {
  variantId: string;
  label: string;
  priceCents: number;
  qty: number;
  max: number | null;
}

/**
 * Encomenda na vitrine — em três passos numerados: dia, itens, dados.
 *
 * Carrinho próprio, separado do de delivery: misturar "quero agora" com
 * "quero para sábado" num mesmo carrinho produziria um pedido que a cozinha
 * não sabe quando fazer. Ele também não é persistido — a encomenda é uma
 * decisão tomada de uma vez, não montada ao longo do dia.
 *
 * A data vem primeiro porque é o que pode não estar disponível. Escolhida,
 * ela vira um "bilhete" com a data por extenso e o botão de trocar; o
 * cardápio só abre depois, e os dados só depois do primeiro item. Cada passo
 * aparece quando faz sentido, e a barra de progresso do topo diz onde se está.
 */
export function PreorderFlow({
  host,
  config,
  menu,
}: {
  host: string;
  config: StorefrontConfig;
  menu: Menu;
}) {
  const router = useRouter();
  const { href } = useStorePaths(host);

  const [days, setDays] = useState<PublicDay[] | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    const range = dateRange(config.acceptsPreorder ? 90 : 0);
    void storefrontFetch<PublicDay[]>(`/availability?from=${range.from}&to=${range.to}`, {
      tenantHost: host,
    })
      .then(setDays)
      .catch(() => setDays([]));
  }, [host, config.acceptsPreorder]);

  const hasItems = lines.length > 0;

  // A pílula de resumo some quando o próprio resumo está na tela.
  const reviewRef = useRef<HTMLElement>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  useEffect(() => {
    const element = reviewRef.current;
    if (!element || !hasItems) return;
    const observer = new IntersectionObserver(([entry]) => setReviewVisible(Boolean(entry?.isIntersecting)), {
      rootMargin: '0px 0px -30% 0px',
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasItems]);

  const count = lines.reduce((total, line) => total + line.qty, 0);
  const subtotal = lines.reduce((total, line) => total + line.priceCents * line.qty, 0);
  const products = [...menu.categories.flatMap((category) => category.products), ...menu.uncategorized];

  const canSubmit =
    Boolean(dueDate) && hasItems && name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 10;

  const missing = [
    name.trim().length < 2 ? 'seu nome' : null,
    phone.replace(/\D/g, '').length < 10 ? 'um telefone com DDD' : null,
  ].filter((item): item is string => item !== null);

  // 0 escolhendo o dia · 1 dia escolhido · 2 com itens · 3 pronto para enviar
  const stage = !dueDate || pickingDate ? 0 : !hasItems ? 1 : !canSubmit ? 2 : 3;

  function setQty(product: MenuProduct, variant: MenuVariant, qty: number) {
    setLines((current) => {
      if (qty <= 0) return current.filter((line) => line.variantId !== variant.id);

      const index = current.findIndex((line) => line.variantId === variant.id);
      if (index === -1) {
        const label =
          variant.name && variant.name !== 'Padrão' ? `${product.name} (${variant.name})` : product.name;
        return [
          ...current,
          { variantId: variant.id, label, priceCents: variant.priceCents, qty, max: variant.availableUnits },
        ];
      }
      return current.map((line, i) => (i === index ? { ...line, qty } : line));
    });
  }

  function changeLine(variantId: string, qty: number) {
    setLines((current) =>
      qty <= 0
        ? current.filter((line) => line.variantId !== variantId)
        : current.map((line) => (line.variantId === variantId ? { ...line, qty } : line)),
    );
  }

  const menuCart: MenuCart = {
    qtyOf: (variantId) => lines.find((line) => line.variantId === variantId)?.qty ?? 0,
    setQty,
    add: (product, variant, qty) =>
      setQty(product, variant, (lines.find((line) => line.variantId === variant.id)?.qty ?? 0) + qty),
    bagLabel: 'na encomenda',
  };

  async function submit() {
    if (!dueDate) return;
    setSubmitting(true);
    setError(null);

    try {
      const order = await storefrontFetch<StorefrontPreorder>('/preorders', {
        method: 'POST',
        tenantHost: host,
        idempotencyKey,
        body: {
          customer: { name: name.trim(), phone: phone.trim() },
          dueDate,
          fulfillment: 'pickup',
          items: lines.map((line) => ({ productVariantId: line.variantId, qty: line.qty })),
          ...(paymentMethod ? { paymentMethod } : {}),
          ...(notes ? { notes } : {}),
        },
      });

      recordOrder(host, {
        kind: 'preorder',
        code: order.code,
        phone: phone.trim(),
        placedAt: order.placedAt,
      });

      router.replace(
        href(
          `/pedido/${order.code}?phone=${encodeURIComponent(phone.trim())}&kind=preorder&novo=1`,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível enviar. Verifique sua conexão.',
      );
      setSubmitting(false);
    }
  }

  if (!config.acceptsPreorder) {
    return (
      <div data-mode="later" className="animate-rise rounded-[1.5rem] border border-dashed border-border px-6 py-12 text-center">
        <p className="font-display text-xl text-ink">Esta loja não está aceitando encomendas agora</p>
        <Link
          href={href('/')}
          className="mt-4 inline-flex text-sm font-medium text-clay-700 underline underline-offset-4"
        >
          Ver o cardápio de hoje
        </Link>
      </div>
    );
  }

  return (
    <div data-mode="later" className="animate-enter-right space-y-8">
      <Progress stage={stage} />

      {/* --- 1. Dia --------------------------------------------------------- */}
      <section aria-labelledby="enc-dia">
        <StepTitle
          n={1}
          id="enc-dia"
          done={stage > 0}
          title="Para quando?"
          hint={stage > 0 ? undefined : 'Só aparecem os dias com vaga. Encomenda pede antecedência.'}
        />
        {days === null ? (
          <div className="flex gap-2 pt-2" aria-label="Carregando dias">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="shimmer h-[5.25rem] w-[4.25rem] shrink-0 rounded-2xl" />
            ))}
          </div>
        ) : dueDate && !pickingDate ? (
          <DateTicket date={dueDate} onChange={() => setPickingDate(true)} />
        ) : (
          <DateStrip
            days={days}
            value={dueDate}
            onChange={(date) => {
              setDueDate(date);
              setPickingDate(false);
            }}
          />
        )}
      </section>

      {/* --- 2. Itens ------------------------------------------------------- */}
      <section aria-labelledby="enc-itens">
        <StepTitle n={2} id="enc-itens" done={hasItems} locked={!dueDate} title="O que vai na encomenda?" />
        {!dueDate ? (
          <p className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-ink-muted">
            <CalendarIcon size={20} className="shrink-0" />
            O cardápio de encomendas abre assim que você escolher o dia.
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-ink-muted">
            Nenhum produto disponível para encomenda no momento.
          </p>
        ) : (
          <div className="animate-rise">
            <MenuSections menu={menu} cart={menuCart} />
          </div>
        )}
      </section>

      {/* --- 3. Dados e envio ---------------------------------------------- */}
      <div className="reveal" data-open={hasItems} inert={!hasItems}>
        <div className="-mx-1 px-1 pb-1">
          <section ref={reviewRef} id="enc-dados" aria-labelledby="enc-dados-title" className="scroll-mt-20 space-y-4">
            <StepTitle n={3} id="enc-dados-title" done={stage > 2} title="Confira e envie" />

            <Panel title="Seus dados">
              <div className="space-y-4">
                <Field label="Nome" required>
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
                <Field label="Telefone" hint="É por ele que a loja confirma a encomenda." required>
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

            <Panel title="Pagamento" aside="combinado com a loja">
              <PaymentChoice
                name="pagamento-encomenda"
                methods={config.acceptedPaymentMethods}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />
              <div className="mt-4">
                <Field label="Detalhes da encomenda">
                  {(props) => (
                    <Textarea
                      {...props}
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Escrever 'Parabéns, Ana' · sem lactose · retirar às 15h"
                    />
                  )}
                </Field>
              </div>
            </Panel>

            <div className="overflow-hidden rounded-[1.5rem] bg-surface shadow-raised ring-1 ring-border/70">
              <div className="flex items-center gap-3 border-b border-dashed border-mode/30 bg-mode-soft px-4 py-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mode text-ink-inverse">
                  <CalendarIcon size={19} />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mode-ink/80">
                    Sua encomenda
                  </p>
                  <p className="mt-0.5 font-medium text-ink first-letter:uppercase">
                    {dueDate ? formatDayLong(dueDate) : ''} · retirada na loja
                  </p>
                </div>
              </div>

              <ul className="divide-y divide-dashed divide-border px-4">
                {lines.map((line) => (
                  <li key={line.variantId} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 text-sm text-ink">{line.label}</span>
                    <Stepper
                      size="sm"
                      qty={line.qty}
                      max={line.max}
                      label={line.label}
                      onChange={(qty) => changeLine(line.variantId, qty)}
                    />
                    <span className="w-[4.5rem] text-right text-sm font-semibold text-ink" data-numeric>
                      {formatCents(line.priceCents * line.qty)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-4 border-t border-border px-4 pb-4 pt-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-ink-soft">Total</span>
                  <span className="font-display text-2xl text-ink" data-numeric>
                    {formatCents(subtotal)}
                  </span>
                </div>

                <p className="flex gap-2.5 rounded-xl bg-sand-100 px-3 py-2.5 text-sm text-ink-soft">
                  <PhoneIcon size={17} className="mt-0.5 shrink-0 text-mode-ink" />
                  A loja confirma a encomenda pelo telefone e combina o pagamento. Nada é cobrado agora.
                </p>

                <FormErrors error={error} />

                {!canSubmit && missing.length > 0 ? (
                  <p className="text-sm text-ink-muted">Para enviar, falta {joinList(missing)}.</p>
                ) : null}

                <SubmitButton disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
                  Enviar encomenda
                </SubmitButton>
              </div>
            </div>
          </section>
        </div>
      </div>

      <FloatingBar
        visible={hasItems && !reviewVisible}
        onClick={() => scrollToElement(document.getElementById('enc-dados'))}
        icon={<CalendarIcon size={20} />}
        count={count}
        title="Revisar encomenda"
        subtitle={dueDate ? `Retirada ${formatDayShort(dueDate)}` : ''}
        amount={formatCents(subtotal)}
      />
    </div>
  );
}

function Progress({ stage }: { stage: number }) {
  const labels = ['Dia', 'Itens', 'Seus dados'];

  return (
    <div className="flex gap-2" aria-hidden="true">
      {labels.map((label, index) => (
        <div key={label} className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
            <div
              className="h-full rounded-full bg-mode transition-[width] duration-700 ease-[var(--ease-out-soft)]"
              style={{ width: stage > index ? '100%' : '0%' }}
            />
          </div>
          <p
            className={cn(
              'mt-1.5 text-[0.68rem] font-semibold uppercase tracking-wider transition-colors duration-500',
              stage > index ? 'text-mode-ink' : stage === index ? 'text-ink' : 'text-ink-muted',
            )}
          >
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

function StepTitle({
  n,
  id,
  title,
  hint,
  done = false,
  locked = false,
}: {
  n: number;
  id: string;
  title: string;
  hint?: ReactNode;
  done?: boolean;
  locked?: boolean;
}) {
  return (
    <header className="mb-3 flex items-start gap-3">
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors duration-500',
          done ? 'bg-mode text-ink-inverse' : locked ? 'bg-sand-200 text-ink-muted' : 'bg-mode-tint text-mode-ink',
        )}
      >
        {done ? <CheckIcon size={16} strokeWidth={2.5} className="animate-pop" /> : n}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 id={id} className={cn('text-[1.35rem] leading-tight', locked ? 'text-ink-muted' : 'text-ink')}>
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-muted">{hint}</p> : null}
      </div>
    </header>
  );
}

/** A data escolhida vira um bilhete — encomenda é uma reserva. */
function DateTicket({ date, onChange }: { date: string; onChange: () => void }) {
  return (
    <div className="ticket flex animate-pop items-center gap-4 rounded-2xl bg-mode px-5 py-4 text-ink-inverse shadow-[0_16px_32px_-18px_var(--color-mode)]">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-inverse/15">
        <CalendarIcon size={22} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs uppercase tracking-[0.14em] text-ink-inverse/75">Retirada na loja</p>
        <p className="mt-1 font-display text-xl first-letter:uppercase">{formatDayLong(date)}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-full bg-ink-inverse/15 px-3.5 py-2 text-sm font-medium transition-[background-color,transform] hover:bg-ink-inverse/25 active:scale-95"
      >
        Trocar
      </button>
    </div>
  );
}
