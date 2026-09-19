'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';

import {
  CalendarIcon,
  CheckIcon,
  CustomersIcon,
  StockIcon,
  StoreIcon,
} from '../layout/icons';
import { cn } from '../../lib/cn';
import { CalendarMockup, CustomersMockup, OrdersMockup, StockMockup } from './mockups';

/**
 * Os quatro módulos, em abas.
 *
 * Quatro seções empilhadas dariam quatro telas de rolagem dizendo a mesma
 * coisa em ritmos diferentes. Em abas, quem só quer saber de encomenda chega
 * lá em um clique — e quem está passando o olho vê que existem quatro.
 *
 * O padrão de tablist é o do WAI-ARIA: seta troca a aba, Home/End vão às
 * pontas, e só a aba ativa fica no caminho do Tab. Sem isso, um teclado
 * atravessa quatro botões antes de chegar ao conteúdo.
 *
 * As âncoras (`#vender`, `#encomendar`…) existem porque o menu do cabeçalho
 * aponta para elas: cair na seção com a aba errada aberta seria um link
 * quebrado com aparência de link certo.
 */

interface Tab {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  lead: string;
  bullets: string[];
  mockup: ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  {
    id: 'vender',
    label: 'Vender',
    icon: StoreIcon,
    title: 'Seu cardápio no ar, e o pedido chegando pronto no WhatsApp',
    lead: 'A cliente abre o link, monta o pedido com os tamanhos e recheios que você cadastrou e envia. Chega formatado, com endereço e forma de pagamento, e não como sete mensagens soltas que você precisa juntar entre uma fornada e outra.',
    bullets: [
      'Endereço próprio da sua loja, do tamanho certo para a bio do Instagram',
      'Tamanho, recheio, cobertura e adicional com o preço somando sozinho',
      'Pagamento na hora do pedido, confirmado automaticamente quando cai',
      'Quadro de delivery separado do de encomenda: sábado cheio não embaralha os dois',
    ],
    mockup: OrdersMockup,
  },
  {
    id: 'encomendar',
    label: 'Encomendar',
    icon: CalendarIcon,
    title: 'A cliente escolhe a data que você realmente dá conta',
    lead: 'Você define quantas encomendas cabem em cada dia. Quem está comprando vê o calendário com os dias abertos e os lotados e escolhe dentro do que é possível, em vez de você negociar prazo por mensagem às onze da noite.',
    bullets: [
      'Limite de encomendas por dia, definido por você e por tipo de produto',
      'Dia lotado nem aparece como opção para quem está comprando',
      'Sinal ou pagamento integral no ato da reserva, do jeito que você trabalha',
      'A tela do dia mostra tudo que precisa sair, na ordem das retiradas',
    ],
    mockup: CalendarMockup,
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: StockIcon,
    title: 'Insumo e embalagem saindo do estoque a cada venda',
    lead: 'Cada produto tem sua ficha. Quando sai um delivery ou uma encomenda, o chantilly, a farinha e a caixa saem junto, do mesmo estoque, porque a geladeira é uma só, mesmo quando a venda veio por dois caminhos.',
    bullets: [
      'Baixa automática pela receita, tanto na venda quanto na produção',
      'Aviso quando um item chega no mínimo que você marcou',
      'Encomenda agendada já reserva o que vai precisar no dia',
      'Compras e fornecedores registrados, com o preço pago em cada uma',
    ],
    mockup: StockMockup,
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: CustomersIcon,
    title: 'Quem compra, o que compra e quem parou de aparecer',
    lead: 'Cada pedido entra no histórico de quem fez. Na hora de avisar do sabor novo, ou de lembrar do bolo que aquela família encomenda todo ano na mesma semana, a lista já está pronta e é sua.',
    bullets: [
      'Histórico completo, com delivery e encomenda no mesmo lugar',
      'Telefone e endereço preenchidos a partir do próprio pedido',
      'Datas que se repetem ficam visíveis: aniversário, formatura, chá',
      // Nada de "exportável" aqui: exportação ainda não existe no produto, e
      // bullet de landing é promessa. Volta quando a tela de exportação vier.
      'A lista é sua, na sua conta, e não dentro do aplicativo de entrega de outra empresa',
    ],
    mockup: CustomersMockup,
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Chegou por `#encomendar` vindo do menu: abre a aba certa. Também cobre o
  // caso de alguém colar o link direto no navegador.
  useEffect(() => {
    function syncFromHash() {
      const hash = window.location.hash.replace('#', '');
      const index = TABS.findIndex((tab) => tab.id === hash);
      if (index >= 0) setActive(index);
    }

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (active + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (active + last) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;

    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const current = TABS[active]!;
  const Mockup = current.mockup;

  return (
    <section className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28" id="recursos">
      {/* Alvos de rolagem do menu — invisíveis, um por aba. */}
      {TABS.map((tab) => (
        <span key={tab.id} id={tab.id} aria-hidden="true" className="absolute -top-20" />
      ))}

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="appear max-w-2xl">
          <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
            Quatro coisas que hoje moram em quatro lugares diferentes
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            Cardápio no Instagram, encomenda no caderno, estoque na cabeça e o preço no
            chute. O Cantina junta os quatro e faz um conversar com o outro.
          </p>
        </div>

        {/* Trilha de abas: rola de lado no celular em vez de quebrar em duas
            linhas, que faria a quarta aba parecer de outra seção. */}
        <div
          role="tablist"
          aria-label="Módulos do Cantina"
          onKeyDown={onKeyDown}
          className="no-scrollbar mt-9 flex gap-2 overflow-x-auto pb-1"
        >
          {TABS.map((tab, index) => {
            const selected = index === active;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`aba-${tab.id}`}
                aria-selected={selected}
                aria-controls={`painel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(index)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]',
                  selected
                    ? 'border-clay-500 bg-clay-500 text-ink-inverse shadow-soft'
                    : 'border-border bg-surface text-ink-soft hover:border-border-strong hover:bg-sand-50 hover:text-ink',
                )}
              >
                <tab.icon size={17} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`painel-${current.id}`}
          aria-labelledby={`aba-${current.id}`}
          tabIndex={0}
          className="mt-6 rounded-panel border border-border bg-surface p-5 shadow-soft sm:p-8 lg:p-10"
        >
          <div
            key={current.id}
            className="grid animate-rise gap-8 lg:grid-cols-2 lg:items-center lg:gap-12"
          >
            <Mockup className="order-2 shadow-soft lg:order-1" />

            <div className="order-1 lg:order-2">
              <h3 className="font-display text-2xl leading-snug text-ink sm:text-3xl">
                {current.title}
              </h3>
              <p className="mt-4 leading-relaxed text-ink-soft">{current.lead}</p>

              <ul className="mt-6 space-y-3">
                {current.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-olive-100 text-olive-700">
                      <CheckIcon size={13} />
                    </span>
                    <span className="text-sm leading-relaxed text-ink-soft">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
