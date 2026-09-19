import { CardIcon, ChatIcon, ShieldIcon, StoreIcon } from '../layout/icons';

/**
 * Integrações, em fundo escuro.
 *
 * O escuro corta a página no meio: até aqui era o produto, daqui em diante é a
 * prova. Marrom, nunca preto — o resto da paleta é quente e um bloco neutro
 * pareceria recortado de outro site.
 *
 * Nenhum logotipo de terceiro é desenhado aqui. Citar o nome de um serviço com
 * o qual o sistema realmente conversa é informação; reproduzir a marca dele é
 * sugerir uma parceria que ninguém assinou.
 *
 * O quarto bloco é sobre isolamento de dados, e não é enfeite: cada empresa
 * tem sua fatia separada no banco, com a regra valendo no próprio Postgres
 * (RLS). Está aqui porque é a pergunta que toda dona de loja faz quando
 * entende que a lista de clientes dela vai morar em algum servidor.
 */

const ITEMS = [
  {
    icon: ChatIcon,
    title: 'WhatsApp',
    text: 'O pedido chega no número da loja já formatado, e a confirmação sai pelo mesmo caminho. Sua cliente continua falando com você onde ela já falava. Ninguém precisa instalar nada.',
  },
  {
    icon: CardIcon,
    title: 'Pix, cartão e boleto',
    /* PLACEHOLDER: se o comercial quiser nomear o gateway, o nome entra aqui.
       Enquanto não houver decisão, descrever a função é mais seguro do que
       anunciar uma marca parceira. */
    text: 'A cobrança sai pelo gateway de pagamento e a confirmação volta sozinha para o sistema, em segundos. Nenhum dado de cartão passa pelo Cantina: ele é digitado na página do provedor.',
  },
  {
    icon: StoreIcon,
    title: 'Endereço próprio',
    text: 'Sua vitrine tem um endereço da sua loja, e pode usar um domínio seu se você já tiver um. O link que você põe na bio é seu, e continua funcionando se um dia você sair daqui.',
  },
  {
    icon: ShieldIcon,
    title: 'Seus dados separados dos outros',
    text: 'Cada doceria tem sua própria fatia no banco, isolada pelo próprio banco de dados, não por uma regra que algum programa precisa lembrar de aplicar. Nenhuma outra loja enxerga seu cardápio, seu custo ou sua lista de clientes.',
  },
];

export function IntegrationsSection() {
  return (
    <section className="bg-night py-16 text-sand-100 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="appear max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-clay-300">
            Conversa com o que você já usa
          </p>
          <h2 className="mt-4 font-display text-3xl leading-tight text-sand-50 sm:text-4xl">
            Você não vai trocar o WhatsApp por um sistema
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-sand-300">
            Vai parar de usar o WhatsApp como caderno, agenda e calculadora ao mesmo
            tempo. O papo continua lá; o resto vem para cá.
          </p>
        </div>

        <ul className="appear-group mt-12 grid gap-4 sm:grid-cols-2 lg:gap-5">
          {ITEMS.map((item) => (
            <li
              key={item.title}
              className="group rounded-panel border border-sand-700/60 bg-night-soft p-6 transition-colors duration-300 ease-out hover:border-sand-600"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-700/60 text-clay-200 transition-colors duration-300 ease-out group-hover:bg-clay-600 group-hover:text-sand-50">
                <item.icon size={20} />
              </span>
              <h3 className="mt-4 font-display text-xl text-sand-50">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sand-300">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
