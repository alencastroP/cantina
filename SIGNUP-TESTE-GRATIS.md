# Cadastro do teste grátis — contrato do backend

O frontend está pronto e não funciona ainda: `/teste-gratis` posta em
`POST /api/v1/signup/trial`, que não existe. Este documento é o que falta para
ligar os dois — o contrato, e as regras de segurança que a rota precisa
cumprir por ser a **única rota pública que cria conta e toca em CPF**.

Nada foi criado na API. Enquanto a rota não existir, o formulário mostra um
erro de rede e não deixa ninguém pela metade.

---

## 1. Por que esta rota é diferente de todas as outras

Hoje, empresa se cria pelo `/admin` — rota de plataforma, atrás de
autenticação, usada por quem já tem poder para isso. A rota nova inverte as
três coisas: é pública, anônima, e cria estado permanente (tenant, usuário,
cliente no gateway).

Isso muda a lista de coisas que podem dar errado:

| Risco | O que acontece sem tratamento |
| --- | --- |
| Criação em massa | Robô abre mil lojas, enche o banco e queima mil `slug` bons |
| Enumeração de CPF/e-mail | Mensagem de erro diferente revela quem já é cliente |
| Retentativa | Rede cai, a pessoa clica de novo e nascem duas lojas com o mesmo CPF |
| Dado sensível em log | CPF completo no log de requisição, que fica em disco por meses |
| Conta órfã | Pagamento nunca confirmado deixa tenant vazio ocupando `slug` |

---

## 2. Contrato

### Requisição

```
POST /api/v1/signup/trial
Content-Type: application/json
Idempotency-Key: signup-<uuid v4>     (obrigatório)
```

```jsonc
{
  "businessName": "Doces da Ana",
  "slug": "doces-da-ana",              // [a-z0-9-], 3–40
  "ownerName": "Ana Maria de Souza",   // nome completo, como no CPF
  "email": "ana@docesdaana.com.br",
  "phone": "11987654321",              // só dígitos, 10 ou 11
  "document": "12345678901",           // CPF, só dígitos
  "antiAbuse": {
    "website": "",                     // campo-isca: preenchido = robô
    "elapsedMs": 48213                 // tempo no formulário
  }
}
```

### Resposta — 201

```jsonc
{
  "checkoutUrl": "https://sandbox.asaas.com/..."
}
```

Só isso. **Nenhum dado da conta recém-criada volta na resposta** — nem id de
tenant, nem token, nem e-mail normalizado. Uma rota anônima não tem para quem
devolver esses dados com segurança, e tudo que ela devolve é lido por quem
chamou, seja quem for.

### Erros

Envelope padrão (`errorEnvelopeSchema`). Os códigos que a tela já trata:

| Status | `code` | Quando |
| --- | --- | --- |
| 400 | `validation_error` | Campo inválido — `details.fields` é exibido campo a campo |
| 409 | `slug_taken` | Endereço de vitrine já usado (é o único conflito que pode ser revelado) |
| 429 | `too_many_requests` | Limite por IP estourado |
| 502 | `billing_unavailable` | Gateway fora do ar |

O frontend mostra `message` quando não há `fields`. Então **`message` é texto
que o público lê** — nunca coloque ali o retorno cru do gateway, nome de
tabela, `requestId` ou qualquer trecho de payload.

---

## 3. Regras de segurança obrigatórias

### 3.1 Validação — repetir tudo, sem exceção

A validação da tela é conveniência. No servidor:

```ts
import { isValidCpf, onlyDigits } from '@cantina/domain';
```

É a **mesma função** que a tela usa, e por isso mora no pacote de domínio.
`startSubscriptionRequestSchema` hoje só confere o comprimento do documento
(11 ou 14 dígitos) — vale corrigir isso junto, porque `00000000000` passa.

### 3.2 Idempotência — obrigatória, não opcional

Já existe `http/middlewares/idempotency.ts`. Aplique. Sem ele, um duplo clique
ou uma retentativa de rede cria a segunda loja, e a primeira fica órfã com o
`slug` bom preso.

### 3.3 Limite por IP — mais apertado que o de login

`authLimiter` permite 10 por 15 min e conta só falhas. Aqui é o contrário: o
que interessa limitar é o **sucesso**, porque criar contas é o objetivo do
abuso. Sugestão de ponto de partida:

```ts
export const signupLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 3,              // três cadastros por IP por hora
});
```

Três é baixo de propósito: o caso legítimo de duas docerias no mesmo IP na
mesma hora praticamente não existe, e quem cair no limite fala com o suporte.

### 3.4 Não revelar quem já é cliente

Se o e-mail ou o CPF já existem, **não diga isso**. A resposta deve ser a
mesma de um cadastro novo, e quem já tem conta recebe um e-mail avisando que
alguém tentou cadastrar com os dados dela e oferecendo o link de recuperação.

Slug é a única exceção: ele é público por natureza (basta abrir
`doces-da-ana.cantina.app`), então recusá-lo não revela nada que já não seja
visível — e não recusar deixaria a pessoa travada sem entender.

### 3.5 CPF nunca em log

Nenhum: nem no log de requisição, nem em mensagem de erro, nem em evento de
auditoria. Onde precisar rastrear, use `maskedCpfTail()` (também em
`@cantina/domain`), que devolve `•••.•••.•••-42`.

Confira também o logger de requisição: se ele registra o corpo do POST, esta
rota precisa entrar na exclusão **antes** do primeiro deploy.

### 3.6 Origem, e o que não fazer com cookie

O frontend manda `credentials: 'omit'` — nenhum cookie viaja. Confirme no
servidor: valide o header `Origin` contra o domínio raiz e **não crie sessão
nem cookie nesta rota**. A pessoa ainda não provou que o e-mail é dela.

### 3.7 O cartão nunca chega aqui

A rota recebe identificação e devolve uma URL de checkout hospedado. Ela nunca
recebe, aceita ou encaminha número de cartão, CVV ou validade — nem num campo
opcional, nem "só para testar". No dia em que isso mudar, o sistema inteiro
entra em escopo de PCI-DSS.

O frontend ainda confere o host da URL devolvida contra
`NEXT_PUBLIC_CHECKOUT_HOSTS` antes de navegar (`safeCheckoutUrl`). Se o host
não bater, ele não redireciona e não mostra o link — então **devolva sempre a
URL do provedor configurado**, não um encurtador nem um redirecionador nosso.

### 3.8 Conta só nasce de verdade com pagamento confirmado

Sugestão de estado: o tenant nasce `trial` mas **sem senha definida e sem
poder receber pedido**, e só é liberado quando o webhook do gateway confirma
que a forma de pagamento foi aceita. Um job diário apaga o que ficou parado
por mais de 24 h sem confirmação — é o que impede que o abandono no checkout
vire lixo acumulado prendendo `slug`.

### 3.9 Senha por e-mail, nunca no mesmo passo

Sem campo de senha no cadastro. Depois do pagamento confirmado, mande o link
de definição de senha (o mesmo mecanismo de convite que já existe), com
validade curta e uso único. Isso verifica o e-mail de graça.

---

## 4. Ordem sugerida das operações

```
1. valida corpo ......................... falha → 400, nada criado
2. confere limite por IP ................ falha → 429
3. confere idempotência ................. repetida → devolve o mesmo checkoutUrl
4. reserva o slug (transação) ........... ocupado → 409 slug_taken
5. cria tenant + usuário owner .......... sem senha, status pendente
6. cria cliente no gateway .............. aqui o CPF sai do sistema, uma vez
7. cria a assinatura em trial ........... e obtém a URL do checkout
8. registra auditoria ................... sem CPF, sem telefone
9. devolve { checkoutUrl } .............. e mais nada
```

Passos 5 a 7 devem ser compensáveis: se o 6 ou o 7 falhar, o tenant do passo 5
não pode ficar de pé. Ou tudo, ou nada.

---

## 5. Checklist antes de ir ao ar

Da rota:

- [ ] `POST /api/v1/signup/trial` implementada com as regras da seção 3
- [ ] `signupLimiter` aplicado
- [ ] Idempotência ligada
- [ ] CPF fora de todos os logs (conferir o logger de requisição)
- [ ] Webhook confirma a forma de pagamento e libera a conta
- [ ] Job de limpeza de cadastro abandonado

Do frontend (já feito, mas depende de configuração):

- [ ] `NEXT_PUBLIC_CHECKOUT_HOSTS` preenchido no ambiente — **vazio bloqueia
      todo redirecionamento**, de propósito
- [ ] `TRIAL_DAYS` e `PLAN_PRICE` preenchidos em
      `apps/web/src/components/landing/config.ts`

Fora do código, e sem isto a landing não pode ir ao ar:

- [ ] `/privacidade` escrita (o formulário coleta CPF — LGPD)
- [ ] `/termos` escritos, com a regra do teste igual à anunciada na landing
- [ ] Razão social e CNPJ no rodapé
