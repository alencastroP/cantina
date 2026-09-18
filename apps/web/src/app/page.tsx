import type { Metadata } from 'next';

import { ComparisonSection } from '../components/landing/comparison-section';
import { DualCards } from '../components/landing/dual-cards';
import { FaqSection } from '../components/landing/faq-section';
import { FeatureTabs } from '../components/landing/feature-tabs';
import { FinalCta } from '../components/landing/final-cta';
import { FinanceCard } from '../components/landing/finance-card';
import { Hero } from '../components/landing/hero';
import { IntegrationsSection } from '../components/landing/integrations-section';
import { LogoStrip } from '../components/landing/logo-strip';
import { OnboardingTimeline } from '../components/landing/onboarding-timeline';
import { SiteFooter } from '../components/landing/site-footer';
import { SiteHeader } from '../components/landing/site-header';
import { StatsSection } from '../components/landing/stats-section';
import { TestimonialSection } from '../components/landing/testimonial-section';

/**
 * Landing do domínio raiz.
 *
 * Só existe aqui: sob um host de vitrine, o middleware reescreve para
 * `/loja/[host]` e esta página nunca é alcançada.
 *
 * Componente de SERVIDOR. As únicas ilhas de JavaScript na página são o
 * cabeçalho (menus) e as abas de módulos — o FAQ usa `<details>` nativo e o
 * resto é HTML. Menos script aqui significa três coisas ao mesmo tempo: a
 * página abre rápido no 4G de quem está no meio da produção, a CSP pode ser
 * apertada (ver `middleware.ts`), e há menos código de terceiro capaz de ler
 * qualquer coisa desta origem.
 *
 * A ordem das seções segue uma conversa, não uma lista de recursos:
 *
 *    1 cabeçalho        as duas portas: entrar e experimentar
 *    2 hero             o que é, para quem, e a condição do teste sem letra miúda
 *    3 logos            quem já confia (placeholders até haver autorização)
 *    4 abas             os quatro módulos, sem quatro telas de rolagem
 *    5 dois cartões     o que caderno nenhum resolve: receber e saber o custo
 *    6 financeiro       "e valeu a pena?", que é a pergunta do fim do mês
 *    7 comparativo      o reconhecimento — a semana dela, descrita
 *    8 integrações      não vai trocar o WhatsApp, vai parar de usá-lo como caderno
 *    9 números          prova de escala (marcadores até alguém medir)
 *   10 depoimento       prova de gente
 *   11 como começar     desarma o medo de ter que cadastrar tudo sozinha
 *   12 dúvidas          o que trava a decisão, respondido sem promessa falsa
 */

export const metadata: Metadata = {
  title: 'Cantina · Sistema para doceria, confeitaria e bolo sob encomenda',
  description:
    'Vitrine com pedido pelo WhatsApp, calendário de encomendas, controle de estoque e custo real por receita. Feito para quem vive de fazer doce.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Cantina · Sua doceria vende, agenda e fecha o mês no mesmo lugar',
    description:
      'Vitrine, encomendas com calendário, estoque de insumo e custo por receita — sem planilha e sem comissão por pedido.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Cantina',
    /* PLACEHOLDER: imagem de compartilhamento (1200×630) em
       `public/landing/og.jpg`. Sem ela, o link colado no WhatsApp aparece sem
       cartão — que é exatamente onde esta landing mais vai circular. */
  },
  robots: { index: true, follow: true },
};

/**
 * Renderizada a cada requisição, e não no build.
 *
 * É exigência da CSP com nonce (ver `middleware.ts`): o nonce muda a cada
 * requisição, e uma página congelada no build sairia com o nonce errado — ou,
 * como acontece de fato, sem nonce nenhum. Como a política usa
 * `strict-dynamic`, o `'self'` deixa de valer e TODO script sem nonce é
 * bloqueado: a página apareceria inteira e morta, com o menu e as abas sem
 * responder.
 *
 * O custo é pequeno e vale medir antes de mexer: não há busca de dado nenhuma
 * aqui, então renderizar é montar uma árvore de componentes estáticos. O que
 * se perde é o cache de HTML na borda — se um dia isso pesar, o caminho é
 * medir primeiro e só então decidir entre a CSP com nonce e o cache.
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <Hero />
        <LogoStrip />
        <FeatureTabs />
        <DualCards />
        <FinanceCard />
        <ComparisonSection />
        <IntegrationsSection />
        <StatsSection />
        <TestimonialSection />
        <OnboardingTimeline />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
