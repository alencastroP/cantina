# Cantina

Plataforma para pequenos negócios de comida: uma **vitrine pública** por empresa e um
**painel interno** de gestão, vendido como assinatura.

O desenho completo — modelo de dados, contratos de API e ordem de implementação — está em
[PLAN.md](PLAN.md). Este README é só como rodar.

**Estado:** módulos 0 a 13 concluídos — API, painel, vitrine e assinatura. Falta o módulo
14 (notificações e os jobs restantes).

No front-end, **os dois fluxos de venda funcionam de ponta a ponta**: delivery e encomenda,
cada um com seu kanban, e a vitrine oferece os dois ao cliente
([FRONTEND.md](FRONTEND.md) tem o plano por fases). O painel fechou com financeiro,
relatórios e assinatura; e a administração da plataforma vive em `/admin`, com sessão
própria.

Para subir uma versão de testes na web, siga [DEPLOY-TESTES.md](DEPLOY-TESTES.md).

---

## Requisitos

- Node.js **22+** (testado no 24)
- Postgres **16+**
- Docker (opcional — veja a alternativa abaixo)

## Subindo em 5 passos

```bash
# 1. dependências
npm install

# 2. ambiente
cp .env.example .env

# 3. banco (Docker)
docker compose up -d postgres

# 4. papéis + migrations + políticas de RLS
npm run db:setup

# 5. dados de exemplo
npm run db:seed
```

Depois:

```bash
cp apps/web/.env.example apps/web/.env.local   # config do front

npm run dev          # API (3333) + web (3000)
npm run dev:api      # só a API
```

Com o seed aplicado, `http://localhost:3000/entrar` já loga de verdade
(`ze@padaria.test` / `cantina123`) e leva ao painel.

### Sem Docker

Aponte `DATABASE_URL` e `DATABASE_ADMIN_URL` para qualquer Postgres — local ou gerenciado
(Neon, Supabase). O `db:setup` cria os papéis, aplica as migrations e as políticas de RLS
em qualquer um deles. É a mesma sequência.

### O que o seed cria

Uma empresa completa e coerente, para conferir custo, estoque e agenda antes de existir
qualquer tela:

| | |
|---|---|
| Vitrine | `http://padaria-do-ze.cantina.localhost:3000` |
| Painel | `http://localhost:3000/entrar` |
| Login | `ze@padaria.test` / `cantina123` |
| Admin da plataforma | `http://localhost:3000/admin` |
| Login | `admin@cantina.test` / `cantina123` |

`*.localhost` resolve sozinho na maioria dos navegadores — não precisa mexer no arquivo
`hosts`.

---

## Verificando o isolamento entre empresas

A decisão mais consequente do projeto é o isolamento multi-tenant por RLS (D1). Ela tem
uma prova executável:

```bash
npm run verify:rls
```

Cria dois tenants descartáveis e verifica quatro propriedades:

1. leitura no contexto de A não devolve dados de B;
2. `select` **sem `where`** continua isolado — é o ponto do RLS;
3. `insert` com `tenant_id` de outra empresa é recusado pelo `WITH CHECK`;
4. consulta **fora** de `withTenant` não devolve linha alguma.

Rode depois de qualquer mudança em `packages/db/src/schema`. A lista de tabelas
protegidas é derivada do schema, não escrita à mão — tabela nova com `tenant_id` entra
sozinha, e tabela sem `tenant_id` fora da lista de plataforma gera aviso no `db:rls`.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API e web em watch |
| `npm run build` | Build de tudo |
| `npm run typecheck` | `tsc --noEmit` em todos os workspaces |
| `npm run test` | Testes de domínio e smoke da API |
| `npm run db:generate` | Gera migration a partir do schema Drizzle |
| `npm run db:migrate` | Aplica migrations |
| `npm run db:rls` | Reaplica políticas de RLS e views (idempotente) |
| `npm run db:setup` | Papéis + migrations + RLS, do zero |
| `npm run db:seed` | Dados de exemplo |
| `npm run db:studio` | Drizzle Studio |
| `npm run verify:rls` | Prova de isolamento entre tenants |
| `npm run smoke` | Caminho completo contra uma API de verdade (precisa de banco) |

---

## Estrutura

```
apps/
  api/          Express + Drizzle. A prioridade desta fase.
  web/          Next.js + Tailwind. Painel completo + vitrine pública.
packages/
  contracts/    Schemas Zod e tipos — a fonte da verdade da API.
  domain/       Regra pura, sem I/O: custo, margem, estoque, agenda, status.
  db/           Schema Drizzle, migrations, políticas de RLS, views.
  config/       tsconfig base.
```

### Por que `domain` e `contracts` são pacotes

`domain` guarda o que **não pode** ser reimplementado no front: cálculo de custo médio,
margem por canal, disponibilidade derivada da receita e as máquinas de estado dos pedidos.
Fora da API, essas regras são testáveis sem banco e impossíveis de duplicar por descuido
dentro de um componente React.

`contracts` é o que o app mobile futuro vai consumir para ter a API tipada sem copiar nada.

---

## Convenções que valem em todo módulo

As dez invariantes estão na §7 do [PLAN.md](PLAN.md). As três que mais aparecem no dia a dia:

- **Nada toca o banco fora de `tenantRoute`.** O wrapper abre a transação com
  `SET LOCAL app.tenant_id` e passa a `tx` ao handler. Não existe caminho alternativo.
- **`tenant_id` vem do token ou do host resolvido** — nunca do corpo, da URL ou de query.
- **Estoque só muda por `stock_movements`.** Ninguém escreve `qty_on_hand` direto.

Dentro de `src/modules/`, um módulo nunca importa o repositório de outro — só o service.

---

## Rotas disponíveis

Base `/api/v1`. Erros sempre no envelope `{ error: { code, message, details?, requestId } }`.

**Públicas**

| | |
|---|---|
| `GET /health` · `GET /health/ready` | vivo / pronto |
| `POST /auth/login` | `{ email, password, tenantSlug? }` → access token + cookie de refresh |
| `POST /auth/refresh` | rotaciona o refresh do cookie |
| `POST /auth/logout` | revoga a sessão |
| `POST /auth/forgot-password` · `POST /auth/reset-password` | recuperação por e-mail |
| `GET /invites?tenant=&token=` · `POST /invites/accept` | aceite de convite (entra já logado) |
| `GET /storefront/config` · `GET /storefront/menu` | cardápio da loja (tenant vem do host) |
| `GET /storefront/products/:slug` · `GET /storefront/delivery-zones` | |
| `POST /storefront/delivery-quote` | taxa e prazo por bairro |
| `POST /storefront/orders` | checkout — exige `Idempotency-Key` |
| `POST /storefront/whatsapp-draft` | monta a mensagem (grava ou não, conforme D7) |
| `GET /storefront/availability?from=&to=` | agenda de encomendas |
| `POST /storefront/preorders` | encomenda pelo cliente |
| `GET /storefront/orders/:code?phone=` | acompanhamento |

**Autenticadas**

| | Papel |
|---|---|
| `GET /auth/me` | qualquer |
| `GET /users` | qualquer |
| `GET\|POST /users/invites` · `DELETE /users/invites/:id` | owner |
| `PATCH\|DELETE /users/:id` | owner |
| `GET /settings` · `GET /settings/business-hours` · `GET /settings/status-labels` | qualquer |
| `PUT /settings` · `PUT /settings/business-hours` · `PUT /settings/status-labels` | owner, manager |
| `GET /categories` · `GET /products` · `GET /products/:id` | qualquer |
| `POST\|PATCH\|DELETE /categories` · `PATCH /categories/reorder` | owner, manager |
| `POST\|PATCH\|DELETE /products` · `PATCH /products/reorder` | owner, manager |
| `PATCH /products/:id/availability` (pausar na vitrine) | qualquer |
| `POST /products/:id/variants` · `PATCH\|DELETE /variants/:id` | owner, manager |
| `POST /products/:id/images/upload-url` · `POST /products/:id/images` | owner, manager |
| `PATCH /products/:id/images/reorder` · `DELETE /product-images/:id` | owner, manager |
| `GET /stock?kind=` · `GET /stock/movements` | qualquer |
| `POST /stock/adjustments` · `POST /stock/losses` | qualquer |
| `GET /supplies` · `GET /supplies/low-stock` · `GET /supplies/:id` | qualquer |
| `POST\|PATCH\|DELETE /supplies` | owner, manager |
| `GET\|POST\|PATCH\|DELETE /suppliers` | leitura qualquer, escrita owner/manager |
| `GET /supply-purchases` · `POST /supply-purchases` | leitura qualquer, escrita owner/manager |
| `GET\|PUT\|DELETE /variants/:id/recipe` · `GET /variants/:id/cost` | owner, manager |
| `GET /variants/:id/availability` | qualquer |
| `GET /sales-channels` · `POST\|PATCH\|DELETE /sales-channels` | leitura qualquer, escrita owner/manager |
| `POST /pricing/simulate` | owner, manager |
| `GET /preorders` · `/board` · `/calendar` · `/:id` | qualquer |
| `POST /preorders` · `PATCH /:id/status` · `POST /:id/cancel` · `/:id/deposit` | qualquer |
| `GET /availability/rules` · `/exceptions` · `/days` | qualquer |
| `PUT /availability/rules` · `POST\|DELETE /availability/exceptions` | owner, manager |
| `GET\|POST /finance/entries` · `PATCH\|DELETE /finance/entries/:id` | owner, manager, finance |
| `POST /finance/entries/:id/settle` (baixa) | owner, manager, finance |
| `GET\|POST /finance/accounts` · `/finance/categories` · `/finance/recurrences` | owner, manager, finance |
| `GET /finance/cashflow?from=&to=` | owner, manager, finance |
| `GET /reports/summary?from=&to=` | owner, manager, finance |
| `GET /reports/sales?from=&to=&groupBy=` (day, channel, payment_method, origin, kind) | owner, manager, finance |
| `GET /reports/products?from=&to=&orderBy=` (revenue, qty, margin) | owner, manager, finance |
| `GET /reports/costs?from=&to=` (consumo, perda e compras por insumo) | owner, manager, finance |
| `POST /stock/production` | qualquer |
| `GET\|POST /customers` · `GET\|PATCH\|DELETE /customers/:id` | qualquer |
| `GET /customers/:id/orders` (histórico unificado) | qualquer |
| `GET\|POST /customers/:id/addresses` · `PATCH\|DELETE .../:addressId` | qualquer |
| `POST /customers/:id/anonymize` (LGPD) | owner |
| `GET /delivery-orders` · `GET /delivery-orders/board` · `GET /delivery-orders/:id` | qualquer |
| `POST /delivery-orders` · `PATCH /:id/status` · `POST /:id/cancel` · `POST /:id/payment` | qualquer |
| `PATCH /delivery-orders/:id` (desconto e taxa) | owner, manager |
| `GET\|POST\|DELETE /subscription` (plano, faturas, uso) | owner |

Papéis: `owner` (tudo), `manager` (operação e cadastro), `staff` (kanbans e estoque),
`finance` (financeiro e relatórios). Escrita exige assinatura em dia — `past_due` deixa o
painel em somente-leitura. `/subscription` é a exceção: é justamente a tela que uma empresa
em atraso precisa abrir para voltar a pagar.

### Plataforma (`/api/v1/platform`)

Sessão **separada** da do lojista, em `platform_users`. O token do painel não abre nenhuma
destas rotas, e vice-versa — as claims dos dois são incompatíveis por construção.

| Rota | Papel |
|---|---|
| `POST /platform/auth/login` | público |
| `GET /platform/me` · `/metrics` · `/plans` · `/tenants` · `/tenants/:id` · `/subscriptions` | owner, support |
| `POST /platform/plans` · `PATCH /platform/plans/:id` | owner |
| `POST /platform/tenants` · `PATCH /platform/tenants/:id` | owner |
| `POST /platform/tenants/:id/status` (motivo obrigatório) | owner |
| `POST /webhooks/asaas` | segredo no header |

Teste rápido depois do seed:

```bash
curl -s localhost:3333/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ze@padaria.test","password":"cantina123"}'
```

### Imagens de produto

Upload em duas chamadas — o arquivo não passa pela API:

1. `POST /products/:id/images/upload-url` → `{ uploadUrl, publicUrl, expiresInSeconds }`
2. `PUT` do arquivo direto no `uploadUrl` (o browser faz)
3. `POST /products/:id/images` com o `publicUrl` para registrar

Sem `STORAGE_ACCESS_KEY_ID` e `STORAGE_SECRET_ACCESS_KEY` configurados, o passo 1 responde
503 com a causa — o resto do catálogo funciona normalmente. Com Docker,
`docker compose up -d minio` e crie o bucket `cantina` em http://localhost:9001.

### Como o estoque funciona

Duas tabelas, e a distinção entre elas é o que torna a reserva correta:

- `stock_items` — saldo materializado (`qty_on_hand`, `qty_reserved`)
- `stock_movements` — livro append-only, nunca editado nem apagado

`qty_available = qty_on_hand − qty_reserved` é o número que a vitrine mostra. Divergência se
corrige com um `adjustment` novo, nunca alterando o histórico.

**Toda** mudança de saldo passa por `applyMovements` em
[stock.service.ts](apps/api/src/modules/inventory/stock.service.ts) — inclusive as que os
kanbans vão fazer. Ninguém escreve `qty_on_hand` diretamente.

Registrar uma compra faz duas coisas na mesma transação: dá entrada no estoque e recalcula o
custo médio ponderado do insumo. Comprar 5 kg de farinha por R$ 50, usada em gramas, produz
custo de 1 centavo por grama.

### Custo, margem e disponibilidade

`GET /variants/:id/cost` devolve o custo unitário com a quebra por insumo — quanto cada um
pesa no total. Se algum insumo nunca foi comprado, `hasUnknownCost: true` avisa que o custo
está **subestimado** e a margem exibida é melhor que a real.

`POST /pricing/simulate` compara a mesma variação em todos os canais cadastrados. Com
`targetMarginPercent`, cada canal volta também com o preço que atinge aquela margem —
responde a "por quanto preciso vender no iFood para ganhar o mesmo que no balcão?".

`GET /variants/:id/availability` diz quantas unidades dá para vender agora: saldo próprio se
o produto conta unidades, ou o insumo que acaba primeiro se ele é feito sob demanda — e
qual insumo é esse.

`POST /stock/production` registra "produzi 20 coxinhas": consome os insumos da receita e dá
entrada no estoque do produto, na mesma transação.

### Clientes e LGPD

Sem login (D4): o telefone é a chave natural, único por empresa. A normalização para E.164
vive no contrato (`phoneSchema`) e tem teste próprio — se ela divergir entre dois pontos de
entrada, o mesmo cliente vira dois cadastros e o histórico se parte ao meio.

`GET /customers/:id/orders` lê de `v_orders_unified`: delivery e encomendas na mesma lista.

`POST /customers/:id/anonymize` apaga os dados pessoais e preserva os pedidos — eles já
guardam o nome do momento da venda, então o histórico financeiro continua fechando.

### Verificando o sistema inteiro

```bash
npm run smoke
```

Percorre o caminho completo contra uma API rodando: login → insumo → compra com custo
médio → produto → ficha técnica → custo e margem → disponibilidade derivada → cliente →
pedido → reserva → confirmação → conclusão → cancelamento com devolução de estoque →
relatórios do dia. Confere os números, não só os status HTTP: os 63 g de farinha que
saíram, os 64 centavos de custo congelado, e o resultado do dia que **não** desconta a
compra de insumo.

É a verificação que vale rodar depois de qualquer deploy — diferente dos testes unitários,
ela exercita banco, RLS, transações e o livro de estoque juntos.

## Próximo passo

Módulo 14: notificações e os jobs que faltam — varredura de estoque baixo, lembrete das
encomendas do dia seguinte e aviso de cobrança. Ver a tabela da §8 do [PLAN.md](PLAN.md)
para a ordem completa.
