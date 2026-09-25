import { tenantDomains, tenants, trialSignupAttempts, users, type Executor } from '@cantina/db';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Cadastro público do teste grátis (SIGNUP-TESTE-GRATIS.md).
 *
 * Toda função aqui roda na conexão de PLATAFORMA (BYPASSRLS): não existe
 * tenant no contexto até a empresa nascer, e a checagem de e-mail/CPF
 * duplicado precisa enxergar todas as empresas de uma vez.
 */

export async function isSlugTaken(tx: Executor, slug: string): Promise<boolean> {
  const [row] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return Boolean(row);
}

/**
 * E-mail do dono de uma conta que já usa este e-mail ou este CPF.
 *
 * Só serve para decidir a quem avisar (§3.4) — nunca para recusar o
 * cadastro: recusar de forma visível é o que transformaria esta rota num
 * verificador de quem já é cliente.
 */
export async function findExistingOwnerEmail(
  tx: Executor,
  input: { email: string; document: string },
): Promise<string | null> {
  const [byEmail] = await tx
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
    .limit(1);
  if (byEmail) return byEmail.email;

  const [byDocument] = await tx
    .select({ email: users.email })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(
      and(
        eq(tenants.document, input.document),
        eq(users.role, 'owner'),
        isNull(users.deletedAt),
        isNull(tenants.deletedAt),
      ),
    )
    .limit(1);

  return byDocument?.email ?? null;
}

export interface NewTrialTenant {
  id: string;
  slug: string;
  name: string;
}

export async function insertTrialTenant(
  tx: Executor,
  input: { slug: string; name: string; document: string },
): Promise<NewTrialTenant> {
  const rows = await tx
    .insert(tenants)
    .values({
      slug: input.slug,
      name: input.name,
      document: input.document,
      // `status`/`trialEndsAt` ficam no padrão até o pagamento confirmar —
      // ver `pendingConfirmationAt` e `releasePendingSignup` (signup.service).
      pendingConfirmationAt: new Date(),
    })
    .returning({ id: tenants.id, slug: tenants.slug, name: tenants.name });

  const created = rows[0];
  if (!created) throw new Error('Falha ao criar a empresa do teste grátis.');
  return created;
}

export async function insertPrimaryDomain(
  tx: Executor,
  input: { tenantId: string; hostname: string },
): Promise<void> {
  await tx.insert(tenantDomains).values({
    tenantId: input.tenantId,
    hostname: input.hostname,
    type: 'subdomain',
    isPrimary: true,
    verifiedAt: new Date(),
  });
}

/* -------------------------------------------------------------------------- */
/* Idempotência (invariante 6)                                                 */
/*                                                                              */
/* Esta é a PRIMEIRA rota sem registro próprio de idempotência (ver o          */
/* comentário em `http/middlewares/idempotency.ts`) — daí a tabela dedicada.   */
/* -------------------------------------------------------------------------- */

/** Reserva a chave. `null` quando ela já existe (tentativa repetida). */
export async function reserveAttempt(
  tx: Executor,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  const rows = await tx
    .insert(trialSignupAttempts)
    .values({ idempotencyKey })
    .onConflictDoNothing({ target: trialSignupAttempts.idempotencyKey })
    .returning({ id: trialSignupAttempts.id });

  return rows[0] ?? null;
}

export async function findAttemptCheckoutUrl(
  tx: Executor,
  idempotencyKey: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ checkoutUrl: trialSignupAttempts.checkoutUrl })
    .from(trialSignupAttempts)
    .where(eq(trialSignupAttempts.idempotencyKey, idempotencyKey))
    .limit(1);

  return row?.checkoutUrl ?? null;
}

export async function completeAttempt(
  tx: Executor,
  id: string,
  input: { tenantId: string; checkoutUrl: string },
): Promise<void> {
  await tx
    .update(trialSignupAttempts)
    .set({ tenantId: input.tenantId, checkoutUrl: input.checkoutUrl })
    .where(eq(trialSignupAttempts.id, id));
}
