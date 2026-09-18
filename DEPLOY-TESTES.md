# Plano de ação — subir uma versão de testes na web

Objetivo: ter a Cantina rodando num endereço público, com um banco real — o painel para o
lojista e a vitrine para o cliente.

**O que dá para testar hoje:** o ciclo completo, com tela. O lojista entra no painel,
cadastra produto, registra compra de insumo, monta a ficha técnica e opera o kanban; o
cliente abre a vitrine no celular, monta o pedido e envia — e ele cai no kanban reservando
estoque de verdade.

Faltam encomendas (módulo 7), financeiro (módulos 9-10) e a cobrança da assinatura
(módulo 11). A lista completa está na seção "O que dá para testar hoje, e o que não".

---

## Panorama

| | |
|---|---|
| **Tempo** | ~1 hora na primeira vez |
| **Custo** | R$ 0/mês no início (camadas gratuitas), ~R$ 60/mês quando sair do free |
| **Pré-requisitos na sua máquina** | Node 22+, git, uma conta no GitHub |
| **Não precisa** | Docker (você não tem instalado, e este caminho não usa) |

**Arquitetura do staging**

```
   lojista                          cliente
   SEUDOMINIO.com/painel            padaria.SEUDOMINIO.com
            │                              │
            └──────────────┬───────────────┘
                           ▼
              Next.js (Vercel ou container)
                           │
                           ▼
              api.SEUDOMINIO.com   ← container (Railway ou Render)
                           │
                           ▼
              Postgres gerenciado (Neon)
              papéis cantina_app / cantina_platform
```

O passo 6 (domínio + Vercel) deixa de ser opcional se você quer mostrar a vitrine: é o
subdomínio que identifica a loja (D2).

---

## Passo 0 — Decisões (5 min)

Três escolhas, com o que eu recomendaria:

| Decisão | Recomendo | Por quê |
|---|---|---|
| Banco | **Neon** | Free tier generoso, `BYPASSRLS` disponível, backup automático. Supabase serve igual |
| API | **Railway** | Deploy por Dockerfile sem configuração, variáveis de ambiente na UI, domínio grátis |
| Domínio | **Um seu, ~R$ 40/ano** | O subdomínio é o que identifica a loja (D2). Sem ele a vitrine não tem endereço |

Sem domínio próprio dá para testar a API e o painel (Railway e Vercel dão endereços
grátis), mas não a vitrine — ela depende do subdomínio por loja.

---

## Passo 1 — Repositório no GitHub (5 min)

O deploy dos dois serviços parte de um repositório. O projeto ainda não é um repo git.

```bash
cd D:\Projetos\Cantina
git init
git add .
git commit -m "Cantina: painel e vitrine"
```

Crie um repositório **privado** no GitHub e:

```bash
git remote add origin https://github.com/SEU-USUARIO/cantina.git
git branch -M main
git push -u origin main
```

> O `.gitignore` já exclui `.env`. Confirme com `git status` que ele **não** aparece na
> lista antes do primeiro push — é onde moram os segredos.

---

## Passo 2 — Banco Postgres gerenciado (10 min)

1. Crie uma conta em **neon.tech** e um projeto (`cantina-staging`), região `São Paulo` ou
   `us-east`. Postgres 16 ou 17.
2. Copie a **connection string** que ele mostra. Ela é do usuário dono — será a sua
   `DATABASE_ADMIN_URL`.
3. Ainda não crie usuários pela UI: o `db:setup` faz isso.

Localmente, aponte o `.env` para o banco novo e prepare o schema:

```bash
# .env (na raiz do projeto)
DATABASE_ADMIN_URL=postgresql://OWNER:SENHA@ep-xxx.neon.tech/cantina?sslmode=require
DATABASE_URL=postgresql://cantina_app:TROQUE-ESTA-SENHA@ep-xxx.neon.tech/cantina?sslmode=require
```

Antes de rodar, **troque a senha de desenvolvimento** dos papéis:
`packages/db/sql/roles.sql` cria `cantina_app` e `cantina_platform` com a senha `cantina`.
Edite as duas linhas `PASSWORD 'cantina'` para uma senha forte e use a mesma na
`DATABASE_URL`.

```bash
npm install
npm run db:setup     # papéis → migrations → políticas de RLS
npm run db:seed      # empresa de exemplo "Padaria do Zé"
```

**Verificação obrigatória** — é a prova da decisão mais consequente do projeto:

```bash
npm run verify:rls
```

Tem que imprimir as quatro verificações em `ok` e terminar com *"Isolamento por RLS
verificado"*. Se qualquer uma falhar, **pare aqui**: sem isso, uma empresa enxerga dados de
outra, e nenhum outro problema importa mais que esse.

---

## Passo 3 — Segredos (5 min)

Gere segredos reais para os tokens (os do `.env.example` são placeholders):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Rode duas vezes: um valor para `JWT_ACCESS_SECRET`, outro para `JWT_REFRESH_SECRET`.
Guarde os dois — você vai colar no Railway no passo 4.

### Cobrança (Asaas)

A API **não sobe em produção** sem `ASAAS_API_KEY`. É deliberado: sem gateway ela usaria o
adaptador local, que ativa assinaturas sem cobrar nada — dar o produto de graça em silêncio
é o pior modo de falhar de um SaaS.

1. Crie uma conta no **sandbox do Asaas** (`sandbox.asaas.com`) — é grátis e não movimenta
   dinheiro de verdade.
2. Em **Integrações → API**, copie a chave para `ASAAS_API_KEY`. Mantenha
   `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3` enquanto estiver testando.
3. Em **Integrações → Webhooks**, cadastre `https://SUA-API/api/v1/webhooks/asaas`, com um
   token que você inventa. **O mesmo token vai em `ASAAS_WEBHOOK_TOKEN`** — ele é a única
   autenticação daquela rota, e sem ele o webhook recusa tudo.
4. Marque os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
   `PAYMENT_REFUNDED` e `SUBSCRIPTION_DELETED`. O resto é registrado e ignorado.

> Só quer ver o produto rodando, sem cobrança? Suba a API com `NODE_ENV=development`. Ela
> aceita a ausência da chave, avisa no log e ativa as assinaturas localmente. Não faça isso
> num ambiente que vai receber cliente: fora de produção o rate limit também fica desligado.

---

## Passo 4 — Deploy da API (15 min)

1. Em **railway.app**, `New Project` → `Deploy from GitHub repo` → escolha o repositório.
2. Em **Settings → Build**, aponte o Dockerfile: `apps/api/Dockerfile`, com contexto na
   raiz do repositório (`.`).
3. Em **Variables**, cole:

```
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3333
API_URL=https://api.SEUDOMINIO.com
WEB_URL=https://SEUDOMINIO.com
ROOT_DOMAIN=SEUDOMINIO.com

DATABASE_URL=postgresql://cantina_app:SENHA@ep-xxx.neon.tech/cantina?sslmode=require
DATABASE_ADMIN_URL=postgresql://OWNER:SENHA@ep-xxx.neon.tech/cantina?sslmode=require
DATABASE_POOL_MAX=10

JWT_ACCESS_SECRET=<o que você gerou>
JWT_REFRESH_SECRET=<o outro>
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
```

4. Em **Settings → Networking**, gere um domínio (`Generate Domain`) e aponte a porta 3333.
5. Espere o build. Quando terminar:

```bash
curl https://SEU-APP.up.railway.app/api/v1/health
# {"status":"ok",...}

curl https://SEU-APP.up.railway.app/api/v1/health/ready
# {"status":"ready","checks":{"database":true}}
```

`ready` com `database: false` significa que a `DATABASE_URL` está errada ou o Neon está
bloqueando a conexão — confira o `?sslmode=require`.

---

## Passo 5 — A verificação que importa (5 min)

Aqui é onde você descobre se o sistema realmente funciona:

```bash
SMOKE_API_URL=https://SEU-APP.up.railway.app/api/v1 npm run smoke
```

O script percorre o caminho inteiro da API e confere os números — não só os status HTTP:

| O que ele exercita | Resultado esperado |
|---|---|
| Login e sessão | token válido, `/auth/me` reconhece |
| Compra de 5 kg de farinha por R$ 50 | custo médio de **1 centavo por grama** |
| Ficha técnica: 30 g com 5% de perda | custo do produto = **32 centavos** |
| Disponibilidade derivada da receita | **158 unidades** (5000 g ÷ 31,5 g) |
| Margem no iFood a 23% sobre R$ 7,00 | **507 centavos** de margem |
| Pedido de 2 unidades → confirmação | farinha cai de 5000 para **4937 g** |
| Fluxo do kanban até `completed` | três transições aceitas |
| Cancelamento de outro pedido | estoque **devolvido** ao valor anterior |
| Status terminal voltando atrás | recusado com **409** |
| Remover insumo usado em receita | recusado com **409** |
| Produzir produto sob demanda | recusado com **409** |

Termina com `N verificações passaram, 0 falharam`. Qualquer falha aponta exatamente qual
regra quebrou.

> Ele escreve no banco (com sufixo de timestamp, então pode repetir). Não rode contra
> produção.

---

## Passo 6 — Domínio, painel e vitrine (15 min)

É aqui que a interface entra no ar: o painel no domínio raiz, a vitrine de cada loja num
subdomínio.

No seu registrador (Registro.br, Cloudflare, Namecheap):

| Tipo | Nome | Valor |
|---|---|---|
| CNAME | `api` | o domínio do Railway |
| CNAME | `*` | o domínio da Vercel (curinga, para `padaria.seudominio.com`) |
| CNAME | `@` ou `www` | o domínio da Vercel |

Depois, deploy do `apps/web` na Vercel:

1. `Add New → Project` → o mesmo repositório.
2. **Root Directory**: `apps/web`.
3. **Variables**: `NEXT_PUBLIC_ROOT_DOMAIN=SEUDOMINIO.com` e
   `NEXT_PUBLIC_API_URL=https://api.SEUDOMINIO.com`.
4. Em **Domains**, adicione `SEUDOMINIO.com` e `*.SEUDOMINIO.com`.

Aponte também o `ROOT_DOMAIN` da API para o mesmo domínio e faça redeploy — é ele que
libera o CORS para os subdomínios.

Para a vitrine da empresa de exemplo responder, cadastre o hostname:

```sql
-- no console do Neon, com o usuário dono
INSERT INTO tenant_domains (id, tenant_id, hostname, type, is_primary, verified_at,
                            created_at, updated_at)
SELECT gen_random_uuid(), id, 'padaria-do-ze.SEUDOMINIO.com', 'subdomain', true,
       now(), now(), now()
FROM tenants WHERE slug = 'padaria-do-ze';
```

---

## Passo 7 — Antes de mostrar para alguém

Checklist curto, tudo com consequência real:

- [ ] **Senhas dos papéis trocadas** — `roles.sql` vem com `cantina` de desenvolvimento
- [ ] **`JWT_*_SECRET` gerados por você**, não os do `.env.example`
- [ ] **`verify:rls` passando** contra o banco de staging, não só o local
- [ ] **Repositório privado** e `.env` fora dele
- [ ] **Senha do seed trocada** — `ze@padaria.test` / `cantina123` está no README e no git
- [ ] **Senha do admin da plataforma trocada** — `admin@cantina.test` / `cantina123` também
      está no git, e essa sessão enxerga TODOS os assinantes
- [ ] **`ASAAS_API_KEY` definida** — sem ela a API **se recusa a subir** em produção, de
      propósito: o adaptador local ativaria assinaturas sem cobrar
- [ ] **`ASAAS_WEBHOOK_TOKEN` definido e igual ao cadastrado no Asaas** — é a única
      autenticação da rota `/webhooks/asaas`; sem ele o webhook recusa tudo
- [ ] **`NODE_ENV=production`** na API: sem isso o rate limit fica desligado (ele pula em
      desenvolvimento de propósito) e mensagens de erro interno vazam para o cliente
- [ ] **Backup do Neon ativo** (é o padrão, só confirme)

---

## O que dá para testar hoje, e o que não

**Funciona de ponta a ponta, com interface**

- Isolamento entre empresas por RLS, com prova executável
- Login, refresh com rotação, papéis, convites por e-mail
- Catálogo com variações, categorias e pausa na vitrine
- Estoque com livro-razão, ajuste, perda, reserva e baixa
- Compras com custo médio ponderado
- Fichas técnicas, custo real, margem por canal, simulador de preço
- Produção (insumo → produto pronto)
- Clientes, endereços, histórico unificado, anonimização LGPD
- Kanban de delivery completo, com expiração automática de reserva
- Encomendas com agenda, capacidade por dia e reserva atômica de vaga
- Financeiro com fluxo de caixa projetado, e relatórios de faturamento, margem e custos
- **Vitrine pública**: cardápio, carrinho, checkout, envio por WhatsApp e acompanhamento
- **Painel completo**: produtos, estoque, fichas técnicas, clientes, pedidos, encomendas,
  calendário, financeiro, relatórios e assinatura
- **Administração da plataforma** em `/admin`: empresas, planos, assinaturas e métricas

**Ainda não existe** (e por quê)

| Falta | Módulo | Impacto no teste |
|---|---|---|
| Notificações (estoque baixo, lembrete de encomenda) | 14 | Os alertas existem em tela, mas nada é disparado |
| Upload de imagem | — | Precisa de R2/S3 configurado; sem isso responde 503 com a causa |
| E-mail de convite | — | Sem `RESEND_API_KEY`, o link aparece no log da API |
| Cobrança real | — | Sem `ASAAS_API_KEY` (fora de produção), a assinatura é ativada localmente, sem cobrar |

---

## O roteiro de demonstração

Com o passo 6 (domínio) feito, dá para mostrar o produto inteiro em cinco minutos:

1. **Painel** → cadastre um insumo e registre a compra. Repare no custo por grama aparecendo
   enquanto você digita.
2. **Painel** → crie um produto e monte a ficha técnica. A tela mostra o custo real e a
   margem, com a quebra por insumo.
3. **Painel → Fichas → Simulador** → compare a margem no balcão e no iFood.
4. **Celular** → abra `padaria-do-ze.SEUDOMINIO.com`, monte um pedido e envie.
5. **Painel → Pedidos** → o pedido está lá. Confirme e volte ao estoque: o insumo baixou.

---

## Resolvendo problemas

| Sintoma | Causa provável |
|---|---|
| `/health/ready` com `database: false` | `DATABASE_URL` errada ou falta `?sslmode=require` |
| Login devolve 401 com a senha certa | Seed não rodou, ou rodou em outro banco |
| Toda consulta volta vazia | Contexto de tenant não abriu — rode `verify:rls` |
| `permission denied for table ...` | `db:rls` não rodou depois da última migration |
| CORS bloqueado no browser | `ROOT_DOMAIN` da API não bate com o domínio do front |
| Deploy sobe e morre em seguida | Variável de ambiente faltando — a API valida tudo no boot e loga qual |
| Smoke falha no custo médio | Banco não está limpo; use um banco só para testes |

Toda resposta de erro traz um `requestId`, e ele aparece no log da API — é por ele que você
acha o que aconteceu.
