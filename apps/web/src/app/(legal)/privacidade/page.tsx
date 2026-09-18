import type { Metadata } from 'next';

/**
 * Política de privacidade — ESQUELETO.
 *
 * Existe porque o formulário de teste pede CPF, e um link quebrado ao lado da
 * caixa de consentimento é pior do que nenhum link: a pessoa clica, cai num
 * 404 e aceita assim mesmo, o que não vale como consentimento informado.
 *
 * As seções abaixo são as que a LGPD exige que estejam respondidas, na ordem
 * em que fazem sentido para quem lê. O texto de cada uma precisa ser escrito —
 * de preferência revisado por quem entende do assunto — ANTES de a landing ir
 * ao ar. Este arquivo é onde ele entra.
 */

export const metadata: Metadata = {
  title: 'Política de privacidade',
  robots: { index: false, follow: false },
};

/** Ver a nota em `app/page.tsx`: a CSP com nonce exige render por requisição. */
export const dynamic = 'force-dynamic';

const SECOES = [
  {
    titulo: 'Quem somos e quem é o controlador dos dados',
    pendente:
      'Razão social, CNPJ, endereço e o canal para falar com o encarregado (DPO).',
  },
  {
    titulo: 'Que dados coletamos, e em qual momento',
    pendente:
      'Separar em três: dados do lojista no cadastro (nome, e-mail, telefone, CPF), dados operacionais da loja (produtos, pedidos, custos) e dados dos clientes finais que o lojista registra no sistema.',
  },
  {
    titulo: 'Por que coletamos cada um deles',
    pendente:
      'A base legal de cada finalidade. O CPF, em particular: execução de contrato e obrigação legal ligada à emissão da cobrança — não marketing, não enriquecimento de base.',
  },
  {
    titulo: 'Com quem esses dados são compartilhados',
    pendente:
      'Nomear os operadores: gateway de pagamento, provedor de e-mail, hospedagem. Dizer o que cada um recebe e por quê.',
  },
  {
    titulo: 'Dados de pagamento',
    pendente:
      'Registrar o que já é verdade no produto: o número do cartão é digitado na página do provedor de pagamento e não trafega nem é armazenado pelo Cantina.',
  },
  {
    titulo: 'Por quanto tempo guardamos',
    pendente:
      'Prazo por tipo de dado, incluindo o que acontece depois do cancelamento da conta.',
  },
  {
    titulo: 'Seus direitos, e como exercê-los',
    pendente:
      'Acesso, correção, eliminação, portabilidade e revogação de consentimento — com o canal e o prazo de resposta.',
  },
  {
    titulo: 'Como protegemos os dados',
    pendente:
      'Descrever as medidas reais, sem adjetivo: isolamento por empresa no banco, criptografia em trânsito, controle de acesso da equipe.',
  },
  {
    titulo: 'Cookies',
    pendente:
      'Hoje o site usa apenas o cookie de sessão do painel, necessário para o login funcionar. Se um dia entrar medição ou anúncio, esta seção e o aviso de cookies mudam juntos.',
  },
  {
    titulo: 'Mudanças nesta política',
    pendente: 'Como avisamos, e a data da última atualização.',
  },
];

export default function PrivacidadePage() {
  return (
    <>
      <h1 className="font-display text-3xl text-ink sm:text-4xl">
        Política de privacidade
      </h1>

      <div className="mt-6 rounded-card border border-warning-500/25 bg-warning-50 px-4 py-3">
        <p className="text-sm font-medium text-warning-700">
          Documento em preparação — não publicar a landing antes de preenchê-lo.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-warning-700/90">
          O cadastro do teste coleta CPF. Enquanto este texto não existir, o
          consentimento pedido no formulário não se sustenta.
        </p>
      </div>

      <div className="mt-10 space-y-8">
        {SECOES.map((secao, index) => (
          <section key={secao.titulo}>
            <h2 className="font-display text-xl text-ink">
              {index + 1}. {secao.titulo}
            </h2>
            <p className="mt-2 rounded-card border border-dashed border-border bg-sand-50 px-4 py-3 text-sm leading-relaxed text-ink-muted">
              {/* PLACEHOLDER: texto definitivo desta seção. */}
              {secao.pendente}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
