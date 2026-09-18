import type { Metadata } from 'next';

/**
 * Termos de uso — ESQUELETO.
 *
 * Mesma razão da política de privacidade: a caixa de consentimento do cadastro
 * aponta para cá. As seções abaixo cobrem o que um contrato de assinatura
 * recorrente com período de teste precisa deixar claro — e o que gera disputa
 * quando não deixa.
 */

export const metadata: Metadata = {
  title: 'Termos de uso',
  robots: { index: false, follow: false },
};

/** Ver a nota em `app/page.tsx`: a CSP com nonce exige render por requisição. */
export const dynamic = 'force-dynamic';

const SECOES = [
  {
    titulo: 'O que o Cantina oferece',
    pendente:
      'Descrição do serviço e o que não está incluído. Importante: o app nativo não existe hoje — não pode aparecer aqui como recurso contratado.',
  },
  {
    titulo: 'Conta, acesso e responsabilidade',
    pendente:
      'Quem pode abrir conta, o que acontece com as pessoas que o lojista convida para o painel, e de quem é a responsabilidade pelo que entra no sistema.',
  },
  {
    titulo: 'Período de teste',
    pendente:
      'Duração exata, o que está liberado durante ele, e a regra do cancelamento antes do fim — a mesma que a landing anuncia, palavra por palavra.',
  },
  {
    titulo: 'Assinatura, cobrança e reajuste',
    pendente:
      'Valor, ciclo, meios de pagamento aceitos, o que acontece em caso de atraso (a conta é suspensa antes de ser cancelada) e como um eventual reajuste é comunicado.',
  },
  {
    titulo: 'Cancelamento e reembolso',
    pendente:
      'Como se cancela, quando a conta deixa de funcionar, e o que acontece com os dados depois disso.',
  },
  {
    titulo: 'Dados do lojista e dos clientes dele',
    pendente:
      'Deixar escrito que o cadastro de clientes, os produtos e o histórico são do lojista, e que o Cantina atua como operador em relação aos dados dos clientes finais.',
  },
  {
    titulo: 'Disponibilidade e suporte',
    pendente:
      'Qual compromisso de disponibilidade existe de fato e por qual canal o suporte responde. Não prometer SLA que ninguém está medindo.',
  },
  {
    titulo: 'Uso aceitável',
    pendente:
      'O que não pode ser vendido pela vitrine, e em que casos uma conta pode ser encerrada.',
  },
  {
    titulo: 'Limitação de responsabilidade',
    pendente: 'Redigir com apoio jurídico.',
  },
  {
    titulo: 'Foro e mudanças nestes termos',
    pendente: 'Como as mudanças são comunicadas e a partir de quando valem.',
  },
];

export default function TermosPage() {
  return (
    <>
      <h1 className="font-display text-3xl text-ink sm:text-4xl">Termos de uso</h1>

      <div className="mt-6 rounded-card border border-warning-500/25 bg-warning-50 px-4 py-3">
        <p className="text-sm font-medium text-warning-700">
          Documento em preparação — não publicar a landing antes de preenchê-lo.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-warning-700/90">
          A tela de cadastro pede aceite destes termos antes de abrir a página de
          pagamento.
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
