# Front-end — plano de ação

Stack fixa: **React + Next.js (App Router) + Tailwind CSS v4**.

O backend está pronto até o módulo 6, então boa parte do painel já pode ser construída
contra API real — não contra mock. Este plano segue a ordem do que **já tem API**, não a
ordem do que é bonito de mostrar.

---

## Princípios

1. **Nenhuma regra de negócio no front.** Custo, margem, disponibilidade e transições de
   status vivem em `@cantina/domain`, do lado do servidor. O front formata e exibe.
2. **Tipos vêm de `@cantina/contracts`.** Nada de interface duplicada — se o contrato
   mudar, o `tsc` do web acusa.
3. **Celular primeiro.** O lojista opera o kanban no balcão, com uma mão. A vitrine é
   aberta no celular do cliente, quase sempre.
4. **Servidor onde couber.** Vitrine renderizada no servidor com cache por tag (D16); o
   painel é uma SPA autenticada, porque é interativo e privado.

---

## Fases

Cada fase é uma entrega pedível isoladamente. As três primeiras não dependem de nada que
ainda não exista.

| # | Fase | Depende de | Estado |
|---|---|---|---|
| **F0** | **Fundação visual**: paleta, tipografia, tokens, primitivos, `cn`, formatadores | — | ✅ |
| **F1** | **Autenticação**: login, sessão em memória + refresh, rotas protegidas, logout | API mód. 1 | ✅ |
| **F2** | **Casca do painel**: navegação lateral, cabeçalho, estados de carregamento e vazio | F1 | ✅ |
| **F3** | **Catálogo**: lista, cadastro, edição, variações, categorias, pausar na vitrine | API mód. 2 | ✅ |
| **F4** | **Estoque e insumos**: saldos, extrato, ajuste, perda, insumos, fornecedores, compras | API mód. 3 | ✅ |
| **F5** | **Fichas e precificação**: editor de receita, custo com quebra, simulador, produção, canais | API mód. 4 | ✅ |
| **F6** | **Clientes**: lista, busca, endereços, histórico unificado, anonimização | API mód. 5 | ✅ |
| **F7** | **Kanban de delivery**: board, cartão, transições, cancelamento, lançamento manual | API mód. 6 | ✅ |
| **F8** | **Vitrine**: cardápio, carrinho, checkout, WhatsApp, acompanhamento | API mód. 8 | ✅ |
| **F9** | **Encomendas**: kanban, calendário, agenda, encomenda na vitrine | API mód. 7 | ✅ |
| **F10** | **Financeiro e relatórios**: lançamentos, baixa, fluxo de caixa, contas, recorrências, resumo, vendas, ranking, custos | API mód. 9-10 | ✅ |
| **F11** | **Assinatura e `/admin`**: plano e faturas do lojista; visão geral, empresas, planos e assinaturas da plataforma | API mód. 11 | ✅ |

**Tudo que a API atual permite está entregue.** O painel cadastra produto, controla estoque
com custo real, monta ficha técnica, simula margem por canal, gerencia clientes e opera o
kanban de ponta a ponta.

**O ciclo completo está fechado**: o cliente abre a vitrine no celular, monta o pedido e
envia; ele cai no kanban do lojista, reserva estoque, e a confirmação dá baixa com o custo
congelado. Nada disso é mock.

**Os dois fluxos de venda estão fechados.** Delivery e encomenda funcionam de ponta a
ponta, cada um com seu kanban, e a vitrine oferece os dois ao cliente.

**O painel está completo para o que a API entrega.** Com F10, o ciclo fecha nos dois
sentidos: a venda entra pela vitrine, atravessa o kanban dando baixa no estoque com o custo
congelado, vira receita no financeiro e aparece na margem do relatório — sem ninguém
digitar nada duas vezes. F11 acrescentou a camada comercial: o lojista vê e contrata o
plano, e a plataforma tem sua própria área. O que falta na tela agora depende de API que
ainda não existe (notificações).

---

## A paleta

Aconchegante, base bege. A referência é padaria de bairro no fim da tarde — não app de
tecnologia.

| Papel | Cor | Onde aparece |
|---|---|---|
| **Sand** | bege quente, `#F7F1E8` na base | fundo da página, superfícies, bordas, texto |
| **Clay** | terracota, `#C75733` | ações primárias, foco, marca |
| **Olive** | verde-oliva, `#7A8B5A` | acento secundário, confirmações suaves |
| Semânticas | verde, âmbar, vermelho-tijolo, azul-petróleo | estados, sempre dessaturados para não brigar com o bege |

Três decisões que sustentam o resto:

- **Nada de preto puro.** O texto mais escuro é `#2E261D`, um marrom. Preto sobre bege
  vibra e cansa; o marrom assenta.
- **Nada de cinza frio.** Todo neutro tem amarelo na composição, senão o bege parece
  sujo ao lado dele.
- **Terracota é escassa.** Se tudo é primário, nada é. Ela marca a ação principal da tela
  e o foco de teclado — o resto é neutro.

Os tokens vivem em [`globals.css`](apps/web/src/app/globals.css), em duas camadas: a escala
crua (`--color-sand-100`) e os papéis semânticos (`--color-canvas`, `--color-surface`,
`--color-border`). **Componente nunca usa a escala crua** — usa o papel. É o que permite
trocar a paleta inteira num lugar só, e é o que vai permitir um tema escuro depois sem
reescrever componente nenhum.

### Tipografia

- **Fraunces** para títulos: serifada, com um leve exagero ótico que dá calor sem virar
  decoração.
- **Inter** para interface: números tabulares importam mais que personalidade quando a
  tela é uma tabela de preços.

---

## Estrutura

```
apps/web/src/
├─ app/
│  ├─ page.tsx             landing do domínio raiz
│  ├─ (app)/               grupo com o provedor de sessão
│  │  ├─ entrar/           login
│  │  ├─ recuperar/        recuperação de senha
│  │  └─ painel/           área autenticada — layout com navegação e guarda
│  ├─ loja/[host]/         vitrine, resolvida pelo middleware (F8)
│  └─ admin/               plataforma (depois do módulo 11)
├─ components/
│  ├─ ui/                  primitivos sem regra: Button, Input, Card, Badge…
│  └─ layout/              casca do painel: navegação, cabeçalho, ícones
├─ features/               espelha os módulos da API: catalog/, stock/, orders/…
└─ lib/                    api, formatadores, hooks de dados, cn
```

O provedor de sessão fica no grupo `(app)`, e não no layout raiz, porque a vitrine é
pública: envolvê-la faria toda visita de cliente disparar um `/auth/refresh` antes de
mostrar o cardápio.

`features/` é onde mora o que é específico de um domínio (o editor de variações, o cartão
do pedido). `components/ui/` não conhece domínio nenhum — se um primitivo precisar saber o
que é um pedido, ele está no lugar errado.

---

## Decisões de implementação

**Sessão.** O access token vive **em memória**, nunca em `localStorage`: qualquer script na
página leria de lá. O refresh vai num cookie `httpOnly`, e no primeiro carregamento o app
troca esse cookie por um access token novo. O custo é um flash de "carregando" no boot; a
alternativa é deixar um token de longa duração ao alcance de qualquer XSS.

**Sem biblioteca de componentes.** Radix ou shadcn entrariam com peso e opinião visual que
teríamos de desfazer. Os primitivos aqui são poucos e diretos. A primeira necessidade de foco
preso (o lembrete do calendário, a cópia de ficha) foi resolvida com `<dialog>` nativo e
`showModal()`: o navegador prende o foco, fecha no Esc e devolve o foco a quem abriu. Radix
continua reservado para o que o navegador não entrega — um combobox, por exemplo.

**Todo formulário passa por `Form`.** Ele faz o `preventDefault`, desliga a validação do
navegador (a que vale é a da API, em português) e, depois de enviar, põe o foco no primeiro
campo inválido — ou no resumo de erros, quando o erro não tem campo. É o padrão do GOV.UK: sem
ele, num formulário longo o erro aparece fora da tela e o leitor de tela nem fica sabendo.
`FormErrors` lista as mensagens com o nome do campo; um erro em `variants.0.priceCents` antes
sumia em silêncio, porque nenhum campo tinha esse nome.

**Campo com 16px no celular.** O iOS dá zoom na página inteira ao focar um campo com fonte
menor, e o lojista perde o formulário de vista. Do tablet para cima volta a 14px.

**O estado inválido vem do `Field`.** `Input`, `Select`, `CurrencyInput` e `QuantityInput`
leem o `aria-invalid` que o `Field` injeta — quem espalha `{...props}` não precisa lembrar de
repetir `invalid`, e metade das telas esquecia.

**Senha tem "Mostrar" e aviso de Caps Lock; colar é permitido.** São os dois erros mais comuns
num teclado de celular, e bloquear colar só empurra as pessoas para senhas mais fracas. O login
usa `autocomplete="username"` e `current-password` para o gerenciador de senhas preencher os
dois, e nunca apaga o e-mail depois de um erro.

**`autocomplete` diz de quem é o dado.** Na vitrine, nome, telefone e endereço usam os tokens
padrão, porque o dado é de quem está digitando. No painel, cadastro de cliente e pedido manual
usam `off`: o dado é do cliente, e o navegador sugeriria o nome e o telefone do atendente.

**Botão desabilitado diz o que falta.** Um botão cinza no fim de um checkout não diz se o
problema é o telefone ou o bairro. `FormActions` aceita uma dica, e as telas mais longas a usam.

**Sem `tailwind-merge`.** As variantes são mapas explícitos de classes, então não há
conflito para resolver em tempo de execução. Uma dependência a menos.

**`LinkButton` em vez de um botão polimórfico.** A tipagem de um componente que aceita
tanto `href` quanto `onClick` fica pior de ler do que dois componentes que compartilham as
mesmas classes — e a distinção importa: navegação é link, ação é botão, e o leitor de tela
anuncia os dois de formas diferentes.

**Valor em dinheiro tem entrada própria.** `CurrencyInput` digita da direita para a
esquerda, como maquininha, e emite CENTAVOS. Sem ele, cada formulário faria sua própria
conversão de "7,50" — e é assim que um `parseFloat` escondido arredonda um preço para menos
em alguma tela.

**Nenhum gráfico vem de biblioteca.** `StatCard` é texto, `BarList` é uma `div` com largura
percentual e `Sparkline` é um `<path>` de dez linhas. Recharts custaria mais de 400 kB para
desenhar barras horizontais, num painel que o lojista abre no celular do balcão. Duas
escolhas dentro deles são deliberadas: a barra é proporcional ao MAIOR valor (proporcional
ao total, vinte produtos viram vinte tracinhos iguais) e a escala da linha inclui o zero
(começar no menor valor transforma 2% de variação num despenhadeiro).

**Nenhuma conta de negócio acontece na tela.** Margem, ticket, participação e saldo vêm
calculados do servidor. Recalcular no cliente "porque é fácil" é exatamente como um sistema
passa a mostrar duas margens diferentes na mesma página.

**O seletor de período distingue olhar para trás de olhar para frente.** Em relatório, o
período termina hoje: incluir dias que ainda não aconteceram dilui a média e faz o
faturamento parecer em queda todo dia 1º. No financeiro, "este mês" é o mês INTEIRO,
porque a pergunta ali é "dá para pagar o que vence sexta?". É o mesmo componente com um
`direction`, não dois componentes parecidos.

**A data de hoje é a da LOJA, não a do navegador.** O relógio do cliente é do cliente: um
celular com fuso errado pediria o relatório de outro dia, e o servidor corta o período pelo
fuso da empresa. Enquanto o fuso não vem no `/auth/me`, `America/Sao_Paulo` é o padrão do
cadastro e vale para todo assinante atual.

**A navegação esconde o que o papel não pode abrir.** `visibleSections` espelha o
`requireRole` da API: financeiro e relatórios só aparecem para `owner`, `manager` e
`finance`. Um link que sempre devolve 403 é pior que link nenhum — ele ensina o atendente a
ignorar mensagem de erro.

**A baixa de pagamento acontece na própria lista.** Pagar uma conta é a ação mais repetida
da tela; mandá-la para uma página de detalhe custaria dois cliques e um carregamento por
boleto quitado.

**`/admin` tem cliente, sessão e hook próprios — não uma opção do painel.** Os dois guardam
token em lugares diferentes, e unificá-los abriria a possibilidade de uma tela do lojista
mandar, por engano, o token de plataforma, que enxerga todos os assinantes. A duplicação de
umas cinquenta linhas é barata perto disso. Pelo mesmo motivo `/admin` fica fora do grupo
de rotas `(app)`: o provedor de sessão do lojista não o envolve.

**A sessão do admin vive em `sessionStorage` e não é renovada.** Morre ao fechar a aba, não
acompanha outras abas e não sobrevive ao fim do expediente; token vencido devolve 401 e a
tela pede a senha de novo. Para uma ferramenta interna usada algumas vezes por semana, a
fricção é pequena e a janela de exposição de um token com esse poder fica curta.

**A ação destrutiva parece destrutiva.** Suspender uma loja tira a vitrine do ar: o motivo
é obrigatório, o botão fica vermelho, um alerta diz o que vai acontecer, e `support` não
enxerga o cartão. Nenhuma dessas quatro coisas sozinha bastaria.

**Limite em branco é "sem limite", e a tela diz isso por extenso.** É a distinção mais fácil
de errar do cadastro de planos, e errá-la trancaria o cliente para fora da própria conta.

**Permissão é diferente de regra.** A anonimização só aparece para o dono, porque a API
recusa para os demais papéis e mostrar um botão que sempre falha é pior que não mostrar. Já
uma regra de negócio (remover a última variação, produzir produto sob demanda) fica visível
e deixa a API explicar o porquê.

**A regra fica no servidor, mesmo quando a tela poderia adivinhar.** O editor de variações
não esconde o botão de remover a última: ele deixa a API recusar e mostra a mensagem dela,
que explica o porquê. Duplicar a regra aqui seria a segunda cópia de uma verdade que só o
servidor pode garantir.

**Importar `@cantina/domain` no cliente não é duplicar.** O board precisa saber para onde
cada pedido pode avançar, e a listagem não traz isso por pedido. Ele chama
`allowedDeliveryTransitions` — a MESMA função que o servidor usa para validar. Reescrever o
`switch` aqui é que seria duplicação; usar o pacote compartilhado é o motivo de ele existir.

**O total do lançamento manual é prévia, e a tela diz isso.** O servidor recalcula com o
preço vigente no instante da criação. Uma tela que apresenta seu próprio cálculo como
definitivo é uma tela que vai discordar do recibo em algum dia de troca de preço.

**Ajuste pede o saldo CONTADO, não a diferença.** Quem está com a mão na farinha sabe
quanto tem, não quanto sobrou em relação ao sistema. Pedir a diferença seria pedir uma conta
de cabeça no meio da contagem — a tela faz a subtração e mostra o resultado antes de gravar.

**Ajuste e perda são ações separadas na interface**, porque são causas diferentes no
relatório de custos: "recontei e tinha menos" e "quebrei três ovos" não podem cair no mesmo
campo.

**A compra mostra o custo por unidade enquanto se digita.** É o momento em que o lojista
descobre quanto custa de verdade um grama de farinha — e é a razão de o produto existir.

**A quebra do custo é uma barra por insumo, não uma tabela.** Saber que a farinha é 60% do
custo é o que faz o lojista saber qual fornecedor negociar; uma coluna de percentuais não
comunica isso na mesma olhada.

**404 na ficha técnica é estado normal, não erro.** Produto sem receita é a maioria no
começo, e a tela abre o editor vazio em vez de mostrar uma falha.

**O carrinho vive no `localStorage`, por loja.** O cliente não tem conta (D4), então não há
onde guardar isso no servidor — e ele precisa sobreviver a um reload: quem monta um pedido
no celular troca de app, recebe uma ligação, volta. Perder o carrinho aí é perder a venda.
Storage bloqueado (aba anônima) não impede a compra; o carrinho só não sobrevive ao reload.

**A chave de idempotência é gerada uma vez por tentativa de envio, não por clique.**
Reenviar depois de um erro de rede reaproveita a mesma chave, e a API devolve o pedido que
já existia em vez de criar um segundo.

**Sacola e checkout na mesma página.** No celular, cada tela nova é uma chance de desistir.

**A encomenda tem carrinho próprio, e ele não é persistido.** Misturar "quero agora" com
"quero para sábado" num mesmo carrinho produziria um pedido que a cozinha não sabe quando
fazer. E encomenda é decisão tomada de uma vez, não montada ao longo do dia.

**A data vem antes dos itens.** É ela que pode não estar disponível — descobrir isso depois
de montar o pedido inteiro seria trabalho jogado fora.

**Chips de dias, não `<input type="date">`.** O calendário do sistema não sabe quais dias a
loja aceita, e deixar a pessoa escolher para ser recusada depois é o pior dos dois mundos.
Na vitrine só o disponível aparece; no painel o indisponível aparece esmaecido, dizendo por
quê — o lojista precisa saber que sábado lotou.

**A vitrine pergunta primeiro: agora ou outro dia?** Delivery e encomenda são dois fluxos
com carrinho, cozinha e kanban próprios (D6), e o cliente precisa saber em qual está antes
de escolher qualquer produto. A tela diz isso em três camadas ao mesmo tempo: cor
(terracota = pedir agora, oliva = encomendar), palavra ("Pedir agora" × "Encomendar") e
roteiro (três passos de cada um, na mesma estrutura, para a comparação ensinar a
diferença). A cor não é escolhida componente a componente: `[data-mode="now|later"]` troca
`--color-mode-*` no subtree, e o mesmo item de cardápio, contador e botão fica terracota ou
oliva sem saber de nenhum dos dois. A sacola flutuante só aparece no cardápio de hoje — na
encomenda ela seria um segundo carrinho na mesma tela.

**Link da vitrine é o endereço do navegador, não a rota interna.** O middleware reescreve
`padaria.cantina.app/sacola` para `/loja/<host>/sacola`, mas o navegador continua em
`/sacola`. Um link para `/loja/<host>/…` passa de novo pelo middleware e vira 404 — era o
que acontecia com "Encomendar", "Ver sacola", o histórico e o redirecionamento do
checkout. Todo endereço sai de `useStorePaths` (`features/storefront/store-paths.ts`).

**Movimento só em CSS.** Folhas que sobem (`<dialog>` com `@starting-style` e
`allow-discrete` para a saída), blocos que abrem animando `grid-template-rows`, entradas
escalonadas e o polegar dos modos que desliza com mola. Nenhuma biblioteca: a vitrine abre
no 4G do cliente. Navegador antigo perde a transição, não a função, e
`prefers-reduced-motion` desliga tudo. Entrada usa `animation-fill-mode: backwards` —
com `both`, o `transform` final ficaria no elemento e quebraria o `sticky` dos filhos.

**Escolha em ficha, não em `<select>`.** Forma de pagamento, entrega × retirada e o dia da
encomenda são rádios nativos vestidos de ficha ou cartão: no celular o select abre a
roleta do sistema para quatro opções que cabem numa linha, e o rádio nativo dá setas do
teclado e leitor de tela de graça. Bairro atendido vira atalho de um toque — digitar
"Jardins" no celular é o erro mais comum do checkout.

**Produto sem foto mostra a inicial.** Loja pequena quase nunca tem foto de tudo, e um
ícone genérico de prato repetido vinte vezes parece cardápio abandonado. A letra é grande,
cortada e de cor derivada do nome — estável entre visitas, variada entre produtos.

**O calendário é um só por empresa.** Encomendas, lembretes e vencimentos na mesma grade, e
toda a equipe vê a mesma coisa — o isolamento entre lojas é o RLS, como em qualquer tabela. O
que muda por pessoa é o filtro (tipos, "meus lembretes", mês ou lista), guardado no
`localStorage` com o id da empresa na chave. A navegação do mês fica numa barra própria, fora
do cabeçalho: mês e filtros são a ferramenta da tela, não o título dela. A ocupação da agenda
é uma barra fina em cada dia, porque a pergunta é "ainda cabe?", não "quantos são?".

**Contas no calendário seguem o recorte do financeiro.** Quem não enxerga o financeiro não
recebe os vencimentos — o servidor corta, e a tela só oferece os filtros que o `kinds` da
resposta permite.

**Custo mora na tela do produto, para quem gerencia.** O bloco "Ficha técnica e custo" puxa a
receita de todas as variações com o custo e a margem calculados no servidor (`/products/:id/costing`),
e oferece copiar a ficha de um produto parecido. Na lista de produtos e na de fichas, o resumo
vem de `/pricing/summary`, uma requisição para a lista inteira.

**Estados de carregamento são estruturais.** Toda lista tem *skeleton*, vazio e erro
desenhados desde o começo — não como remendo depois. Tela que só existe no caminho feliz é
tela que ninguém consegue usar num dia ruim.

---

## Lacunas conhecidas

- **Lembrete não avisa ninguém.** Ele aparece no calendário e no filtro de quem cuida, mas
  não gera notificação — isso depende do módulo 14.
- **Upload de imagem de produto** não tem interface: a API existe, mas depende de storage
  S3 configurado. Sem credenciais, ela responde 503 com a causa.
- **Lançamento não pode ser editado nem cancelado pela tela.** A API tem `PATCH` e
  `DELETE`, e a lista só oferece a baixa. Editar valor e vencimento é o próximo passo
  natural; até lá, corrige-se removendo e relançando.
- **O ranking de produtos não leva ao produto.** Cada linha tem o `productVariantId`, mas
  a rota do painel é por produto, não por variação — o link exigiria uma consulta a mais
  para descobrir o pai.
- **Sem exportação.** Nenhum relatório sai em CSV ou PDF. É o pedido mais provável de um
  contador, e depende de decidir onde o arquivo é gerado (servidor, com o mesmo recorte de
  papel, é o lugar certo).
- **A perda em dinheiro é estimada pelo custo médio ATUAL**, não pelo custo do dia em que
  ela aconteceu — o movimento de perda não guarda custo. Num período de inflação de insumo,
  o número fica otimista.
- **O `/admin` não lista as faturas de uma empresa.** A API já as devolve na tela do
  lojista; falta a rota equivalente do lado da plataforma, que é o que o suporte precisa
  para responder "essa cobrança foi paga?".
- **Nem o `/admin` nem o painel mostram os webhooks que falharam** além do contador na
  visão geral. Reprocessá-los ainda é trabalho de SQL.
- **Não há troca de plano com proporcional.** Trocar cancela e recontrata pelo valor cheio
  do novo plano; o crédito do período já pago não é calculado.

---

## O que falta decidir

- **Tema escuro**: os tokens já estão preparados, mas nenhuma cor escura foi escolhida.
  Vale a pena quando alguém pedir — cozinha à noite é o caso de uso plausível.
- **Biblioteca de dados**: hoje é `fetch` direto com estado local, e o `useApi` já faz
  *polling* com pausa em aba oculta (P10). TanStack Query passa a valer o peso quando
  surgir invalidação cruzada entre telas — mudar um pedido e ver o estoque reagir.
- **Arrastar e soltar no kanban**: `@dnd-kit` é a escolha natural, mas o board funciona
  primeiro com botões de transição — que é o que o balcão usa com uma mão só.
