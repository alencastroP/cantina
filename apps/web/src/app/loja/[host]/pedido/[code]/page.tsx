'use client';

import type { StorefrontOrder, StorefrontPreorder } from '@cantina/contracts';
import { DEFAULT_DELIVERY_LABELS, DEFAULT_PREORDER_LABELS } from '@cantina/domain';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  ScooterIcon,
  StoreIcon,
} from '../../../../../components/layout/icons';
import { Alert } from '../../../../../components/ui/feedback';
import { Field, Input } from '../../../../../components/ui/field';
import { Panel, SubmitButton } from '../../../../../features/storefront/choices';
import { useStorePaths } from '../../../../../features/storefront/store-paths';
import { ApiError, storefrontFetch } from '../../../../../lib/api';
import { cn } from '../../../../../lib/cn';
import { formatCents, formatDateTime, formatDayLong } from '../../../../../lib/format';

/**
 * Acompanhamento — pedido de delivery ou encomenda, mesma tela.
 *
 * Código + telefone, sempre os dois (D4): o cliente não tem senha, e só o
 * telefone permitiria a qualquer pessoa listar os pedidos de qualquer número.
 *
 * `?kind=preorder` escolhe o endpoint de encomenda em vez do de pedido, e
 * também a cor: terracota para o pedido de hoje, oliva para a encomenda.
 * `?novo=1` vem do checkout e liga a comemoração de "enviado".
 *
 * O telefone vem na URL logo depois do checkout — é o único momento em que
 * temos como preenchê-lo. Quem volta pelo link salvo digita de novo.
 */

type AnyOrder = StorefrontOrder | StorefrontPreorder;

/** Etapas na ordem em que acontecem. Terminais ficam de fora, menos "concluído". */
function stepsFor(order: AnyOrder, isPreorder: boolean): string[] {
  if (isPreorder) return ['pending', 'confirmed', 'in_production', 'ready', 'completed'];
  // Retirada no balcão não passa por "saiu para entrega" (@cantina/domain).
  return order.fulfillment === 'delivery'
    ? ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed']
    : ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
}

function hintFor(status: string, isPreorder: boolean, fulfillment: string): string {
  switch (status) {
    case 'pending':
      return isPreorder
        ? 'A loja vai confirmar a data e combinar o pagamento.'
        : 'A loja vai confirmar em instantes.';
    case 'confirmed':
      return isPreorder ? 'Sua data está garantida.' : 'Confirmado — já está na fila da cozinha.';
    case 'preparing':
      return 'Sendo preparado agora.';
    case 'in_production':
      return 'A cozinha está preparando para o seu dia.';
    case 'ready':
      return isPreorder
        ? 'Pronta! Pode retirar no dia combinado.'
        : fulfillment === 'delivery'
          ? 'Pronto, esperando o entregador.'
          : 'Pronto! Pode vir buscar.';
    case 'out_for_delivery':
      return 'A caminho do seu endereço.';
    case 'completed':
      return 'Obrigado pela preferência!';
    default:
      return '';
  }
}

export default function PedidoPage() {
  const params = useParams<{ host: string; code: string }>();
  const searchParams = useSearchParams();
  const { href } = useStorePaths(params.host);
  const isPreorder = searchParams.get('kind') === 'preorder';
  const justPlaced = searchParams.get('novo') === '1';

  const [phone, setPhone] = useState(searchParams.get('phone') ?? '');
  const [order, setOrder] = useState<AnyOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(searchParams.get('phone')));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (value: string) => {
      setLoading(true);
      setError(null);
      try {
        const path = isPreorder ? 'preorders' : 'orders';
        const result = await storefrontFetch<AnyOrder>(
          `/${path}/${params.code}?phone=${encodeURIComponent(value)}`,
          { tenantHost: params.host },
        );
        setOrder(result);
      } catch (caught) {
        setOrder(null);
        setError(
          caught instanceof ApiError ? caught.message : 'Não foi possível consultar agora. Tente de novo.',
        );
      } finally {
        setLoading(false);
      }
    },
    [params.code, params.host, isPreorder],
  );

  useEffect(() => {
    const initial = searchParams.get('phone');
    if (initial) void load(initial);
  }, [load, searchParams]);

  // Acompanhar de verdade: enquanto o pedido está em andamento, recarrega
  // sozinho. Concluído ou cancelado, para — não há mais o que mudar.
  useEffect(() => {
    if (!order || order.status === 'completed' || order.status === 'canceled') return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(phone);
    }, 20_000);

    return () => clearInterval(timer);
  }, [order, phone, load]);

  const KindIcon = isPreorder ? CalendarIcon : ScooterIcon;

  return (
    <div data-mode={isPreorder ? 'later' : 'now'} className="space-y-4">
      {order ? (
        <>
          {justPlaced ? <Celebration isPreorder={isPreorder} /> : null}
          <StatusCard order={order} isPreorder={isPreorder} />

          <Panel title={isPreorder ? 'O que vai na encomenda' : 'O que você pediu'} className="animate-rise">
            <ul className="divide-y divide-dashed divide-border">
              {order.items.map((item, index) => (
                <li key={index} className="flex items-start gap-3 py-2.5 first:pt-0">
                  <span
                    className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-mode-tint px-1.5 text-xs font-semibold text-mode-ink"
                    data-numeric
                  >
                    {item.qty}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-sm text-ink">
                      {item.productName}
                      {item.variantName ? ` (${item.variantName})` : ''}
                    </p>
                    {item.notes ? <p className="text-xs text-ink-muted">obs: {item.notes}</p> : null}
                  </div>
                  <span className="shrink-0 pt-0.5 text-sm text-ink" data-numeric>
                    {formatCents(item.totalCents)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-sm">
              <div className="flex justify-between text-ink-soft">
                <dt>Subtotal</dt>
                <dd data-numeric>{formatCents(order.subtotalCents)}</dd>
              </div>
              {order.deliveryFeeCents > 0 ? (
                <div className="flex justify-between text-ink-soft">
                  <dt>Entrega</dt>
                  <dd data-numeric>{formatCents(order.deliveryFeeCents)}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between pt-1">
                <dt className="text-ink">Total</dt>
                <dd className="font-display text-xl text-ink" data-numeric>
                  {formatCents(order.totalCents)}
                </dd>
              </div>
            </dl>
          </Panel>

          <Link
            href={href(isPreorder ? '/encomenda' : '/')}
            className="flex h-12 items-center justify-center rounded-full bg-surface text-sm font-medium text-ink-soft ring-1 ring-inset ring-border transition-[box-shadow,transform] hover:ring-border-strong active:scale-[0.98]"
          >
            {isPreorder ? 'Fazer outra encomenda' : 'Voltar ao cardápio'}
          </Link>
        </>
      ) : loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando">
          <div className="shimmer h-64 rounded-[1.75rem]" />
          <div className="shimmer h-40 rounded-[1.5rem]" />
        </div>
      ) : (
        <Panel className="animate-rise">
          <div className="flex flex-col items-center py-2 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-mode-tint text-mode-ink">
              <KindIcon size={26} />
            </span>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              {isPreorder ? 'Encomenda' : 'Pedido'}
            </p>
            <h1 className="text-4xl text-ink" data-numeric>
              #{params.code}
            </h1>
            <p className="mt-1.5 max-w-xs text-sm text-ink-muted">
              Confirme o telefone usado {isPreorder ? 'na encomenda' : 'no pedido'} para ver como ele está.
            </p>
          </div>

          {error ? (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          ) : null}

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void load(phone);
            }}
          >
            <Field label="Telefone" required>
              {(props) => (
                <Input
                  {...props}
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  enterKeyHint="go"
                  autoFocus
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 98765-4321"
                />
              )}
            </Field>
            <SubmitButton type="submit" loading={loading}>
              {isPreorder ? 'Ver encomenda' : 'Ver pedido'}
            </SubmitButton>
          </form>
        </Panel>
      )}
    </div>
  );
}

/** "Enviado!" — um check que se desenha e dez confetes. CSS puro. */
function Celebration({ isPreorder }: { isPreorder: boolean }) {
  return (
    <div className="flex flex-col items-center pb-2 pt-3 text-center">
      <div className="relative size-24">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -ml-1 -mt-1 size-2 animate-burst rounded-full"
            style={{
              ['--angle' as string]: `${index * 36}deg`,
              backgroundColor: index % 2 ? 'var(--color-mode)' : 'var(--color-warning-500)',
            }}
          />
        ))}
        <svg viewBox="0 0 52 52" className="relative size-24" aria-hidden="true">
          <circle cx="26" cy="26" r="24" className="animate-pop fill-mode" />
          <path
            d="M15 27.5l7 7 15-16"
            fill="none"
            stroke="var(--color-ink-inverse)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="40"
            className="animate-draw"
          />
        </svg>
      </div>
      <h1 className="mt-4 text-[1.9rem] leading-tight text-ink">
        {isPreorder ? 'Encomenda enviada!' : 'Pedido enviado!'}
      </h1>
      <p className="mt-1.5 max-w-xs text-sm text-ink-muted">
        {isPreorder
          ? 'Agora é com a loja: ela confirma a data pelo telefone e combina o pagamento.'
          : 'A loja já recebeu. Esta página se atualiza sozinha enquanto ele anda.'}
      </p>
    </div>
  );
}

function StatusCard({ order, isPreorder }: { order: AnyOrder; isPreorder: boolean }) {
  const steps = stepsFor(order, isPreorder);
  const labels: Record<string, string> = isPreorder ? DEFAULT_PREORDER_LABELS : DEFAULT_DELIVERY_LABELS;
  const canceled = order.status === 'canceled';
  const finished = order.status === 'completed';
  const current = steps.indexOf(order.status);
  const live = !finished && !canceled;

  const Icon = isPreorder ? CalendarIcon : order.fulfillment === 'delivery' ? ScooterIcon : StoreIcon;
  const kind = isPreorder
    ? `Encomenda · ${order.fulfillment === 'delivery' ? 'entrega' : 'retirada'}`
    : `Pedido para hoje · ${order.fulfillment === 'delivery' ? 'entrega' : 'retirada'}`;

  return (
    <section className="relative animate-rise overflow-hidden rounded-[1.75rem] bg-surface shadow-raised ring-1 ring-border/70">
      <div className="relative bg-mode px-5 pb-6 pt-4 text-ink-inverse">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-inverse/85">
          <Icon size={15} />
          {kind}
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <p className="font-display text-[2.6rem] leading-none" data-numeric>
            #{order.code}
          </p>
          <div className="min-w-0 text-right text-sm leading-snug">
            {'dueDate' in order ? (
              <>
                <span className="block text-ink-inverse/75">
                  {order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}
                </span>
                <span className="block font-semibold first-letter:uppercase">
                  {formatDayLong(order.dueDate)}
                  {order.dueTime ? ` · ${order.dueTime}` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="block text-ink-inverse/75">Enviado</span>
                <span className="block font-semibold" data-numeric>
                  {formatDateTime(order.placedAt)}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Os dois recortes da costura: o cartão parece um canhoto. */}
        <span aria-hidden="true" className="absolute -bottom-2.5 -left-2.5 size-5 rounded-full bg-canvas" />
        <span aria-hidden="true" className="absolute -bottom-2.5 -right-2.5 size-5 rounded-full bg-canvas" />
      </div>

      <div className="px-5 py-5">
        {canceled ? (
          <div className="flex items-start gap-3 rounded-2xl bg-danger-50 px-4 py-3 text-danger-700">
            <CloseIcon size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{order.statusLabel}</p>
              <p className="text-sm opacity-90">Se tiver alguma dúvida, fale com a loja.</p>
            </div>
          </div>
        ) : current === -1 ? (
          <p className="font-semibold text-ink">{order.statusLabel}</p>
        ) : (
          <ol aria-label="Andamento">
            {steps.map((step, index) => {
              const state = finished || index < current ? 'done' : index === current ? 'current' : 'todo';
              const showHint = index === current;

              return (
                <li
                  key={step}
                  aria-current={index === current ? 'step' : undefined}
                  className="relative flex gap-3.5 pb-5 last:pb-0"
                >
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-[0.6875rem] top-7 w-0.5 overflow-hidden rounded-full bg-sand-200"
                    >
                      <span
                        className="block w-full bg-mode transition-[height] duration-700 ease-[var(--ease-out-soft)]"
                        style={{ height: finished || index < current ? '100%' : '0%' }}
                      />
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      'relative grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-500',
                      state === 'todo' ? 'bg-sand-200' : 'bg-mode text-ink-inverse',
                    )}
                  >
                    {state === 'done' ? (
                      <CheckIcon size={14} strokeWidth={2.5} />
                    ) : state === 'current' ? (
                      <>
                        <span className="absolute inset-0 animate-ping rounded-full bg-mode opacity-40" />
                        <span className="relative size-2 rounded-full bg-ink-inverse" />
                      </>
                    ) : (
                      <span className="size-1.5 rounded-full bg-sand-400" />
                    )}
                  </span>

                  <div className="min-w-0 pt-0.5">
                    <p
                      className={cn(
                        'text-sm',
                        index === current
                          ? 'font-semibold text-ink'
                          : state === 'done'
                            ? 'text-ink-soft'
                            : 'text-ink-muted',
                      )}
                    >
                      {/* A etapa atual usa o rótulo da loja (D18); as outras, o padrão. */}
                      {index === current ? order.statusLabel : (labels[step] ?? step)}
                    </p>
                    {showHint ? (
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {hintFor(order.status, isPreorder, order.fulfillment)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {live ? (
          <p className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-mode opacity-60" />
              <span className="relative size-2 rounded-full bg-mode" />
            </span>
            Atualiza sozinho a cada 20 segundos
          </p>
        ) : null}
      </div>
    </section>
  );
}
