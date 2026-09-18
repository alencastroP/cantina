/**
 * Perguntas frequentes.
 *
 * `<details>` nativo, sem estado em React e sem uma linha de JavaScript: o
 * acordeão já vem pronto no navegador, funciona com teclado e leitor de tela
 * sem nada nosso, aparece no Ctrl+F da página mesmo fechado e continua
 * funcionando se o script quebrar. Um acordeão feito à mão perde as quatro
 * coisas e ainda cobra alguns KB por isso.
 *
 * O conteúdo segue uma regra: nenhuma resposta promete o que o produto ainda
 * não faz. A pergunta sobre aplicativo nativo é a mais tentadora de enfeitar e
 * é respondida com "ainda não existe" — quem compra por causa de um app que
 * não veio cancela no primeiro mês, e conta para as outras.
 */

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Preciso mesmo colocar cartão para testar?',
    a: (
      <>
        Precisa. Pedimos seu CPF e uma forma de pagamento logo na entrada, para que a
        conta continue de pé no dia seguinte ao fim do teste sem você ter que lembrar de
        nada. <strong className="font-medium">Nada é cobrado durante o período</strong>, e
        dá para cancelar pelo painel a qualquer momento antes do fim. Os dados do cartão
        são digitados numa página do provedor de pagamento — eles não passam pelas telas
        do Cantina nem ficam guardados aqui.
      </>
    ),
  },
  {
    q: 'E se eu desistir no meio do teste?',
    a: (
      <>
        Você cancela pelo próprio painel, sem ligar para ninguém e sem precisar explicar o
        motivo por telefone. Cancelou antes do fim do teste, nenhuma cobrança acontece.
      </>
    ),
  },
  {
    q: 'Minhas clientes vão precisar baixar algum aplicativo?',
    a: (
      <>
        Não. Elas abrem um link no navegador do celular, escolhem o que querem e enviam. É
        a mesma facilidade de mandar mensagem, com a diferença de que o pedido chega
        inteiro e somado em vez de picado em várias mensagens.
      </>
    ),
  },
  {
    q: 'Funciona no celular? Tem aplicativo do Cantina?',
    a: (
      <>
        O painel e a vitrine funcionam no navegador do celular, e foram desenhados
        pensando em quem usa com uma mão só, de pé, no meio do balcão.{' '}
        <strong className="font-medium">
          Aplicativo para instalar ainda não existe — está no nosso plano, mas não é algo
          que você tem hoje.
        </strong>
      </>
    ),
  },
  {
    q: 'Vou ter que cadastrar todos os produtos sozinha?',
    a: (
      <>
        Não. Você manda a lista do jeito que ela existe hoje — print do Instagram,
        planilha, foto do caderno — e a gente cadastra junto com você. Ficha técnica e
        estoque entram depois, com calma, sem travar as vendas enquanto isso.
      </>
    ),
  },
  {
    q: 'Quem consegue ver os dados da minha loja?',
    a: (
      <>
        Você e as pessoas que você convidar para o painel. Cada doceria fica isolada das
        outras dentro do próprio banco de dados, e não por uma regra que algum programa
        precisa lembrar de aplicar — nenhuma outra loja alcança seu cardápio, seu custo ou
        sua lista de clientes.
        {/* PLACEHOLDER: descrever aqui a política real de acesso da equipe do
            Cantina ao dado do lojista (quando, por quem, com qual registro)
            antes de publicar. Enquanto a política não estiver escrita, é
            melhor não dizer nada sobre isso do que dizer o que soa bem. */}
      </>
    ),
  },
  {
    q: 'Vocês ficam com uma porcentagem dos meus pedidos?',
    a: (
      <>
        Não. A assinatura é um valor fixo por mês, e o que você vende é seu. Existe a taxa
        do meio de pagamento que você escolher — Pix, cartão ou boleto —, e ela é do
        provedor, não nossa.
      </>
    ),
  },
  {
    q: 'Já uso aplicativo de entrega. Dá para usar os dois?',
    a: (
      <>
        Dá, e no começo é o mais comum. O Cantina inclusive calcula quanto sobra em cada
        canal, com a comissão do aplicativo descontada — assim a decisão de continuar,
        diminuir ou sair de lá vira conta, e não intuição.
      </>
    ),
  },
];

export function FaqSection() {
  return (
    <section id="duvidas" className="scroll-mt-24 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="appear text-center font-display text-3xl leading-tight text-ink sm:text-4xl">
          Perguntas que sempre aparecem
        </h2>

        <div className="appear mt-10 divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {FAQ.map((item) => (
            <details key={item.q} className="faq-item group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-sand-100 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                <h3 className="font-display text-base font-medium text-ink transition-colors duration-200 group-hover:text-clay-700 sm:text-lg">
                  {item.q}
                </h3>

                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand-200 text-ink-soft transition-[transform,background-color,color] duration-300 ease-out group-hover:bg-clay-100 group-hover:text-clay-700 group-open:rotate-45">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>

              <div className="px-5 pb-5 text-sm leading-relaxed text-ink-soft sm:px-6 sm:pb-6 sm:text-base">
                {item.a}
              </div>
            </details>
          ))}
        </div>

        {/* PLACEHOLDER: canal de contato real (e-mail ou WhatsApp de suporte).
            Enquanto não houver um, o link manda para o passo a passo — melhor
            que anunciar um chat de suporte que ainda não existe. */}
        <p className="mt-8 text-center text-sm text-ink-muted">
          Ficou alguma dúvida de fora?{' '}
          <a
            href="#comecar"
            className="font-medium text-clay-700 underline underline-offset-4"
          >
            Veja como começar
          </a>{' '}
          — e pergunte antes de decidir qualquer coisa.
        </p>
      </div>
    </section>
  );
}
