import {
  businessHours,
  orderStatusLabels,
  tenantSettings,
  type Executor,
} from '@cantina/db';
import { and, asc, eq } from 'drizzle-orm';

/** Configuração da empresa (§4.2 do PLAN.md). */

export type SettingsRow = typeof tenantSettings.$inferSelect;
export type SettingsPatch = Partial<typeof tenantSettings.$inferInsert>;

export async function getSettings(tx: Executor, tenantId: string): Promise<SettingsRow | null> {
  const rows = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert em vez de update.
 *
 * A linha de settings nasce no provisionamento do tenant, mas uma empresa
 * criada por script ou importada pode não ter uma. Falhar aqui deixaria o
 * painel inutilizável por um detalhe de onboarding.
 */
export async function upsertSettings(
  tx: Executor,
  tenantId: string,
  patch: SettingsPatch,
): Promise<SettingsRow> {
  const rows = await tx
    .insert(tenantSettings)
    .values({ ...patch, tenantId })
    .onConflictDoUpdate({ target: tenantSettings.tenantId, set: patch })
    .returning();

  const saved = rows[0];
  if (!saved) throw new Error('Falha ao salvar as configurações.');
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Horário de funcionamento                                                    */
/* -------------------------------------------------------------------------- */

export type BusinessHourRow = typeof businessHours.$inferSelect;

export async function listBusinessHours(tx: Executor): Promise<BusinessHourRow[]> {
  return tx
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.scope), asc(businessHours.weekday), asc(businessHours.opensAt));
}

/**
 * Substituição integral.
 *
 * A tela edita a semana inteira de uma vez, e um diff por faixa exigiria
 * identidade estável para algo que o lojista pensa como "o horário de terça".
 * Delete + insert na mesma transação é mais simples e não tem estado
 * intermediário visível.
 */
export async function replaceBusinessHours(
  tx: Executor,
  tenantId: string,
  hours: Array<{
    weekday: number;
    opensAt: string;
    closesAt: string;
    scope: 'store' | 'preorder';
  }>,
): Promise<BusinessHourRow[]> {
  await tx.delete(businessHours);

  if (hours.length === 0) return [];

  return tx
    .insert(businessHours)
    .values(hours.map((hour) => ({ ...hour, tenantId })))
    .returning();
}

/* -------------------------------------------------------------------------- */
/* Rótulos das colunas do kanban (D18)                                         */
/* -------------------------------------------------------------------------- */

export type StatusLabelRow = typeof orderStatusLabels.$inferSelect;

export async function listStatusLabels(tx: Executor): Promise<StatusLabelRow[]> {
  return tx
    .select()
    .from(orderStatusLabels)
    .orderBy(asc(orderStatusLabels.flow), asc(orderStatusLabels.position));
}

export async function upsertStatusLabel(
  tx: Executor,
  input: {
    tenantId: string;
    flow: 'delivery' | 'preorder';
    statusCode: string;
    label: string;
    color: string | null;
    position: number;
  },
): Promise<void> {
  await tx
    .insert(orderStatusLabels)
    .values(input)
    .onConflictDoUpdate({
      target: [orderStatusLabels.tenantId, orderStatusLabels.flow, orderStatusLabels.statusCode],
      // `position` não entra: a ordem vem da máquina de estados, não da tela.
      set: { label: input.label, color: input.color },
    });
}

export async function findStatusLabel(
  tx: Executor,
  flow: 'delivery' | 'preorder',
  statusCode: string,
): Promise<StatusLabelRow | null> {
  const rows = await tx
    .select()
    .from(orderStatusLabels)
    .where(and(eq(orderStatusLabels.flow, flow), eq(orderStatusLabels.statusCode, statusCode)))
    .limit(1);
  return rows[0] ?? null;
}
