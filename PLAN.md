# Cantina — Plano de Arquitetura

> Plano validado e em execução. As §§1-7 descrevem o desenho; a §8 marca o que já está de pé
> e a §11 registra o que a implementação de cada módulo acrescentou ao plano.
>
> **Concluídos:** módulos 0 a 13 (fases F0-F11 do [FRONTEND.md](FRONTEND.md)).
> **Próximo:** módulo 14 (notificações e jobs restantes).

---

## 1. Decisões travadas

Decididas na fase de exploração. Alterar qualquer uma destas depois do scaffold custa retrabalho de schema.

| # | Decisão | Escolha |
|---|---|---|
| D1 | Isolamento multi-tenant | Banco único, schema único, `tenant_id` em toda tabela + **RLS do Postgres** |
| D2 | Endereço da vitrine | **Subdomínio** (`padaria.cantina.app`), com domínio próprio previsto no modelo |
| D3 | Usuários do painel | Usuário pertence a **uma** empresa, com papéis (`owner`/`manager`/`staff`/`finance`) |
| D4 | Clientes finais | Registro **por tenant**, sem login, chave natural = telefone |
| D5 | Admin da plataforma | Área `/admin` protegida **dentro do mesmo app**, com papel de plataforma |
| D6 | Delivery vs. encomenda | **Dois agregados separados** + view de leitura unificada para relatórios |
| D7 | Fluxo WhatsApp | **Configurável por empresa**: grava o pedido, ou só monta o link |
| D8 | Pagamento na vitrine | **Sem gateway**: registra forma e status de pagamento; lojista confirma |
| D9 | Disponibilidade do produto | Por produto: **`tracked`** (conta unidades) ou **`on_demand`** (deriva da receita) |
| D10 | Agenda de encomendas | Regra semanal + exceções + antecedência mínima + **capacidade por dia** |
| D11 | Custo de insumo | Compras registradas → **custo médio ponderado**; venda **congela** o custo |
| D12 | Cardápio | Produto com **variações** (preço e receita próprios). Adicionais ficam para depois |
| D13 | Simulação de margem | **Canais de venda** cadastrados por empresa (taxa %, taxa fixa, frete) |
| D14 | Baixa de estoque | **Reserva na criação**, baixa na confirmação, expiração por job |
| D15 | Acesso a dados | **Drizzle ORM** + Postgres |
| D16 | Topologia | Painel → API direto (token); vitrine → renderizada no servidor pelo Next |
| D17 | Assinatura SaaS | Gateway desde já (ver premissa P1) |
| D18 | Kanbans | Status **fixos no código**, rótulo e cor editáveis por empresa |
| D19 | Produção | Lançamento de estoque com motivo (`production`), sem ordem de produção formal |
| D20 | Financeiro | Vendas + despesas + compras + **contas a pagar/receber e fluxo de caixa** |

## 2. Premissas que assumi

Não bloqueiam o plano, mas são escolhas reais. Cada uma é reversível a um custo diferente — o custo está anotado.

| # | Premissa | Custo de mudar depois |
|---|---|---|
| P1 | **Asaas** como gateway de assinatura (Pix/boleto/cartão recorrente, tarifa baixa para ticket de pequeno negócio), atrás de uma porta `BillingProvider` | Baixo — trocar por Mercado Pago é implementar a mesma interface |
| P2 | ~~Monorepo pnpm workspaces~~ → **npm workspaces** + Turborepo. Revisado na implementação: pnpm não estava instalado e npm 11 resolve o mesmo problema sem passo extra de setup | Alto |
| P3 | Dinheiro em **centavos** (`integer`); quantidades em `numeric(14,4)`. **Refinado na implementação:** custo por unidade de uso é `numeric(16,6)` em centavos fracionários — 1 g de farinha custa 0,2 centavo, e inteiro não representa isso | Alto |
| P4 | IDs **UUID v7** (ordenáveis no tempo, seguros de expor em URL pública) | Alto |
| P5 | Timezone `America/Sao_Paulo`; data de encomenda é `date` (dia local), não timestamp | Médio |
| P6 | **Soft delete** (`deleted_at`) em catálogo, clientes e insumos; pedidos nunca são apagados, só cancelados | Médio |
| P7 | **Audit log** de mudança de status, preço e estoque desde o dia 1 | Baixo |
| P8 | Fila de jobs em **pg-boss** (fila em cima do próprio Postgres, sem Redis novo na infra) | Baixo |
| P9 | Imagens em storage S3-compatível (R2), upload por URL pré-assinada | Baixo |
| P10 | Kanban atualiza por **polling** (5s) na v1; SSE previsto atrás da mesma camada de dados | Baixo |
| P11 | API versionada `/api/v1`, contratos em Zod → OpenAPI gerado | Baixo |
| P12 | Deploy **agnóstico**: API em container, Next em Vercel ou container. Nada depende de feature exclusiva de plataforma | Baixo |
| P13 | Todo produto tem **ao menos uma variação** (a "padrão"), mesmo sem variação visível na vitrine | Alto |
| P14 | pt-BR apenas; textos de UI centralizados para permitir i18n depois | Baixo |

**Sobre P13** — é a premissa que mais simplifica o resto: preço, receita, custo e estoque penduram *sempre* na variação, nunca no produto. Elimina o caso "produto com preço próprio + produto com preço por variação", que duplicaria toda a lógica de custo e de estoque.

---

## 3. Multi-tenancy: como funciona na prática

Três camadas, nesta ordem:

**1. Resolução do tenant (borda)**
- Vitrine: `middleware.ts` do Next lê o `Host`, resolve `padaria.cantina.app` → `tenant_id` (cache curto), injeta no contexto da requisição.
- Painel/Admin: o `tenant_id` vem **do token**, nunca da URL ou de query string.
- API: middleware `tenantContext` define o tenant a partir do token (rotas privadas) ou do header `X-Tenant-Host` enviado pelo servidor do Next (rotas de vitrine).

**2. Escopo na aplicação**
Todo repositório recebe o tenant do contexto (AsyncLocalStorage) — nenhuma query de módulo escreve `tenant_id` à mão.

**3. RLS como rede de segurança (a que realmente protege)**

```sql
-- Toda tabela de tenant:
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

- Toda requisição roda dentro de uma transação que começa com `SET LOCAL app.tenant_id = '...'`.
- Dois papéis de banco: `cantina_app` (sujeito a RLS, usado por 100% das rotas de tenant) e `cantina_platform` (`BYPASSRLS`, usado **só** pelo módulo `platform` e pelas migrations).
- Consequência: um `where` esquecido em qualquer módulo retorna zero linhas em vez de vazar dados de outra empresa.

**Índices**: toda chave composta começa por `tenant_id` (`(tenant_id, slug)`, `(tenant_id, status, created_at)`), porque nenhuma query jamais cruza tenants.

---

## 4. Modelo de dados

### 4.1 Plataforma (fora do RLS de tenant)

| Tabela | Campos principais |
|---|---|
| `plans` | `code`, `name`, `price_cents`, `limits` (jsonb: produtos, pedidos/mês, usuários), `active` |
| `tenants` | `slug`, `name`, `legal_name`, `document`, `status` (`trial`/`active`/`past_due`/`suspended`/`canceled`), `plan_id`, `timezone`, `deleted_at` |
| `tenant_domains` | `tenant_id`, `hostname` (único global), `type` (`subdomain`/`custom`), `is_primary`, `verified_at` |
| `subscriptions` | `tenant_id`, `plan_id`, `provider`, `provider_customer_id`, `provider_subscription_id`, `status`, `current_period_start/end`, `trial_ends_at`, `canceled_at` |
| `subscription_invoices` | `subscription_id`, `provider_invoice_id`, `amount_cents`, `status`, `due_date`, `paid_at`, `payment_url` |
| `webhook_events` | `provider`, `provider_event_id` (**único** — garante idempotência), `type`, `payload`, `processed_at`, `error` |
| `platform_users` | `email`, `password_hash`, `name`, `role` (`owner`/`support`) |
| `tenant_counters` | `tenant_id`, `scope` (`delivery_order`/`preorder`), `last_value` — gera código sequencial legível por empresa (#001, #002) |

`tenants.status` é o interruptor: `suspended` derruba a vitrine (503 com página de aviso) e coloca o painel em somente-leitura.

### 4.2 Identidade e configuração do tenant

| Tabela | Campos principais |
|---|---|
| `users` | `tenant_id`, `email`, `password_hash`, `name`, `role`, `status`, `last_login_at` — único `(tenant_id, email)` |
| `user_invites` | `email`, `role`, `token_hash`, `expires_at`, `accepted_at` |
| `refresh_tokens` | `user_id`, `token_hash`, `expires_at`, `revoked_at`, `user_agent`, `ip` |
| `audit_logs` | `actor_type`, `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `created_at` |
| `tenant_settings` | 1:1 com tenant — `whatsapp_number`, **`whatsapp_mode`** (`persist`/`link_only`), `accepts_delivery`, `accepts_preorder`, `accepts_online_checkout`, `min_order_cents`, `preorder_lead_time_hours`, `preorder_horizon_days`, `reservation_ttl_minutes`, `theme` (jsonb), `about`, `address` |
| `business_hours` | `weekday` (0-6), `opens_at`, `closes_at`, `scope` (`store`/`preorder`) |
| `delivery_zones` | `name`, `kind` (`neighborhood`/`radius`), `neighborhood`, `radius_km`, `fee_cents`, `min_order_cents`, `eta_minutes`, `active` |
| `order_status_labels` | `flow` (`delivery`/`preorder`), `status_code`, `label`, `color`, `position` — **rótulo editável sobre status fixo** (D18) |
| `notifications` | `type` (`low_stock`/`new_order`/`preorder_due`/`subscription_past_due`), `title`, `body`, `entity_type`, `entity_id`, `read_at` |

### 4.3 Clientes (do lojista)

| Tabela | Campos principais |
|---|---|
| `customers` | `name`, `phone` (E.164, único por tenant), `email`, `notes`, `orders_count`, `total_spent_cents`, `first_order_at`, `last_order_at`, `deleted_at` |
| `customer_addresses` | `customer_id`, `label`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `zip`, `reference`, `lat`, `lng`, `is_default` |

Sem login (D4): o checkout faz *find-or-create* por `(tenant_id, phone)`. Consequência aceita: quem digitar o telefone de outra pessoa vê o histórico dela — por isso a consulta pública de pedido exige **código do pedido + telefone**, nunca só telefone.

### 4.4 Catálogo

| Tabela | Campos principais |
|---|---|
| `categories` | `name`, `slug`, `position`, `active` |
| `products` | `category_id`, `name`, `slug`, `description`, `image_url`, **`stock_mode`** (`tracked`/`on_demand`), `available_for` (`delivery`/`preorder`/`both`), `active`, `position`, `deleted_at` |
| `product_variants` | `product_id`, `name`, `sku`, `price_cents`, `compare_at_price_cents`, `is_default`, `position`, `active` |
| `product_images` | `product_id`, `url`, `position` |

### 4.5 Insumos, custo e receita — o núcleo do produto

| Tabela | Campos principais |
|---|---|
| `suppliers` | `name`, `phone`, `notes` |
| `supplies` | `name`, `type` (`ingredient`/`packaging`), **`usage_unit`** (`g`/`ml`/`un`), `avg_unit_cost_cents` (por unidade de uso, **derivado**), `min_stock_qty`, `active`, `deleted_at` |
| `supply_purchases` | `supply_id`, `supplier_id`, `purchase_qty`, `purchase_unit`, **`conversion_factor`**, `total_cents`, `unit_cost_cents` (derivado), `purchased_at`, `invoice_ref` |
| `recipes` | `product_variant_id` (**único**), `yield_qty`, `notes` |
| `recipe_items` | `recipe_id`, `supply_id`, `qty` (em `usage_unit`), `waste_percent` |
| `sales_channels` | `name`, `kind` (`own_storefront`/`marketplace`/`counter`), `commission_percent`, `fixed_fee_cents`, `payment_fee_percent`, `absorbs_delivery_fee`, `active` |

**Como o custo é calculado (D11).** Comprei um saco de 5 kg de farinha por R$ 50, uso em gramas:

```
purchase_qty = 5 ; purchase_unit = 'kg' ; conversion_factor = 1000 ; total_cents = 5000
unit_cost_cents = 5000 / (5 × 1000) = 1 centavo por grama
```

O `avg_unit_cost_cents` do insumo é a **média ponderada** sobre o saldo existente, recalculada a cada compra:

```
novo_custo = (saldo_atual × custo_atual + qty_comprada × custo_da_compra)
             ÷ (saldo_atual + qty_comprada)
```

Custo de uma variação = `Σ (recipe_item.qty × (1 + waste_percent) × supply.avg_unit_cost_cents) ÷ recipe.yield_qty`.

E no momento da venda esse valor é **copiado** para `unit_cost_cents` do item do pedido. Sem isso, um aumento na farinha reescreveria retroativamente a margem de todos os meses anteriores.

**Simulação de canal (D13):**

```
receita_liquida = preço × (1 − commission% − payment_fee%) − fixed_fee
                  − (absorbs_delivery_fee ? delivery_fee : 0)
margem          = receita_liquida − custo_da_variação
```

### 4.6 Estoque — livro-razão, não coluna

Duas tabelas, e a distinção entre elas é o que torna a reserva (D14) correta:

| Tabela | Papel |
|---|---|
| `stock_items` | **Saldo materializado.** `kind` (`product_variant`/`supply`), `ref_id`, `qty_on_hand`, `qty_reserved`, `updated_at` — único `(tenant_id, kind, ref_id)` |
| `stock_movements` | **Livro append-only.** `kind`, `ref_id`, `type`, `qty_delta`, `balance_after`, `unit_cost_cents`, `reason`, `source_type`, `source_id`, `created_by`, `created_at` |

`qty_available = qty_on_hand − qty_reserved` — é esse número que a vitrine mostra.

Tipos de movimento e o que cada um toca:

| `type` | `qty_on_hand` | `qty_reserved` | Origem |
|---|---|---|---|
| `purchase` | + | — | compra de insumo |
| `production_in` | + | — | produção (produto pronto) |
| `production_out` | − | — | produção (consumo de insumo) |
| `reservation` | — | + | pedido criado |
| `reservation_release` | — | − | pedido cancelado ou expirado |
| `sale` | − | − | pedido confirmado (converte reserva em saída) |
| `adjustment` / `loss` / `return` | ± | — | manual, com motivo obrigatório |

Toda escrita acontece dentro de uma transação com `SELECT ... FOR UPDATE` no `stock_items`, e o livro nunca é editado nem apagado — divergência sempre se corrige com um movimento novo de `adjustment`.

`production_entries` (`product_variant_id`, `qty`, `produced_at`, `notes`, `created_by`) é o registro de "produzi 20 coxinhas" (D19): gera um `production_in` no produto e um `production_out` por insumo da receita, tudo na mesma transação.

**Disponibilidade na vitrine, por modo (D9):**

- `tracked` → `stock_items.qty_available` da variação.
- `on_demand` → `min(qty_available do insumo ÷ qty na receita)` entre os insumos da receita. Calculado no servidor e cacheado por tenant; invalidado por qualquer movimento de insumo.

### 4.7 Pedidos de delivery

| Tabela | Campos principais |
|---|---|
| `delivery_orders` | `code`, `customer_id`, `status`, `status_changed_at`, `origin`, `fulfillment` (`delivery`/`pickup`), `sales_channel_id`, `subtotal_cents`, `discount_cents`, `delivery_fee_cents`, `total_cents`, **`cost_cents`**, `payment_method`, `payment_status`, `change_for_cents`, `address_snapshot` (jsonb), `notes`, `idempotency_key`, `expires_at`, e marcos: `placed_at`, `confirmed_at`, `ready_at`, `dispatched_at`, `completed_at`, `canceled_at`, `cancel_reason` |
| `delivery_order_items` | `order_id`, `product_variant_id`, `product_name_snapshot`, `variant_name_snapshot`, `qty`, `unit_price_cents`, **`unit_cost_cents`**, `total_cents`, `notes` |

`origin`: `storefront_checkout` | `storefront_whatsapp` | `manual` | `imported`.

Fluxo (D18 — códigos fixos, rótulos editáveis):

```
pending → confirmed → preparing → ready → out_for_delivery → completed
   └──────────────────── canceled ◄────────────────────┘
```

`pickup` pula `out_for_delivery`. `pending → confirmed` é o gatilho da baixa de estoque; `completed` é o gatilho do lançamento financeiro.

### 4.8 Encomendas

| Tabela | Campos principais |
|---|---|
| `preorders` | `code`, `customer_id`, `status`, `origin`, `fulfillment`, **`due_date`** (`date`), `due_time_hint`, `availability_day_id`, valores (idem delivery), `deposit_cents`, `deposit_paid_at`, `payment_method`, `payment_status`, `address_snapshot`, `notes`, `idempotency_key`, `expires_at`, marcos |
| `preorder_items` | mesma forma de `delivery_order_items` |

Fluxo:

```
pending → confirmed → in_production → ready → completed
   └─────────────── canceled ◄──────────────┘
```

Agregado separado (D6) porque encomenda tem data futura, vaga na agenda e sinal — e porque o kanban dela é operado em outro ritmo. A duplicação real fica em duas tabelas de itens e dois conjuntos de status; o restante é neutralizado pela view da seção 4.11.

### 4.9 Agenda de disponibilidade

| Tabela | Campos principais |
|---|---|
| `availability_rules` | `weekday` (0-6), `is_open`, `capacity` — a regra semanal. **`cutoff_time` foi removido na implementação:** `preorder_lead_time_hours` cobre o mesmo caso de forma mais geral, e coluna que não é aplicada em lugar nenhum é pior que a ausência dela |
| `availability_exceptions` | `date`, `is_open`, `capacity`, `reason` — feriado, férias, mutirão |
| `availability_days` | `date` (**único por tenant**), `capacity`, `used_count`, `reserved_count` — contador materializado |

`availability_days` é gerada sob demanda a partir de regra + exceção, e é ela que permite reservar vaga **atomicamente**:

```sql
UPDATE availability_days
   SET reserved_count = reserved_count + 1
 WHERE tenant_id = $1 AND date = $2
   AND reserved_count + used_count < capacity
RETURNING id;   -- zero linhas = dia lotou entre a consulta e o envio
```

Um dia só aparece disponível na vitrine se: a regra permite, nenhuma exceção fecha, `used + reserved < capacity`, e a data respeita `preorder_lead_time_hours` e `preorder_horizon_days`.

### 4.10 Financeiro (D20)

| Tabela | Campos principais |
|---|---|
| `financial_accounts` | `name`, `kind` (`cash`/`bank`/`wallet`), `opening_balance_cents`, `active` |
| `financial_categories` | `name`, `kind` (`income`/`expense`), `parent_id` |
| `financial_entries` | `direction` (`in`/`out`), `category_id`, `account_id`, `description`, `amount_cents`, **`due_date`**, `paid_at`, `paid_amount_cents`, `status` (`open`/`paid`/`overdue`/`canceled`), `source_type`, `source_id`, `recurrence_id`, `attachment_url` |
| `financial_recurrences` | `template` do lançamento, `frequency`, `next_due_date`, `ends_at` — aluguel, energia, internet |

`source_type` liga o lançamento à origem (`delivery_order`, `preorder`, `supply_purchase`, `subscription`, `manual`), o que evita contagem dupla: pedido concluído gera entrada automática, compra de insumo gera saída automática, e ambas ficam rastreáveis até o documento de origem.

**Fluxo de caixa** = saldo das contas + projeção dos `financial_entries` com `status = open` agrupados por `due_date`.

### 4.11 View unificada de leitura

```sql
CREATE VIEW v_orders_unified AS
  SELECT id, tenant_id, 'delivery' AS kind, code, customer_id,
         status, sales_channel_id, total_cents, cost_cents,
         placed_at, completed_at, canceled_at
    FROM delivery_orders
   UNION ALL
  SELECT id, tenant_id, 'preorder', code, customer_id,
         status, sales_channel_id, total_cents, cost_cents,
         placed_at, completed_at, canceled_at
    FROM preorders;
```

Todo relatório de faturamento, margem e ranking lê **daqui**. É a mitigação prática de D6: dois agregados na escrita, um único caminho de cálculo na leitura.

### 4.12 Mapa de relações

```
tenants ──┬── tenant_domains          tenants ──┬── users ── refresh_tokens
          ├── subscriptions ── subscription_invoices
          └── tenant_settings / business_hours / delivery_zones / sales_channels

categories ── products ── product_variants ──┬── recipes ── recipe_items ── supplies
                                             ├── stock_items ── stock_movements
                                             └── production_entries

suppliers ── supply_purchases ── supplies ──┬── stock_items ── stock_movements
                                            └── (min_stock_qty → notifications)

customers ──┬── customer_addresses
            ├── delivery_orders ── delivery_order_items ── product_variants
            └── preorders ── preorder_items ── product_variants
                    └── availability_days ◄── availability_rules / availability_exceptions

delivery_orders ─┐
                 ├──► v_orders_unified ──► relatórios
preorders ───────┘
                 └──► financial_entries ── financial_accounts / financial_categories
```

---

## 5. Estrutura do repositório

```
cantina/
├─ apps/
│  ├─ api/                          # Node + Express (prioridade nº 1)
│  │  ├─ src/
│  │  │  ├─ main.ts                 # bootstrap HTTP
│  │  │  ├─ app.ts                  # composição do Express
│  │  │  ├─ config/                 # env validado por Zod, constantes
│  │  │  ├─ http/
│  │  │  │  ├─ middlewares/         # auth, tenantContext, rls, rateLimit,
│  │  │  │  │                       # idempotency, errorHandler, requestId
│  │  │  │  ├─ errors/              # AppError e mapeamento p/ HTTP
│  │  │  │  └─ router.ts            # monta /api/v1
│  │  │  ├─ modules/                # um diretório por módulo (seção 8)
│  │  │  │  └─ <modulo>/
│  │  │  │     ├─ <modulo>.routes.ts
│  │  │  │     ├─ <modulo>.controller.ts
│  │  │  │     ├─ <modulo>.service.ts     # regra de aplicação + transação
│  │  │  │     ├─ <modulo>.repository.ts  # única camada que toca Drizzle
│  │  │  │     └─ <modulo>.test.ts
│  │  │  ├─ jobs/                   # pg-boss: expiração de reserva, estoque
│  │  │  │                          # baixo, lembrete de encomenda, dunning
│  │  │  ├─ integrations/           # asaas/, whatsapp/, storage/ (portas + adaptadores)
│  │  │  └─ shared/                 # logger, resultado, paginação, ALS de contexto
│  │  └─ test/                      # integração, com Postgres em Testcontainers
│  │
│  └─ web/                          # Next.js (App Router) + Tailwind
│     ├─ middleware.ts              # resolve tenant pelo Host → reescreve rota
│     └─ src/
│        ├─ app/
│        │  ├─ (storefront)/        # vitrine pública, SSR/ISR por tenant
│        │  │  ├─ page.tsx                    # cardápio
│        │  │  ├─ produto/[slug]/page.tsx
│        │  │  ├─ encomenda/page.tsx          # agenda + montagem
│        │  │  ├─ carrinho/ · checkout/
│        │  │  └─ pedido/[code]/page.tsx      # acompanhamento
│        │  ├─ (panel)/painel/      # painel do lojista (SPA autenticada)
│        │  │  ├─ pedidos/ · encomendas/ · calendario/
│        │  │  ├─ produtos/ · insumos/ · fichas/
│        │  │  └─ clientes/ · financeiro/ · relatorios/ · configuracoes/
│        │  ├─ (admin)/admin/       # painel da plataforma (D5)
│        │  └─ (auth)/entrar/ · recuperar/
│        ├─ features/               # espelha os módulos da API
│        ├─ components/ui/          # primitivos
│        ├─ lib/                    # api-client, auth, formatadores, query
│        └─ styles/
│
├─ packages/
│  ├─ contracts/                    # Zod + tipos + OpenAPI — fonte da verdade da API
│  ├─ domain/                       # regra pura, sem I/O: custo, margem,
│  │                                # disponibilidade, transições de status
│  ├─ db/                           # schema Drizzle, migrations, políticas RLS, seed
│  └─ config/                       # tsconfig, eslint, prettier, preset Tailwind
│
├─ docs/                            # ADRs e este plano
├─ docker-compose.yml               # postgres + minio
├─ turbo.json · pnpm-workspace.yaml
└─ PLAN.md
```

**Por que `contracts` e `domain` são pacotes e não pastas da API**

- `contracts` é o que o app mobile futuro vai consumir para ter a API tipada sem copiar nada. É também o que garante que vitrine, painel e API não divirjam sobre o formato de um pedido.
- `domain` guarda o cálculo de custo, a disponibilidade e as transições de status — as regras que precisam ser testadas sem banco e que **não podem** ser reimplementadas no front. Manter fora da API é o que impede isso de vazar para dentro de um componente React.

Dentro de `modules/`, a regra é uma só: **um módulo nunca importa o repositório de outro**, só o service. É o que permite pedir um módulo de cada vez, em diffs pequenos.

---

## 6. Contratos de API por domínio

Base `/api/v1`. Erros em formato único: `{ error: { code, message, details? } }`.
Auth do painel: access token curto (memória) + refresh token em cookie `httpOnly` — portável para o mobile futuro (P11/D16).

### 6.1 Vitrine — pública, sem auth, tenant pelo host

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/storefront/config` | dados da loja, horários, aberta/fechada agora, formas de pagamento, `whatsapp_mode` |
| `GET` | `/storefront/menu` | categorias + produtos + variações + **disponibilidade calculada** |
| `GET` | `/storefront/products/:slug` | detalhe |
| `GET` | `/storefront/delivery-zones` | bairros atendidos |
| `POST` | `/storefront/delivery-quote` | `{ neighborhood \| zip }` → `{ fee_cents, eta_minutes, min_order_cents }` |
| `GET` | `/storefront/availability?from=&to=` | calendário de encomendas: `[{ date, available, slots_left }]` |
| `POST` | `/storefront/orders` | cria pedido de delivery — exige `Idempotency-Key`; **reserva estoque** |
| `POST` | `/storefront/preorders` | cria encomenda — reserva estoque **e** vaga na agenda |
| `POST` | `/storefront/whatsapp-draft` | monta a mensagem; conforme `whatsapp_mode` (D7), grava o pedido e devolve `{ order, whatsapp_url }`, ou só `{ whatsapp_url }` |
| `GET` | `/storefront/orders/:code?phone=` | acompanhamento (código **+** telefone) |

### 6.2 Auth e usuários

`POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`
`POST /auth/forgot-password` · `POST /auth/reset-password`
`GET|POST /users` · `PATCH|DELETE /users/:id` · `POST /users/invites` · `POST /users/invites/:token/accept`

### 6.3 Clientes

`GET /customers?q=&page=` · `POST /customers` · `GET|PATCH|DELETE /customers/:id`
`GET /customers/:id/orders` — histórico unificado (delivery + encomendas)
`GET|POST /customers/:id/addresses` · `PATCH|DELETE /customers/:id/addresses/:addressId`

### 6.4 Catálogo

`GET|POST /categories` · `PATCH|DELETE /categories/:id` · `PATCH /categories/reorder`
`GET|POST /products` · `GET|PATCH|DELETE /products/:id`
`PATCH /products/:id/availability` — pausar/despausar na vitrine
`GET|POST /products/:id/variants` · `PATCH|DELETE /variants/:id`
`POST /products/:id/images/upload-url` — URL pré-assinada (P9)

### 6.5 Estoque e insumos

| Método | Rota |
|---|---|
| `GET` | `/stock?kind=product_variant\|supply` — saldo, reservado, disponível |
| `GET` | `/stock/movements?kind=&ref_id=&from=&to=` — extrato |
| `POST` | `/stock/adjustments` — `{ kind, ref_id, qty_delta, reason }` |
| `POST` | `/stock/production` — `{ product_variant_id, qty }` (D19) |
| `GET` | `/supplies/low-stock` — abaixo de `min_stock_qty` |
| `GET\|POST` | `/supplies` · `GET\|PATCH\|DELETE /supplies/:id` |
| `GET\|POST` | `/suppliers` · `PATCH\|DELETE /suppliers/:id` |
| `GET\|POST` | `/supply-purchases` — a compra **dá entrada no estoque e recalcula o custo médio** (D11) |

### 6.6 Fichas técnicas e precificação

`GET|PUT /variants/:id/recipe` — `{ yield_qty, items: [{ supply_id, qty, waste_percent }] }`
`GET /variants/:id/cost` — custo unitário atual, com quebra por insumo
`GET /products/:id/costing` — receita, custo e margem de todas as variações do produto
`GET /pricing/summary?variantIds=` — tem ficha, custo e margem de até 200 variações, para listas
`GET|POST /sales-channels` · `PATCH|DELETE /sales-channels/:id`
`POST /pricing/simulate` — `{ variant_id, price_cents, channel_ids[], delivery_fee_cents? }` → margem por canal (D13)

### 6.7 Kanban de delivery

| Método | Rota |
|---|---|
| `GET` | `/delivery-orders?status=&from=&to=&q=` |
| `GET` | `/delivery-orders/board` — agrupado por coluna, com os rótulos do tenant (D18) |
| `POST` | `/delivery-orders` — lançamento manual no painel |
| `GET\|PATCH` | `/delivery-orders/:id` |
| `PATCH` | `/delivery-orders/:id/status` — **única** porta de transição; valida a máquina de estados e dispara estoque/financeiro |
| `POST` | `/delivery-orders/:id/cancel` — `{ reason }`; libera reserva |
| `POST` | `/delivery-orders/:id/payment` — marca como pago (D8) |

### 6.8 Kanban de encomendas e calendário

`GET /preorders?status=&due_from=&due_to=` · `GET /preorders/board`
`POST /preorders` · `GET|PATCH /preorders/:id` · `PATCH /preorders/:id/status` · `POST /preorders/:id/cancel`
`POST /preorders/:id/deposit` — registra o sinal
`GET /preorders/calendar?month=` — encomendas por dia + ocupação da agenda
`GET|PUT /availability/rules` · `GET|POST /availability/exceptions` · `DELETE /availability/exceptions/:id`
`GET /availability/days?from=&to=` — visão do lojista (capacidade, usado, reservado)

**Calendário da loja** — um por empresa, aberto à equipe toda:
`GET /calendar?from=&to=&kinds=&userId=` — encomendas + ocupação, lembretes e vencimentos (estes só para `owner`/`manager`/`finance`)
`POST /calendar/reminders` · `PATCH|DELETE /calendar/reminders/:id` — concluir é aberto a todos; editar e apagar, ao autor ou à gerência

### 6.9 Financeiro e relatórios

`GET|POST /finance/entries?status=&from=&to=` · `PATCH|DELETE /finance/entries/:id`
`POST /finance/entries/:id/settle` — baixa de pagamento
`GET|POST /finance/categories` · `GET|POST /finance/accounts`
`GET|POST /finance/recurrences` · `PATCH|DELETE /finance/recurrences/:id`
`GET /finance/cashflow?from=&to=` — realizado + projetado
`GET /reports/summary?from=&to=` — faturamento, pedidos, ticket médio, margem bruta, resultado
`GET /reports/sales?from=&to=&groupBy=day|channel|payment_method|origin|kind`
`GET /reports/products?from=&to=&orderBy=revenue|qty|margin&limit=`
`GET /reports/costs?from=&to=` — consumo, perda e compras por insumo

### 6.10 Configurações e notificações

`GET|PUT /settings` · `GET|PUT /settings/business-hours`
`GET|POST /settings/delivery-zones` · `PATCH|DELETE /settings/delivery-zones/:id`
`GET|PUT /settings/status-labels` · `GET /settings/domains` · `POST /settings/domains`
`GET /notifications?unread=true` · `POST /notifications/:id/read` · `POST /notifications/read-all`

### 6.11 Plataforma (admin) e webhooks

**Lojista** (painel, só `owner`):
`GET /subscription` — plano, faturas, uso contra o limite, planos disponíveis
`POST /subscription` — contrata · `DELETE /subscription` — cancela (com motivo)

**Plataforma** (sessão própria, `platform_users`):
`POST /platform/auth/login` · `GET /platform/me` · `GET /platform/metrics`
`GET|POST /platform/plans` · `PATCH /platform/plans/:id`
`GET|POST /platform/tenants` · `GET|PATCH /platform/tenants/:id`
`POST /platform/tenants/:id/status` — muda o status, com motivo obrigatório
`GET /platform/subscriptions`

`POST /webhooks/asaas` — verifica o segredo, grava em `webhook_events` (idempotente por `provider_event_id`), aplica e marca como processado

---

## 7. Invariantes do backend

Regras que valem em todo módulo. É a lista que serve de checklist de revisão de cada entrega.

1. Nenhuma rota de tenant executa fora de uma transação com `SET LOCAL app.tenant_id`.
2. Nenhum `tenant_id` vem do corpo, da URL ou de query — só do token ou do host resolvido.
3. Toda mutação de estoque passa por um `stock_movements`; ninguém escreve `qty_on_hand` diretamente.
4. Todo item de pedido guarda **snapshot** de nome, preço e custo. Catálogo muda; histórico não.
5. Transição de status só pela rota `/status`, validada contra a máquina de estados de `packages/domain`.
6. Toda criação de pedido exige `Idempotency-Key` (a vitrine roda em celular com rede ruim).
7. Reserva de estoque e de vaga na agenda é atômica e tem TTL; job libera o que expirou.
8. Dinheiro sempre em centavos inteiros. Nenhum `float` em cálculo monetário.
9. Toda listagem é paginada por cursor, com teto de página.
10. Nenhuma regra de negócio no controller e nenhuma query fora do repository.

---

## 8. Módulos e ordem de implementação

Cada linha é uma entrega independente, pedível isoladamente. As dependências são reais — a ordem importa até o item 8.

| # | Módulo | Entrega | Depende de |
|---|---|---|---|
| 0 | ✅ **Fundação** | monorepo, Docker, Drizzle, RLS, `tenantContext`, erros, logger, health | — |
| 1 | ✅ **Auth e tenant** | login, refresh com rotação, papéis, convites, `tenant_settings`, horários, rótulos de status, resolução por host | 0 |
| 2 | ✅ **Catálogo** | categorias, produtos, variações, imagens (upload pré-assinado) | 1 |
| 3 | ✅ **Estoque e insumos** | `stock_items`, `stock_movements`, insumos, fornecedores, compras, custo médio, ajuste, perda, alerta | 1 |
| 4 | ✅ **Fichas e precificação** | receitas, custo por variação, canais, simulador, produção (D19), disponibilidade derivada | 2, 3 |
| 5 | ✅ **Clientes** | CRUD, endereços, histórico unificado, find-or-create, anonimização (D24) | 1 |
| 6 | ✅ **Kanban de delivery** | pedidos, máquina de estados, reserva/baixa, board, expiração por job | 2, 3, 5 |
| 7 | ✅ **Agenda + Kanban de encomendas** | regras, exceções, reserva atômica de vaga, encomendas, calendário, sinal | 2, 3, 5 |
| 8 | ✅ **Vitrine (API)** | cardápio, disponibilidade, frete, checkout, WhatsApp, acompanhamento | 2, 3, 6 |
| 9 | ✅ **Financeiro** | lançamentos, contas, categorias, recorrências, fluxo de caixa, receita e despesa automáticas | 6, 7 |
| 10 | ✅ **Relatórios** | resumo do período, vendas agrupadas, ranking de produtos, consumo de insumo | 6, 7, 9 |
| 11 | ✅ **Assinatura e admin** | planos, Asaas, webhooks idempotentes, cobrança em atraso, limites de plano, painel `/admin` | 1 |
| 12 | ✅ **Frontend da vitrine** | UI pública responsiva | 8 |
| 13 | ✅ **Frontend do painel** | UI dos kanbans, estoque, calendário, financeiro, relatórios | 6-10 |
| 14 | **Notificações e jobs** | estoque baixo, expiração de reserva, lembrete de encomenda, dunning | 3, 6, 7, 11 |

Ordem sugerida: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**, com 12-14 depois — respeitando a prioridade definida (backend robusto primeiro, design por último).

## 9. Portas deliberadamente deixadas abertas

- **Mobile nativo**: a API já é versionada, tokenizada e tipada em `packages/contracts`. Nenhuma regra de negócio mora no front. O app consome os mesmos endpoints do painel.
- **Pagamento online na vitrine**: `payment_method` e `payment_status` já existem no pedido. Plugar gateway é preencher os mesmos campos por webhook, sem migration de pedido.
- **Adicionais de produto**: entram como `variant_options` penduradas na variação, reusando `recipe_items` para o consumo de insumo.
- **Slots de horário na agenda**: `availability_days` vira pai de `availability_slots` sem alterar o que já existe.
- **Domínio próprio**: `tenant_domains` já modela `custom`; falta só emissão de TLS e verificação.
- **Marketplaces (iFood)**: `sales_channels` + `origin` no pedido já preveem a entrada externa.
- **Ordem de produção formal**: `production_entries` vira filha de uma `production_orders` sem mexer no livro de estoque.

## 10. Decisões que estavam em aberto — resolvidas

| # | Item | Decisão |
|---|---|---|
| D21 | Alvo de deploy | **Container para os dois apps.** API com `tsup` (bundle único) e Next com `output: 'standalone'`. Nada depende de feature exclusiva de plataforma, então Vercel continua sendo opção sem alterar o código. A vitrine usa **SSR com cache por tag** em vez de ISR puro: quando o estoque muda, o módulo invalida `storefront:<host>` e a página reflete na carga seguinte, sem esperar TTL — o que ISR sozinho não dá. |
| D22 | E-mail transacional | **Resend**, chamado por HTTP direto, sem SDK. Atrás da porta `MailProvider`. Sem `RESEND_API_KEY`, cai num adaptador de console: em desenvolvimento o link de convite aparece no terminal e o fluxo inteiro é testável sem conta em provedor nenhum. |
| D23 | WhatsApp | **Só `wa.me`** na v1, atrás da porta `WhatsAppProvider`. Zero credencial, zero custo, e cobre o fluxo que o lojista já usa. A Cloud API entra depois implementando `sendMessage`, sem tocar em quem só precisa do link. |
| D24 | LGPD | **Anonimização, não exclusão.** `customers.anonymized_at` limpa os dados pessoais e preserva o pedido — o histórico financeiro precisa fechar. Por isso todo pedido guarda `customer_name_snapshot` e `customer_phone_snapshot`: depois de anonimizado o cliente, o pedido continua legível sem reidentificá-lo. |

## 11. O que a implementação acrescentou ao plano

Decisões pequenas que só apareceram ao construir, registradas aqui para não virarem folclore.

### Calendário, custo por papel e formulários

- **O calendário não tem dado próprio além dos lembretes.** Encomendas e vencimentos são lidos
  pelos SERVIÇOS dos módulos donos (`calendarRange`, `listEntries`, `getRange`), nunca pelas
  tabelas. `calendar_reminders` tem `tenant_id` e entra no RLS pelo script, como qualquer
  tabela nova — rode `db:migrate` e depois `db:rls`.
- **Concluir lembrete é de todos; mudar o que ele diz, do autor ou da gerência.** Marcar como
  feito é o trabalho do dia; reescrever o lembrete de outra pessoa é outra coisa.
- **Custo é cortado na resposta para quem não decide preço.** `hideCostsFromOperators` entra no
  `mountPanelModule` e remove `costCents`, `unitCostCents`, `avgUnitCost`, margem e afins de
  toda resposta a `staff`. As rotas de ficha e relatório já exigiam papel; o custo também
  viajava dentro do pedido e do insumo, abertos ao balcão. É rede de segurança, como o RLS: um
  módulo novo não depende de alguém lembrar de filtrar. Os campos viraram opcionais no
  contrato, e o `tsc` obrigou cada tela a lidar com a ausência.
- **`/products/:id/costing` é o segundo router sobre `/products`**, montado depois do catálogo,
  pelo mesmo motivo do `/variants`: `/:id/costing` não casa com nenhuma rota do módulo 2.
- **Mensagens do Zod em português, instaladas no pacote de contratos.** O mesmo schema valida
  na API e tipa o front; a mensagem escrita no schema continua valendo, o mapa só preenche o
  que ninguém escreveu.
- **A migration 0001 também cria `subscription_invoices_provider_uq`.** O índice estava no
  schema desde o módulo 11 sem ter virado migration; vai com `IF NOT EXISTS` para não falhar
  num banco onde alguém já o tenha criado à mão.

### Módulo 11 — assinatura e administração

- **Duas sessões, não uma com um campo a mais.** O token de plataforma não tem `tid`; o do painel tem `scope: 'tenant'`. Cada verificador exige o que o outro não fornece, então nenhum dos dois passa pelo lado errado — a fronteira mais importante do sistema é estrutural, não uma comparação de string que alguém pode esquecer de escrever.
- **A travessia entre as camadas vai num sentido só.** A tela de assinatura do lojista conta o uso na transação de TENANT (sob RLS) e depois lê a cobrança numa transação de PLATAFORMA. O inverso não existe: nenhuma rota de plataforma abre contexto de tenant, para que "ver a própria conta" nunca vire "ver a de todos".
- **O gateway é chamado ANTES do banco.** Se ele falhar, nada foi gravado e o lojista tenta de novo. Se o banco falhar depois, sobra uma assinatura órfã lá — reconciliável pelo `externalReference`, que carrega o `tenant_id`. A ordem inversa produziria um cliente marcado como pagante que nunca foi cobrado, que é o erro caro.
- **O webhook grava antes de processar.** `provider_event_id` único com `onConflictDoNothing`: o Asaas reentrega até receber 200, e sem isso uma fatura seria baixada duas vezes. Um evento que falha fica com `processed_at` nulo — auditável e reprocessável. A resposta é 200 mesmo assim: insistir com o gateway não corrige a causa, só multiplica as tentativas.
- **Fatura tem chave única por `provider_invoice_id`.** O mesmo pagamento chega em três eventos (criado, vencido, confirmado) e precisa mover a MESMA linha; sem a chave, a mesma cobrança apareceria três vezes na conta do cliente.
- **A escada de cobrança é lenta de propósito.** Vencimento passa → somente-leitura, com a vitrine no ar. Quinze dias → suspensão. Tirar o acesso de quem está atrasado é o jeito mais rápido de garantir que não pague, e derrubar a loja custa faturamento ao cliente antes de custar a nós.
- **`suspended` e `canceled` só saem pela mão de um administrador.** Um webhook de pagamento antigo não pode desfazer uma suspensão por abuso.
- **Limite de plano vale só na CRIAÇÃO.** Quem baixou de plano continua vendo e editando o que já tem — apagar dado do cliente por decisão comercial nossa seria outra coisa. E limite ausente é SEM limite, nunca zero: tratar `undefined` como 0 trancaria o cliente para fora da própria conta.
- **Pedido não é bloqueado por limite.** Ele chega pela vitrine, feito por um cliente que não tem relação comercial conosco; recusá-lo tira faturamento do lojista para nos pressionar. O número é contado e mostrado na tela de assinatura — a conversa acontece ali.
- **Sem `ASAAS_API_KEY`, um adaptador local ativa a assinatura sem cobrar** — o mesmo padrão do console de e-mail (D22), e o que torna o fluxo testável sem conta em provedor. Em produção a API **se recusa a subir** sem a chave: continuar "ativando" assinaturas sem cobrar seria dar o produto de graça em silêncio.
- **Mudança de status exige motivo escrito**, e vai para `audit_logs` com o `tenant_id` da empresa AFETADA, não o do ator: a pergunta que a auditoria responde é "quem derrubou minha loja e por quê", e ela é feita olhando o histórico daquela empresa.

### Módulo 10 — relatórios

- **O dia do relatório é o dia da LOJA, não o do servidor.** `completed_at::date` corta em UTC: uma venda das 21h em São Paulo é meia-noite em UTC e apareceria no faturamento do dia seguinte — todo dia, sem que o total do mês denuncie. O intervalo é convertido uma vez em `zonedStartOfDay` e comparado como `[início, fim)`, o que ainda mantém os índices de `completed_at` utilizáveis. Sete testes, incluindo a virada de horário de verão.
- **Compra de insumo aparece no resumo mas não entra no resultado.** Comprar 50 kg de farinha não é despesa do mês: é estoque, e vira custo quando o produto sai. Somar as duas coisas contaria a farinha duas vezes e faria um mês de reposição parecer prejuízo. `supplyPurchasesCents` é informação de caixa, separada de `operatingExpensesCents`.
- **Recorte por `completed_at`, não por `placed_at`.** Faturamento é o que foi entregue no período. Um pedido feito dia 31 e entregue dia 1º pertence ao mês seguinte, e a mesma regra vale para o custo congelado nele.
- **Ranking de produtos é fundido em memória, não numa segunda view.** `v_orders_unified` agrega pedidos, não itens; uma view de itens seria um objeto a mais para manter em sincronia com dois schemas. São duas consultas simétricas somadas por `product_variant_id` — e quando ele é nulo (variação excluída depois da venda), o nome congelado vira a chave, senão todo produto apagado viraria uma linha só.
- **Consumo e perda são somas separadas.** Juntá-las esconde justamente o número sobre o qual dá para agir. Perda é convertida a dinheiro pelo custo médio atual, com a ressalva de que é estimativa: o custo do dia da perda não é guardado.
- **A participação de cada produto é sobre o faturamento de ITENS, não sobre o do resumo.** O resumo inclui taxa de entrega e desconto no pedido; usá-lo como denominador faria as fatias não fecharem 100%.
- **Venda sem canal vira uma linha própria em vez de sumir.** Sem o `coalesce`, o agrupamento por canal perderia toda venda de balcão e a soma das linhas deixaria de bater com o faturamento — divergência que ninguém investiga porque cada tela parece certa sozinha.
- **O rótulo do canal é resolvido no servidor.** Só ali existe o nome por trás do UUID, e resolvê-lo na tela custaria uma segunda requisição. O agrupamento por dia devolve a data ISO como rótulo de propósito: quem desenha o gráfico precisa dela ordenável.
- **Janela máxima de 366 dias.** Além disso a agregação por dia deixa de caber num gráfico e a consulta deixa de ser barata — e o limite é do serviço, não do contrato, para valer em qualquer chamador.
- **Relatório não exige assinatura ativa.** Como o resto da leitura, continua acessível em atraso: são os números que o lojista precisa para decidir pagar.

### Módulo 9 — financeiro

- **`overdue` não é gravado, é derivado.** Guardar exigiria um job noturno cuja única função seria virar uma flag — e um lançamento vencido às 23h59 ficaria "em aberto" até a rodada seguinte. Ele é calculado na leitura: aberto + vencimento no passado.
- **Pedido concluído vira receita, mas `paid` segue o PAGAMENTO, não a entrega.** Um pedido entregue e ainda não pago é conta a receber; tratá-lo como caixa inflaria o saldo com dinheiro que não chegou.
- **O índice único em `(tenant_id, source, source_id)` é a proteção contra contagem dupla**, e o serviço engole a colisão em silêncio: reprocessar uma transição não pode derrubar o pedido por causa de um efeito colateral. O pedido é o fato principal.
- **Lançamento automático não é editável.** Ele espelha um documento; mudar o valor aqui faria o financeiro discordar da origem sem deixar rastro de qual dos dois está certo. Para corrigir, corrige-se a origem.
- **Saldo da conta só conta o que foi PAGO.** Um boleto agendado não tirou dinheiro do caixa, e somá-lo faria o saldo mentir para menos.
- **A projeção usa o VENCIMENTO, não o pagamento**, e a tela recebe `projected: true` a partir de amanhã — sem essa fronteira a linha inteira pareceria extrato.
- **Recorrência vira lançamento concreto, não regra consultada na hora.** É o que mantém a projeção auditável: o que a tela mostra existe no banco e pode ser editado, baixado ou cancelado individualmente. Uma recorrência parada há meses gera todos os lançamentos que faltaram, não só o último.
- **31 de janeiro + 1 mês = 28 de fevereiro.** Somar meses no `Date` transborda para março, e o aluguel do dia 31 passaria a vencer no dia 3 — silenciosamente e para sempre, porque o cálculo seguinte parte da data errada. Tem oito testes.
- **O papel `finance` ganhou uso.** O contador vê lançamentos e fluxo de caixa sem acessar o kanban nem o cardápio; `staff` não entra — quem está no balcão não precisa ver o resultado do mês.

### Módulo 7 — agenda e encomendas

- **A vaga é reservada ANTES de gravar a encomenda.** Se o dia lotou, não há encomenda para desfazer — a transação cai antes de existir linha. A ordem inversa deixaria um pedido órfão sempre que duas pessoas disputassem a última vaga.
- **Duas etapas na reserva, e a ordem importa.** Primeiro a função pura decide se o dia aceita (e dá a mensagem certa: "fechado", "lotado", "antecedência mínima"); depois o `UPDATE` condicional garante a vaga. A condição vive no `WHERE`, não numa leitura anterior — se lotar no meio, o update não casa e devolve zero linhas.
- **`capacity` é derivada; `used` e `reserved` são fatos.** `ensureDay` sempre atualiza a capacidade a partir de regra + exceção, e nunca toca os contadores. Sem essa distinção, mudar a regra semanal apagaria as reservas já feitas.
- **Devolver a vaga precisa saber de qual contador.** Encomenda `pending` estava em `reserved`; a partir de `confirmed` já virou `used`. Devolver do errado faria a agenda dizer que há vaga onde não há — e o lojista aceitaria uma encomenda que não consegue produzir.
- **Mudar a data reserva a nova antes de liberar a antiga.** Se a nova estiver lotada, a transação cai e a vaga original continua de pé. Liberar primeiro deixaria a encomenda sem vaga nenhuma quando a troca falhasse.
- **O board de encomendas ordena por DATA DE ENTREGA**, não por chegada como o delivery. O que vence amanhã vem antes do que foi pedido antes mas é para o mês que vem.
- **Expiração tem fila própria**, separada da do delivery: aqui ela também libera vaga na agenda, e separar deixa o log dizer qual dos dois fluxos está acumulando abandono.
- **Pagar o sinal inteiro marca a encomenda como paga.** É o que acontece com bolo pequeno, e exigir um segundo passo para dizer isso seria burocracia.

### Módulo 8 — vitrine (API)

- **A vitrine PROJETA, não repassa.** Cada resposta é montada campo a campo, nunca devolvendo o objeto do painel. É a única superfície da API sem autenticação, e um `select *` aqui vazaria custo e margem para o cliente final.
- **A taxa de entrega vem sempre do servidor.** Aceitar o frete que veio no corpo da requisição seria aceitar o frete que o cliente escolheu. Ela é recotada a partir do bairro, dentro da mesma transação que cria o pedido.
- **"A loja está aberta" é calculado no fuso da LOJA.** O relógio do cliente não serve — quem abre a vitrine viajando veria a padaria fechada no horário errado. E o do servidor também não: é o tipo de bug que não aparece em desenvolvimento e aparece quando a instância sobe em outra região. Tem teste ancorado em instantes UTC explícitos.
- **Pedido da vitrine nasce `pending`; do painel, `confirmed`.** Quem confirma o da vitrine é o lojista, e até lá a reserva segura o estoque e expira sozinha (D14).
- **`Infinity` vira `null` na fronteira JSON.** Produto sob demanda sem ficha técnica não tem limite conhecido; `Infinity` não sobrevive à serialização, e `null` é o mesmo significado no contrato.
- **Esgotado exige TODAS as variações zeradas.** Com uma disponível o produto continua comprável, só com menos opções — esconder o produto inteiro perderia venda.
- **Código errado e telefone errado dão a mesma resposta** no acompanhamento. Distinguir transformaria a rota num verificador de pedidos por número de telefone.
- **A agenda de encomendas ficou para o módulo 7**, que é o dono das tabelas de disponibilidade. O checkout de encomenda entra junto.

### Módulo 6 — kanban de delivery

- **Desfazer um pedido usa o LIVRO, não a receita atual.** Recalcular a explosão da ficha técnica no cancelamento parece equivalente, mas não é: se a receita mudou entre a reserva e o cancelamento, a devolução teria quantidade diferente da saída, e o saldo passaria a mentir sem nenhum erro. `releaseReservationBySource` e `restoreBySource` leem os movimentos daquele pedido — o livro registra o que de fato saiu.
- **Produto `on_demand` reserva os INSUMOS, não a variação.** Reservar a variação de um produto sob demanda não seguraria nada (ela não tem saldo), e dois clientes conseguiriam pedir o último bolo que a farinha permite. A explosão vem de `stockLinesForSale`, no módulo 4, que é o dono de `recipe_items`.
- **O pedido é travado antes de decidir a transição.** Dois atendentes clicando "confirmar" ao mesmo tempo leriam o mesmo `pending`, ambos passariam pela validação e ambos dariam baixa. O `FOR UPDATE` faz o segundo encontrar o pedido já confirmado, onde a máquina de estados o barra.
- **Pedido lançado no painel nasce confirmado — pela mesma porta.** Ele é criado `pending`, reserva, e a confirmação passa por `changeStatus`. Não existe um segundo caminho para dar baixa no estoque.
- **`tenant_counters` saiu da lista de tabelas de plataforma.** Ela é incrementada dentro da transação que cria o pedido, pela conexão da aplicação; tratá-la como tabela de plataforma revogava o acesso do papel `cantina_app` e teria quebrado **toda** criação de pedido em runtime. Tem `tenant_id`, então recebe RLS como qualquer outra.
- **Só pedido pendente expira.** A reserva de quem nunca confirmou não pode segurar estoque para sempre (D14); o job cancela pela porta normal, com motivo, para o histórico registrar o que houve.
- **Pedido concluído ou cancelado não pode ser editado.** Mexer nos valores depois reescreveria faturamento já contabilizado.

### Módulo 5 — clientes

- **Estatísticas recomputadas, não incrementadas.** Incremento acumula drift a cada cancelamento, reembolso ou correção de valor, e o número que o lojista vê passa a divergir do histórico sem ninguém notar. Um cliente de negócio pequeno tem dezenas de pedidos e a consulta é indexada — a correção garantida vale mais que a microtimização. Módulos 6 e 7 chamam `refreshStats` depois de qualquer mudança de status.
- **`v_orders_unified` ganhou declaração tipada no Drizzle**, com `.existing()`: o DDL continua em `sql/views.sql` porque `security_invoker` não é expressável no gerador — e sem ele a view rodaria com os privilégios do dono e furaria o RLS. `db:generate` confirma que nada novo é gerado.
- **O id serve de cursor mesmo na união de duas tabelas.** UUID v7 é ordenável no tempo (P4), então paginar o histórico sobre o `UNION ALL` não precisa de ordenação por data com desempate instável.
- **Anonimização troca o telefone por `anon:<id>`.** A coluna é `NOT NULL` com índice único: zerá-la quebraria a chave natural, e um valor fixo impediria anonimizar o segundo cliente. O `before` da auditoria não recebe os dados pessoais — gravá-los ali recriaria exatamente o que a anonimização veio apagar.
- **Conflito de telefone devolve o `customerId` existente.** Quem está atendendo quer ir para o cadastro que já existe, não receber um erro e procurar de novo.
- **`findOrCreate` mora aqui, não no módulo 8.** É a porta que o checkout da vitrine vai usar, e a regra de "atualiza o nome, nunca sobrescreve com vazio" pertence a quem é dono da tabela.
- **Cadastro e edição abertos a `staff`.** Quem atende corrige um telefone errado no meio do pedido; exigir `manager` para isso emperraria o balcão. Anonimizar exige `owner` — é irreversível.

### Módulo 4 — fichas técnicas e precificação

- **`hasUnknownCost` é resposta de primeira classe.** Insumo que nunca foi comprado tem custo médio zero, e o custo do produto sai **subestimado** — a margem exibida fica melhor que a real. Sem esse sinal, o simulador daria um número bonito e errado justamente na hora de decidir preço.
- **Produto `on_demand` não pode ser produzido.** A disponibilidade dele deriva dos insumos (D9), então o estoque de produto pronto que a produção criaria seria ignorado pela vitrine: o lojista veria o número subir e nada mudar na loja. A rota recusa e explica o que mudar.
- **Produto sem ficha técnica tem custo zero, não erro.** Refrigerante revendido legitimamente não tem receita, e o pedido precisa fechar do mesmo jeito. `computeUnitCost` devolve `hasRecipe: false` em vez de estourar.
- **Disponibilidade derivada é calculada em lote.** O cardápio pergunta por dezenas de variações de uma vez; a versão unitária existe, mas chama a de lote. A alternativa seria um N+1 na página mais acessada do sistema.
- **A resposta diz qual insumo está limitando.** "0 disponíveis" sem dizer o quê acabou obriga o lojista a conferir a receita inteira à mão.
- **Custo e margem exigem `manager` para LER.** Um atendente não precisa saber a margem de cada produto para tocar o balcão, e o dado circula menos quanto menos gente o vê. Produção, que é operação de cozinha, fica aberta a `staff`.
- **Dois routers no mesmo prefixo `/variants`.** Preço (módulo 2) e ficha técnica (módulo 4) penduram na variação, mas têm donos diferentes. Os caminhos não se sobrepõem, e há teste garantindo que nenhum sombreia o outro.
- **A quantidade da receita é guardada crua**, para o rendimento inteiro e sem perda aplicada. Normalizar no repositório espalharia a fórmula de custo por duas camadas; ela vive inteira em `@cantina/domain`.

### Módulo 3 — estoque e insumos

- **Uma porta só para mexer no saldo.** `applyMovements` é a única função que escreve em `stock_items`, e ela sempre grava o movimento correspondente. Reserva, baixa, devolução, ajuste, perda e compra passam por ali — inclusive quando os kanbans chegarem.
- **Travas adquiridas em ordem determinística.** Dois pedidos com os mesmos itens em ordens opostas travariam um o item do outro e o Postgres mataria uma das transações por deadlock. Ordenar por `kind:refId` elimina o ciclo; a função tem teste próprio porque esse modo de falhar só aparece sob concorrência.
- **A trava vem antes de ler o saldo, na compra.** A média ponderada depende do saldo anterior à entrada: ler sem travar deixa duas compras simultâneas calcularem a média como se cada uma fosse a única, e a segunda sobrescreve a primeira. O custo fica errado sem erro nenhum aparecer.
- **`usageUnit` do insumo não é editável.** Trocar grama por mililitro reinterpreta o histórico de compras, o custo médio e as receitas de uma vez — sem conversão possível, porque o número gravado não diz qual era a unidade quando foi gravado. O caminho é criar um insumo novo.
- **Perda é um tipo próprio, não um ajuste negativo.** "Quebrei 3 ovos" e "recontei e tinha menos" são causas diferentes, e o relatório de custos precisa distingui-las. Perda maior que o saldo é recusada; ajuste continua podendo negativar, porque ali o lojista está declarando que o saldo estava errado.
- **Insumo em ficha técnica não pode ser removido.** O `ON DELETE RESTRICT` da FK não dispara em soft delete, e apagar zeraria o custo daqueles produtos sem aviso — a margem passaria a mentir para cima.
- **`POST /stock/production` (D19) ficou para o módulo 4.** Produzir explode a receita, e `recipe_items` só ganha dono lá. Registrar a rota aqui deixaria a tabela com dois donos, que é o problema que o livro-razão existe para evitar.

### Módulo 2 — catálogo

- **P13 virou invariante do contrato, não convenção.** `createProduct` exige `variants` com no mínimo um item, e remover ou desativar a última variação ativa é recusado. Não existe caminho no código pelo qual preço, receita ou estoque precisem pendurar em dois lugares diferentes.
- **`products.image_url` é capa desnormalizada, recalculada — nunca editada.** O cardápio da vitrine lista dezenas de produtos e não pode fazer join com a galeria para achar a foto de cada um. A capa é sempre a primeira imagem por posição, atualizada a cada mudança na galeria.
- **Upload em duas chamadas** (assinar a URL, subir direto ao bucket, registrar a referência). Um upload interrompido no meio deixa, no pior caso, um arquivo não referenciado no bucket — nunca uma linha órfã no banco. A ordem inversa produziria o contrário.
- **Renomear um produto não regera o slug.** A vitrine é pública e indexável: o slug é endereço permanente, e trocá-lo quebra links já compartilhados. Só uma edição explícita do campo muda.
- **Remover uma categoria solta os produtos**, em vez de escondê-los junto. Sumir com o produto porque a categoria foi apagada é perda silenciosa de faturamento, e o lojista levaria dias para notar.
- **Exclusão no bucket é best-effort, fora da transação.** Se o storage estiver fora do ar, insistir faria o usuário perder a operação inteira por causa de um arquivo. Objeto órfão custa centavos.
- **O catálogo não escreve em `stock_items`.** O saldo de uma variação nasce no primeiro movimento, no módulo 3. Dois donos para o mesmo dado é como saldo divergente começa.
- **`/reorder` registrado antes de `/:id`.** Na ordem inversa, "reorder" seria lido como um id e morreria na validação de UUID em vez de chegar à rota.

### Módulo 1 — auth e tenant

- **Cookie de refresh no formato `<tenantId>.<token>`.** Não é detalhe de formato: carregar o tenant junto permite abrir o contexto de RLS **antes** de procurar o token. Sem ele, a busca por hash precisaria varrer a tabela com a conexão de plataforma — leitura de dado de tenant com BYPASSRLS num caminho chamado a cada 15 minutos por usuário logado. O `tenantId` no cookie não é credencial: adulterá-lo só faz o hash não bater.
- **Uma única exceção de BYPASSRLS no caminho de negócio**, documentada no código: o login sem `tenantSlug` precisa descobrir a empresa a partir do e-mail, que é único **por tenant** (D3). A consulta seleciona apenas `tenant_id` — nome, papel e hash de senha são lidos depois, já dentro de `withTenant`.
- **Rotação de refresh com detecção de reuso.** Token já rotacionado que reaparece derruba **todas** as sessões daquele usuário. Não dá para distinguir corrida de duas abas de token roubado; o custo do falso positivo é um relogin, o do falso negativo é uma sessão viva na mão de terceiro.
- **Guarda do último dono.** Sem ela, o único `owner` pode se rebaixar a `staff` e ninguém mais gerencia usuários nem faturamento — situação que só se resolve com SQL em produção.
- **Rótulos de status são merge, não substituição.** `GET /settings/status-labels` devolve sempre o conjunto completo: o banco guarda só as customizações, o resto vem do padrão de `@cantina/domain`. Assim o kanban nunca fica com coluna sem nome porque o lojista renomeou apenas duas.
- **`ZodType<T, ZodTypeDef, unknown>` no wrapper de rota.** A forma curta `ZodType<T>` liga `T` ao tipo de **entrada** do schema, e aí um campo com `.default()` chega ao handler como opcional mesmo depois do `parse`. Fixar a entrada em `unknown` obriga `T` a ser o tipo de saída.
- **Assinatura em atraso mantém a leitura.** `requireActiveTenant` só bloqueia escrita. Tirar o acesso aos próprios dados por atraso de pagamento é hostil e ainda dificulta o pagamento.

### Módulo 0 — fundação

- **Rota como unidade de trabalho.** `tenantRoute` abre a transação, executa o handler e só então responde. A `tx` existe apenas dentro do handler, o que torna a invariante 1 mecânica em vez de disciplinar — não há caminho para tocar o banco sem contexto de tenant.
- **Middleware de painel aplicado no mount, não na raiz.** Um `use(requireAuth)` na raiz fazia toda rota inexistente responder 401 em vez de 404, e sombrearia qualquer rota pública registrada depois. `mountPanelModule` aplica auth num lugar só, sem esse efeito.
- **Lista de tabelas do RLS derivada do schema.** Uma lista manual esquecida é exatamente como um vazamento entre empresas nasce. `db:rls` inspeciona o schema, aplica a política em toda tabela com `tenant_id` e avisa sobre tabela sem `tenant_id` que não esteja declarada como de plataforma.
- **`current_setting('app.tenant_id', true)` devolve NULL quando não definido**, e NULL na comparação zera o resultado. Esquecer de abrir o contexto não expõe nada — apenas não retorna nada. É o modo de falhar que se quer.
- **pg-boss em vez de BullMQ** (P8): além de dispensar Redis, permite enfileirar na mesma transação que grava o pedido, o que elimina a classe de bug "job disparou antes do commit".
- **`@node-rs/argon2` em vez de `argon2`**: binário pré-compilado, sem toolchain de C++ na máquina de quem clona o repo nem na imagem de build.
