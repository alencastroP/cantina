# TODO — subir a Cantina em produção

Checklist do que falta para a Cantina receber **cliente pagante de verdade**, não só um
ambiente de testes na web.

Para o staging (endereço público, banco real, Asaas em sandbox), o roteiro passo a passo é
[DEPLOY-TESTES.md](DEPLOY-TESTES.md). Este arquivo é a diferença entre *aquilo* e produção:
o que quebra, vaza ou cobra errado quando existe um lojista de verdade do outro lado.

**Estado hoje:** `npm run typecheck` e `npm run test` passam (5/5 e 3/3). Os Dockerfiles da
API e da web estão prontos, rodam como usuário sem privilégio e têm healthcheck. O que falta
está abaixo.

---

## Bloqueadores — sem isto não sobe

Cada item aqui tem consequência imediata: ou impede o boot, ou entrega o produto de graça,
ou expõe dado de cliente.

### 1. Credenciais e segredos

- [ ] **Trocar a senha dos papéis de banco.**
      [packages/db/sql/roles.sql:19-23](packages/db/sql/roles.sql#L19-L23) cria `cantina_app`
      e `cantina_platform` com `PASSWORD 'cantina'`. Esse arquivo vai para o git. Em produção,
      crie os papéis pelo provedor com senha forte e guarde no gerenciador de segredos.
      `cantina_platform` tem **BYPASSRLS** — quem tem essa senha enxerga todos os tenants.
- [ ] **Gerar `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` próprios.** O schema exige 32+
      caracteres ([apps/api/src/config/env.ts:24-25](apps/api/src/config/env.ts#L24-L25)),
      mas não impede que seja o placeholder do `.env.example`.
      `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`, duas vezes.
- [ ] **Não rodar `db:seed` em produção.** Ele cria `ze@padaria.test` / `cantina123` e
      `admin@cantina.test` / `cantina123` — ambas as senhas estão no README, logo no git.
      A segunda é a sessão de `/admin`, que enxerga **todos os assinantes**.
- [ ] **Criar o primeiro usuário de plataforma por caminho manual**, com senha gerada, já que
      o seed está fora.
- [ ] **Confirmar que `.env` ficou fora do repositório.** O `.gitignore` já cobre (`.env` e
      `.env.*`, com `!.env.example`). Verifique com `git status` antes de qualquer push.

### 2. Cobrança real (Asaas)

Hoje o `.env.example` aponta para o **sandbox**. Sandbox não cobra ninguém.

- [ ] **`ASAAS_API_KEY` da conta de produção.** Sem ela a API **se recusa a subir** com
      `NODE_ENV=production` — [apps/api/src/integrations/billing.ts:116](apps/api/src/integrations/billing.ts#L116).
      É deliberado: o adaptador local ativaria assinaturas sem cobrar nada.
- [ ] **`ASAAS_BASE_URL=https://api.asaas.com/v3`** (o default do schema é o sandbox —
      [env.ts:30](apps/api/src/config/env.ts#L30)). Esquecer isto é rodar produção contra
      sandbox: todo mundo assina, ninguém paga.
- [ ] **`ASAAS_WEBHOOK_TOKEN` definido e idêntico ao cadastrado no Asaas.** É a única
      autenticação de `/api/v1/webhooks/asaas`. Errado, o webhook recusa tudo, e nenhum
      pagamento confirmado chega — assinante paga e continua bloqueado.
- [ ] **Webhook apontando para a URL de produção**, com os eventos `PAYMENT_CONFIRMED`,
      `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_DELETED`.
- [ ] **Conta Asaas com dados fiscais completos** (CNPJ, conta de recebimento, nota fiscal).
      Isto é burocracia de dias, não de minutos — comece cedo.
- [ ] **Testar um ciclo de cobrança real** de ponta a ponta antes de abrir para o público:
      assinatura → pagamento → webhook → liberação de acesso.

### 3. `NODE_ENV=production` na API

- [ ] Sem isto, o **rate limit fica desligado** — ele pula fora de produção de propósito
      ([rate-limit.ts:22](apps/api/src/http/middlewares/rate-limit.ts#L22)) — e mensagens de
      erro interno vazam para o cliente. Também é o que aciona a exigência do Asaas acima.

### 4. Banco de dados

- [ ] **Postgres gerenciado** (Neon, Supabase, RDS) com `BYPASSRLS` disponível para
      `cantina_platform`.
- [ ] **`npm run db:setup`** contra o banco de produção — papéis, migrations e políticas de RLS.
- [ ] **`npm run verify:rls` passando contra o banco de produção.** É a prova do isolamento
      multi-tenant, a decisão mais consequente do projeto. As quatro verificações têm que
      voltar `ok`. Se qualquer uma falhar, **pare**: uma empresa enxerga dados de outra e
      nenhum outro problema importa mais.
- [ ] **Backup automático + PITR ativo**, e **um restore testado**. Backup que nunca foi
      restaurado é hipótese, não backup.
- [ ] **Migrations como passo separado do deploy**, com a conexão administrativa. A API não
      roda migration no boot, de propósito — está anotado no
      [Dockerfile da API](apps/api/Dockerfile). Decida quem roda: passo manual, job de deploy
      ou release command da plataforma.
- [ ] **Nunca rodar `npm run smoke` contra produção** — ele escreve no banco.

### 5. Domínio, DNS e TLS

A vitrine é identificada por subdomínio (D2), então DNS não é detalhe cosmético.

- [ ] **Domínio de produção registrado.**
- [ ] **CNAME curinga (`*`)** apontando para o front — é o que faz `padaria.seudominio.com`
      existir.
- [ ] **Certificado TLS curinga** cobrindo `*.seudominio.com`.
- [ ] **`ROOT_DOMAIN` da API igual ao domínio real** — é ele que libera o CORS para os
      subdomínios. Divergência = browser bloqueia tudo.
- [ ] **`NEXT_PUBLIC_ROOT_DOMAIN` e `NEXT_PUBLIC_API_URL`** configurados no front.

---

## Importantes — não impedem o boot, mas o produto fica capenga

### 6. Módulo 14 — notificações e jobs

O único módulo do [PLAN.md](PLAN.md) que ainda não foi feito. O schema já existe
(tabela `notifications` em [packages/db/src/schema/settings.ts:153](packages/db/src/schema/settings.ts#L153)),
as filas estão declaradas, mas duas não têm worker registrado:

- [ ] **`stock.scan-low-stock`** — varre insumos abaixo do mínimo e gera notificação.
      Declarada em [jobs/index.ts:30](apps/api/src/jobs/index.ts#L30), sem consumidor.
- [ ] **`preorder.remind-due`** — lembra o lojista das encomendas do dia seguinte.
      Declarada em [jobs/index.ts:32](apps/api/src/jobs/index.ts#L32), sem consumidor.
- [ ] **Descomentar o router de notificações** —
      [apps/api/src/http/router.ts:139](apps/api/src/http/router.ts#L139).

Já funcionam: expiração de reserva (delivery e encomenda), recorrências financeiras e
dunning de assinatura.

> Impacto se ficar de fora: os alertas aparecem em tela, mas nada é disparado. O lojista
> descobre que a farinha acabou quando o pedido falha.

### 7. Integrações ainda vazias

- [ ] **Storage S3/R2** (`STORAGE_*`). Sem credenciais, o upload de imagem responde **503**
      — [integrations/storage.ts:127](apps/api/src/integrations/storage.ts#L127). Catálogo
      sem foto de produto é venda perdida numa vitrine de comida.
- [ ] **`RESEND_API_KEY` + domínio verificado** (SPF/DKIM). Sem isto o **convite de usuário
      só aparece no log da API** — o lojista não consegue chamar um funcionário.
- [ ] **`MAIL_FROM` com domínio próprio**, não o placeholder `cantina.app`.

### 8. CI e processo de deploy

- [ ] **Não existe `.github/workflows`.** Nada roda `typecheck` e `test` antes do deploy hoje.
      Um workflow mínimo (typecheck + test + build) já elimina a classe inteira de "quebrou em
      produção o que o TypeScript pegaria".
- [ ] **Deploy com rollback definido.** Saber o comando antes de precisar dele.
- [ ] **Ambiente de staging separado do de produção**, com banco próprio.

### 9. Observabilidade

- [ ] **Não há error tracking.** Só `pino` escrevendo log. Toda resposta de erro já carrega um
      `requestId` que aparece no log — mas alguém precisa estar olhando. Plugue um Sentry (ou
      equivalente) na API e no front.
- [ ] **Alerta de `/api/v1/health/ready` caindo.** O endpoint existe e checa o banco; falta
      alguém ser avisado quando ele falha.
- [ ] **Log retido em algum lugar consultável** — o log do container morre com o container.

### 10. Rate limit com mais de uma instância

- [ ] O `express-rate-limit` está com o **store em memória** (o default —
      [rate-limit.ts](apps/api/src/http/middlewares/rate-limit.ts)). Com 2+ instâncias da API,
      cada uma conta separado e o limite de login (10 tentativas / 15 min) vira 10 × nº de
      instâncias. Enquanto for **uma** instância, está correto. Antes de escalar
      horizontalmente, troque por um store compartilhado.

---

## Antes de abrir para o público

### 11. Jurídico e LGPD

- [ ] **Termos de uso** e **política de privacidade** publicados e aceitos no cadastro.
- [ ] **Contrato de assinatura** com regra de cancelamento e reembolso.
- [ ] A anonimização LGPD já está implementada (D24: `customers.anonymized_at` limpa o dado
      pessoal e preserva o pedido via snapshots). Falta **expor o pedido de exclusão** para o
      titular e definir quem responde.
- [ ] **Canal de contato do controlador** — exigência da LGPD.

### 12. Operação

- [ ] **Onboarding do primeiro lojista** — quem faz, e o que acontece se travar.
- [ ] **Canal de suporte** com alguém de plantão nos primeiros dias.
- [ ] **Um responsável por olhar o log e a fila de jobs** na primeira semana.

---

## Ordem sugerida

| Fase | O que |
|---|---|
| 1 | Segredos e papéis de banco (§1) — nada mais importa antes disto |
| 2 | Banco de produção + `verify:rls` + backup testado (§4) |
| 3 | Domínio, DNS curinga e TLS (§5) |
| 4 | Asaas de produção e um ciclo de cobrança real (§2, §3) |
| 5 | Storage e Resend (§7) — o produto deixa de ser capenga |
| 6 | Módulo 14 (§6) |
| 7 | CI, observabilidade e alerta (§8, §9) |
| 8 | Jurídico e operação (§11, §12) |

As fases 1 a 4 são sequenciais de verdade — cada uma depende da anterior. Da 5 em diante dá
para paralelizar.

---

## Verificação final, no dia

```bash
npm run verify:rls    # contra o banco de produção — as 4 têm que voltar ok
curl https://api.SEUDOMINIO.com/api/v1/health/ready
# {"status":"ready","checks":{"database":true}}
```

E então, à mão, no ambiente real: criar uma empresa, assinar, receber a cobrança, cadastrar
produto, receber um pedido pela vitrine e conferir se o estoque baixou. É o mesmo roteiro de
demonstração do [DEPLOY-TESTES.md](DEPLOY-TESTES.md), só que valendo.
