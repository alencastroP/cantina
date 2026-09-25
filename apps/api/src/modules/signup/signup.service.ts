import type { TrialSignupRequest } from '@cantina/contracts';
import { tenants, users, type Transaction } from '@cantina/db';
import { maskedCpfTail } from '@cantina/domain';
import { and, eq, isNull } from 'drizzle-orm';

import { env } from '../../config/env';
import { AppError, badRequest, conflict } from '../../http/errors/app-error';
import { billingProvider } from '../../integrations/billing';
import { mailProvider } from '../../integrations/mail';
import { recordAudit } from '../../shared/audit';
import { logger } from '../../shared/logger';
import { generateOpaqueToken, hashToken } from '../../shared/tokens';
import * as platformRepository from '../platform/platform.repository';
import { createInvite, createInvitedUser } from '../users/users.repository';
import * as repository from './signup.repository';

/**
 * Cadastro público do teste grátis (SIGNUP-TESTE-GRATIS.md).
 *
 * Roda inteiro em UMA transação de plataforma (`platformRoute`, `anonymous:
 * true`): se a chamada ao gateway falhar, o erro lançado aqui derruba junto
 * o tenant, o usuário e o domínio já inseridos — "ou tudo, ou nada" (§4) sai
 * de graça do wrapper de rota, não precisa de compensação escrita à mão.
 */

/**
 * Duração do teste grátis, em dias.
 *
 * Espelha `TRIAL_DAYS` em `apps/web/src/components/landing/config.ts`. Os
 * dois arquivos não se enxergam (apps diferentes, sem pacote compartilhado
 * para uma constante só) — mudar o valor comercial exige lembrar dos dois.
 */
export const TRIAL_DAYS = 15;

const MIN_FORM_TIME_MS = 2500;

/**
 * Filtro do robô preguiçoso (§"Sinais anti-robô" do contrato). Fraco de
 * propósito — a defesa de verdade é o limite por IP e a confirmação de
 * pagamento. Mensagem genérica: não ensina o robô a ajustar isca nem tempo.
 *
 * Exportado para o teste.
 */
export function assertNotBot(antiAbuse: TrialSignupRequest['antiAbuse']): void {
  if (antiAbuse.website.length > 0 || antiAbuse.elapsedMs < MIN_FORM_TIME_MS) {
    throw badRequest('Não foi possível concluir o cadastro agora. Tente novamente.');
  }
}

function billingUnavailable(cause?: unknown): AppError {
  return new AppError(
    502,
    'billing_unavailable',
    'Não foi possível iniciar seu teste agora. Tente novamente em instantes.',
    { expected: true, cause },
  );
}

/** E.164 (`+55...`) de volta para o formato local que o Asaas espera. */
function toLocalPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return digits.startsWith('55') ? digits.slice(2) : digits;
}

/** Avisa quem já tem conta, sem NUNCA recusar o cadastro por causa disso (§3.4). */
async function notifyExistingOwnerIfAny(
  tx: Transaction,
  input: { email: string; document: string },
): Promise<void> {
  try {
    const existingEmail = await repository.findExistingOwnerEmail(tx, input);
    if (!existingEmail) return;

    logger.warn(
      { documentTail: maskedCpfTail(input.document) },
      'Cadastro de teste grátis com e-mail ou CPF já usados por outra conta',
    );

    await mailProvider.send({
      to: existingEmail,
      subject: 'Alguém tentou se cadastrar no Cantina com seus dados',
      text:
        'Alguém usou seu e-mail ou CPF para abrir um novo teste grátis no Cantina. ' +
        'Se foi você, pode ignorar — nada muda na sua conta. Se não foi você, acesse ' +
        `${env.WEB_URL}/entrar e use "esqueci minha senha" para proteger sua conta.`,
      html:
        '<p>Alguém usou seu e-mail ou CPF para abrir um novo teste grátis no Cantina.</p>' +
        '<p>Se foi você, pode ignorar — nada muda na sua conta.</p>' +
        `<p>Se não foi você, acesse <a href="${env.WEB_URL}/entrar">${env.WEB_URL}/entrar</a> e use "esqueci minha senha" para proteger sua conta.</p>`,
    });
  } catch (error) {
    // Aviso é cortesia, não parte do contrato: uma falha aqui não pode
    // impedir o cadastro de quem está fazendo a coisa certa.
    logger.error({ err: error }, 'Falha ao enviar aviso de possível duplicidade de cadastro');
  }
}

export async function startTrial(
  tx: Transaction,
  input: TrialSignupRequest,
  idempotencyKey: string,
): Promise<{ checkoutUrl: string }> {
  assertNotBot(input.antiAbuse);

  const reserved = await repository.reserveAttempt(tx, idempotencyKey);
  if (!reserved) {
    // Só existe linha COMMITADA com esta chave se a tentativa anterior
    // chegou ao fim com sucesso — uma que falhou faz ROLLBACK e a leva
    // junto (ver o comentário no topo do arquivo).
    const checkoutUrl = await repository.findAttemptCheckoutUrl(tx, idempotencyKey);
    if (checkoutUrl) return { checkoutUrl };
    throw conflict('Cadastro em processamento. Tente novamente em instantes.');
  }

  if (await repository.isSlugTaken(tx, input.slug)) {
    throw new AppError(409, 'slug_taken', 'Este endereço já está em uso.', {
      details: { fields: { slug: 'Este endereço já está em uso.' } },
    });
  }

  await notifyExistingOwnerIfAny(tx, { email: input.email, document: input.document });

  const plan = (await platformRepository.listPlans(tx, true))[0];
  if (!plan) throw billingUnavailable();

  const tenant = await repository.insertTrialTenant(tx, {
    slug: input.slug,
    name: input.businessName,
    document: input.document,
  });

  await createInvitedUser(tx, {
    tenantId: tenant.id,
    name: input.ownerName,
    email: input.email,
    role: 'owner',
  });

  await repository.insertPrimaryDomain(tx, {
    tenantId: tenant.id,
    hostname: `${tenant.slug}.${env.ROOT_DOMAIN}`,
  });

  let checkoutUrl: string;
  try {
    const customer = await billingProvider.createCustomer({
      tenantId: tenant.id,
      name: input.ownerName,
      email: input.email,
      document: input.document,
      phone: toLocalPhone(input.phone),
    });

    const created = await billingProvider.createSubscription({
      providerCustomerId: customer.providerCustomerId,
      planCode: plan.code,
      amountCents: plan.priceCents,
      // Quem paga escolhe PIX, boleto ou cartão na própria página do
      // provedor — é o que mantém o número do cartão fora do Cantina (§3.7).
      billingType: 'UNDEFINED',
      // Hoje, não "+3 dias" como a contratação pelo painel: só com
      // vencimento no dia o Asaas gera a primeira fatura na hora, e é o
      // link dela que vira `checkoutUrl`.
      nextDueDate: new Date().toISOString().slice(0, 10),
    });

    if (!created.checkoutUrl) throw billingUnavailable();
    checkoutUrl = created.checkoutUrl;

    await platformRepository.insertSubscription(tx, {
      tenantId: tenant.id,
      planId: plan.id,
      provider: billingProvider.name,
      providerCustomerId: customer.providerCustomerId,
      providerSubscriptionId: created.providerSubscriptionId,
      // Sempre `trialing` aqui, independente do que o Asaas mapeou: até o
      // webhook confirmar o primeiro pagamento, a conta não é usável (§3.8).
      status: 'trialing',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw billingUnavailable(error);
  }

  await repository.completeAttempt(tx, reserved.id, { tenantId: tenant.id, checkoutUrl });

  await recordAudit(tx, {
    tenantId: tenant.id,
    action: 'tenant.trial_signup',
    entityType: 'tenant',
    entityId: tenant.id,
    after: { slug: tenant.slug, documentTail: maskedCpfTail(input.document) },
    actorType: 'system',
  });

  return { checkoutUrl };
}

/* -------------------------------------------------------------------------- */
/* Liberação — chamada pelo webhook quando o gateway confirma o pagamento     */
/* -------------------------------------------------------------------------- */

/**
 * Libera um tenant nascido do cadastro público (§3.8, §3.9).
 *
 * Não faz nada para tenant que não veio desta rota: `pendingConfirmationAt`
 * é exatamente essa marca, e ausência dela é sinal de "nada a liberar aqui"
 * — inclusive numa segunda chamada, depois que a primeira já limpou o campo.
 */
export async function releasePendingSignup(tx: Transaction, tenantId: string): Promise<void> {
  const [tenant] = await tx
    .select({
      pendingConfirmationAt: tenants.pendingConfirmationAt,
      slug: tenants.slug,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.pendingConfirmationAt) return;

  const trialEndsAt = new Date();
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);

  await tx
    .update(tenants)
    .set({ pendingConfirmationAt: null, trialEndsAt })
    .where(eq(tenants.id, tenantId));

  const [owner] = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.role, 'owner'),
        eq(users.status, 'invited'),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  // Já foi ativado por outro caminho (ou não existe por algum motivo) —
  // nada a convidar.
  if (!owner) return;

  const token = generateOpaqueToken();
  await createInvite(tx, {
    tenantId,
    email: owner.email,
    role: 'owner',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    invitedByUserId: null,
  });

  const link = `${env.WEB_URL}/convite?tenant=${tenant.slug}&token=${token}`;

  await mailProvider.send({
    to: owner.email,
    subject: 'Seu teste grátis do Cantina está liberado',
    text:
      `Seu pagamento foi confirmado! Defina sua senha para acessar o painel de ${tenant.name}: ` +
      `${link}\n\nO link vale por 7 dias.`,
    html:
      `<p>Seu pagamento foi confirmado! Defina sua senha para acessar o painel de <strong>${tenant.name}</strong>:</p>` +
      `<p><a href="${link}">Definir minha senha</a></p><p>O link vale por 7 dias.</p>`,
  });
}
