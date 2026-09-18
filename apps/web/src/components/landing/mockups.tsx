import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChatIcon,
  ClockIcon,
  ScooterIcon,
} from '../layout/icons';
import { cn } from '../../lib/cn';

/**
 * Mockups do produto, desenhados em CSS.
 *
 * NÃO são screenshots e não tentam ser. Um print de verdade numa landing
 * envelhece na primeira mudança de tela, fica ilegível no celular e — o que
 * pesa mais aqui — costuma sair com dado de cliente real dentro: nome, telefone,
 * endereço de entrega. Um desenho não tem esse risco, carrega uns poucos KB e
 * pode exagerar o que importa na seção onde está.
 *
 * Quando houver print de verdade, ele entra assim:
 *
 *   - screenshot de uma loja de DEMONSTRAÇÃO, nunca de um cliente;
 *   - conferido contra nome, telefone, endereço e valor visíveis na imagem;
 *   - via `next/image`, com `alt` descrevendo o que a tela mostra.
 *
 * Os valores que aparecem dentro deles são ILUSTRAÇÃO de uma tela — um dia de
 * uma doceria imaginária, como num anúncio de calculadora que mostra "1234" no
 * visor. Não são métrica da plataforma nem dado de cliente, e por isso ficam
 * dentro do desenho, nunca em texto corrido da página. Estatística sobre o
 * Cantina mora em `config.ts`, marcada como pendente até alguém medir.
 *
 * Todos aceitam `className` para o container ajustar largura e sombra.
 */

/* -------------------------------------------------------------------------- */
/* Peças compartilhadas                                                        */
/* -------------------------------------------------------------------------- */

/** Moldura de "janela do sistema": barra de título e corpo claro. */
function Frame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-panel border border-border bg-surface',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-sand-100 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-clay-300" />
        <span className="h-2 w-2 rounded-full bg-honey-300" />
        <span className="h-2 w-2 rounded-full bg-olive-300" />
        <p className="ml-1.5 text-xs font-medium text-ink-muted">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Barra de progresso fina — usada em estoque e em meta do mês. */
function Bar({ percent, tone }: { percent: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pedidos — vitrine e kanban                                                  */
/* -------------------------------------------------------------------------- */

const ORDERS = [
  { code: '#1842', who: 'Entrega · Vila Nova', total: '68,00', tone: 'clay' },
  { code: '#1841', who: 'Retirada · balcão', total: '24,50', tone: 'olive' },
  { code: '#1840', who: 'Entrega · Centro', total: '112,00', tone: 'clay' },
];

export function OrdersMockup({ className }: { className?: string }) {
  return (
    <Frame title="Pedidos de hoje" className={className}>
      <div className="space-y-2.5">
        {ORDERS.map((order, index) => (
          <div
            key={order.code}
            className="flex items-center gap-3 rounded-card border border-border bg-canvas px-3 py-2.5"
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                order.tone === 'clay'
                  ? 'bg-clay-100 text-clay-700'
                  : 'bg-olive-100 text-olive-700',
              )}
            >
              {order.tone === 'clay' ? <ScooterIcon size={16} /> : <CheckIcon size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink" data-numeric>
                {order.code}
              </p>
              <p className="truncate text-[0.7rem] text-ink-muted">{order.who}</p>
            </div>
            <p className="text-xs font-medium text-ink" data-numeric>
              R$ {order.total}
            </p>
            {index === 0 ? (
              <span className="rounded-full bg-clay-500 px-2 py-0.5 text-[0.65rem] font-medium text-ink-inverse">
                novo
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-card bg-olive-50 px-3 py-2 text-[0.7rem] text-olive-700">
        <ChatIcon size={14} />
        <span>Confirmação enviada no WhatsApp do cliente</span>
      </div>
    </Frame>
  );
}

/**
 * Versão compacta para flutuar sobre a foto do hero.
 *
 * Menos linhas e tipografia maior: ele é lido de canto de olho, sobre uma
 * imagem, e não como conteúdo principal.
 */
export function HeroCardMockup({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-[17rem] rounded-panel border border-sand-200 bg-surface p-4 shadow-float sm:w-[19rem]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">Sábado, 14h20</p>
        <span className="flex items-center gap-1 rounded-full bg-clay-50 px-2 py-0.5 text-[0.65rem] font-medium text-clay-700">
          <BellIcon size={11} /> 3 novos
        </span>
      </div>

      <p className="mt-3 font-display text-2xl text-ink">
        R$ 1.240<span className="text-base text-ink-muted">,00</span>
      </p>
      <p className="text-xs text-ink-muted">vendido hoje · 18 pedidos</p>

      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2.5 rounded-card bg-canvas px-2.5 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-berry-100 text-berry-700">
            <CalendarIcon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] font-medium text-ink">
              Bolo 2 andares · retirada 16h
            </p>
            <p className="text-[0.65rem] text-ink-muted">encomenda de domingo</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-card bg-canvas px-2.5 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-honey-100 text-honey-700">
            <ClockIcon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] font-medium text-ink">
              Chantilly: 2 dias de estoque
            </p>
            <p className="text-[0.65rem] text-ink-muted">repor antes de sexta</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Encomendas — calendário                                                     */
/* -------------------------------------------------------------------------- */

/** Dias do mês com carga de trabalho: o que a doceria vê ao abrir a agenda. */
const DAYS = [
  { day: 1, load: 0 },
  { day: 2, load: 1 },
  { day: 3, load: 0 },
  { day: 4, load: 2 },
  { day: 5, load: 3 },
  { day: 6, load: 3, today: true },
  { day: 7, load: 1 },
  { day: 8, load: 0 },
  { day: 9, load: 0 },
  { day: 10, load: 2 },
  { day: 11, load: 3, full: true },
  { day: 12, load: 3, full: true },
  { day: 13, load: 1 },
  { day: 14, load: 0 },
];

const LOAD_TONE = ['bg-sand-100 text-ink-muted', 'bg-berry-50', 'bg-berry-100', 'bg-berry-200'];

export function CalendarMockup({ className }: { className?: string }) {
  return (
    <Frame title="Agenda de encomendas" className={className}>
      <div className="grid grid-cols-7 gap-1.5">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => (
          <p
            key={`${label}-${index}`}
            className="pb-1 text-center text-[0.65rem] font-medium text-ink-muted"
          >
            {label}
          </p>
        ))}

        {DAYS.map((entry) => (
          <div
            key={entry.day}
            className={cn(
              'relative flex aspect-square items-center justify-center rounded-lg text-[0.7rem] font-medium text-berry-800',
              LOAD_TONE[entry.load],
              entry.today && 'ring-2 ring-berry-500 ring-offset-1 ring-offset-surface',
              entry.full && 'text-berry-900',
            )}
            data-numeric
          >
            {entry.day}
            {entry.full ? (
              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-berry-600" />
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-card bg-berry-50 px-3 py-2">
        <p className="text-[0.7rem] font-medium text-berry-800">Dias 11 e 12 lotados</p>
        <p className="text-[0.65rem] text-berry-700">cliente não consegue escolher</p>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagamento                                                                   */
/* -------------------------------------------------------------------------- */

const PAYMENT_STEPS = [
  { label: 'Encomenda reservada', detail: 'bolo 2 andares · sábado, 16h', done: true },
  { label: 'Sinal de 50% pago no Pix', detail: 'R$ 96,00 · confirmado em 4s', done: true },
  { label: 'Data bloqueada na agenda', detail: 'ninguém mais consegue pegar', done: true },
  { label: 'Restante na retirada', detail: 'R$ 96,00 a receber', done: false },
];

export function PaymentMockup({ className }: { className?: string }) {
  return (
    <Frame title="Reserva confirmada" className={className}>
      <ol className="space-y-3">
        {PAYMENT_STEPS.map((step, index) => (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  step.done
                    ? 'bg-berry-500 text-sand-50'
                    : 'border border-dashed border-berry-300 text-berry-400',
                )}
              >
                {step.done ? <CheckIcon size={13} /> : <ClockIcon size={12} />}
              </span>
              {index < PAYMENT_STEPS.length - 1 ? (
                <span className="mt-1 w-px flex-1 bg-berry-200" />
              ) : null}
            </div>

            <div className="min-w-0 pb-1">
              <p className="text-[0.72rem] font-medium text-ink">{step.label}</p>
              <p className="text-[0.65rem] text-ink-muted" data-numeric>
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Custo de receita                                                            */
/* -------------------------------------------------------------------------- */

const INGREDIENTS = [
  { name: 'Chocolate meio amargo', qty: '600 g', cost: '21,60' },
  { name: 'Creme de leite fresco', qty: '400 ml', cost: '13,20' },
  { name: 'Embalagem + fita', qty: '1 un', cost: '4,10' },
];

export function CostMockup({ className }: { className?: string }) {
  return (
    <Frame title="Ficha técnica · Torta de chocolate" className={className}>
      <div className="space-y-1.5">
        {INGREDIENTS.map((item) => (
          <div key={item.name} className="flex items-baseline gap-2 text-[0.7rem]">
            <span className="min-w-0 flex-1 truncate text-ink-soft">{item.name}</span>
            <span className="shrink-0 text-ink-muted" data-numeric>
              {item.qty}
            </span>
            <span className="w-14 shrink-0 text-right font-medium text-ink" data-numeric>
              R$ {item.cost}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5">
        <p className="text-xs font-medium text-ink-soft">Custo da torta</p>
        <p className="font-display text-lg text-honey-700" data-numeric>
          R$ 38,90
        </p>
      </div>

      {/* O ponto da seção: o mesmo doce rende diferente em cada canal. */}
      <div className="mt-3 space-y-2 rounded-card bg-honey-50 p-3">
        <div className="flex items-center justify-between text-[0.7rem]">
          <span className="text-honey-800">Vendendo pela sua vitrine</span>
          <span className="font-medium text-olive-700" data-numeric>
            sobra R$ 51,10
          </span>
        </div>
        <Bar percent={78} tone="bg-olive-500" />

        <div className="flex items-center justify-between pt-1 text-[0.7rem]">
          <span className="text-honey-800">
            Com taxa de app <span className="text-honey-700">[%]</span>
          </span>
          <span className="font-medium text-clay-700" data-numeric>
            sobra R$ 23,10
          </span>
        </div>
        {/* PLACEHOLDER: a taxa varia por plataforma e por negociação — o número
            entra quando o comercial definir qual usar como referência. */}
        <Bar percent={35} tone="bg-clay-400" />
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Estoque                                                                     */
/* -------------------------------------------------------------------------- */

const SUPPLIES = [
  { name: 'Chantilly', left: '1,2 kg', percent: 14, low: true },
  { name: 'Farinha de trigo', left: '18 kg', percent: 72, low: false },
  { name: 'Caixa para bolo P', left: '9 un', percent: 22, low: true },
  { name: 'Ovos', left: '11 dz', percent: 55, low: false },
];

export function StockMockup({ className }: { className?: string }) {
  return (
    <Frame title="Insumos e embalagens" className={className}>
      <div className="space-y-3">
        {SUPPLIES.map((item) => (
          <div key={item.name} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[0.7rem] font-medium text-ink-soft">
                {item.name}
                {item.low ? (
                  <span className="ml-1.5 rounded-full bg-clay-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-clay-700">
                    repor
                  </span>
                ) : null}
              </p>
              <p className="shrink-0 text-[0.7rem] text-ink-muted" data-numeric>
                {item.left}
              </p>
            </div>
            <Bar percent={item.percent} tone={item.low ? 'bg-clay-400' : 'bg-olive-400'} />
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-card bg-clay-50 px-3 py-2 text-[0.7rem] text-clay-700">
        A encomenda de domingo consome 2 kg de chantilly. Falta comprar.
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Clientes                                                                    */
/* -------------------------------------------------------------------------- */

const CUSTOMERS = [
  { name: 'Cliente A', detail: '9 pedidos · última compra há 6 dias', tag: 'fiel' },
  { name: 'Cliente B', detail: 'sempre encomenda bolo de aniversário', tag: 'data' },
  { name: 'Cliente C', detail: '1 pedido · há 4 meses', tag: 'sumiu' },
];

const TAG_TONE: Record<string, string> = {
  fiel: 'bg-olive-100 text-olive-700',
  data: 'bg-berry-100 text-berry-700',
  sumiu: 'bg-sand-200 text-ink-muted',
};

export function CustomersMockup({ className }: { className?: string }) {
  return (
    <Frame title="Clientes" className={className}>
      <div className="space-y-2">
        {CUSTOMERS.map((customer) => (
          <div
            key={customer.name}
            className="flex items-center gap-3 rounded-card border border-border bg-canvas px-3 py-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-200 text-[0.7rem] font-medium text-ink-soft">
              {/* PLACEHOLDER: iniciais de cliente real nunca entram aqui. */}
              {customer.name.slice(-1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-ink">{customer.name}</p>
              <p className="truncate text-[0.65rem] text-ink-muted">{customer.detail}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium',
                TAG_TONE[customer.tag],
              )}
            >
              {customer.tag}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Financeiro                                                                  */
/* -------------------------------------------------------------------------- */

const MONTHS = [42, 55, 48, 71, 64, 88];

export function FinanceMockup({ className }: { className?: string }) {
  return (
    <Frame title="Fechamento do mês" className={className}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[0.7rem] text-ink-muted">Entrou</p>
          <p className="font-display text-xl text-olive-700" data-numeric>
            R$ 18.420
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.7rem] text-ink-muted">Saiu</p>
          <p className="font-display text-xl text-clay-700" data-numeric>
            R$ 9.760
          </p>
        </div>
      </div>

      {/* Colunas dos últimos meses — a leitura é a tendência, não o valor. */}
      <div className="mt-4 flex h-20 items-end gap-1.5">
        {MONTHS.map((height, index) => (
          <div
            key={index}
            className={cn(
              'flex-1 rounded-t-md',
              index === MONTHS.length - 1 ? 'bg-olive-500' : 'bg-olive-200',
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-card bg-olive-50 px-3 py-2">
        <p className="text-[0.7rem] font-medium text-olive-800">Sobrou no mês</p>
        <p className="text-xs font-medium text-olive-700" data-numeric>
          R$ 8.660
        </p>
      </div>
    </Frame>
  );
}
