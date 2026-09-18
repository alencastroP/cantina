import type {
  BusinessHour,
  StatusLabel,
  TenantSettings,
  UpdateStatusLabelsRequest,
  UpdateTenantSettingsRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  DEFAULT_DELIVERY_LABELS,
  DEFAULT_PREORDER_LABELS,
  DELIVERY_STATUSES,
  PREORDER_STATUSES,
} from '@cantina/domain';

import { unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as repository from './settings.repository';

/** Configuração da empresa (§6.10 do PLAN.md). */

function toSettings(row: repository.SettingsRow): TenantSettings {
  return {
    about: row.about,
    theme: row.theme,
    address: row.address,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    acceptsDelivery: row.acceptsDelivery,
    acceptsPickup: row.acceptsPickup,
    acceptsPreorder: row.acceptsPreorder,
    acceptsOnlineCheckout: row.acceptsOnlineCheckout,
    minOrderCents: row.minOrderCents,
    acceptedPaymentMethods: row.acceptedPaymentMethods,
    whatsappNumber: row.whatsappNumber,
    whatsappMode: row.whatsappMode,
    preorderLeadTimeHours: row.preorderLeadTimeHours,
    preorderHorizonDays: row.preorderHorizonDays,
    preorderDepositPercent: row.preorderDepositPercent,
    reservationTtlMinutes: row.reservationTtlMinutes,
  };
}

export async function get(tx: Transaction, tenantId: string): Promise<TenantSettings> {
  const row = await repository.getSettings(tx, tenantId);
  // Cria com os padrões do schema se ainda não existir.
  return toSettings(row ?? (await repository.upsertSettings(tx, tenantId, {})));
}

export async function update(
  tx: Transaction,
  tenantId: string,
  patch: UpdateTenantSettingsRequest,
): Promise<TenantSettings> {
  const before = await repository.getSettings(tx, tenantId);

  /**
   * Uma loja que não aceita nada não é uma loja.
   * A checagem considera o estado RESULTANTE, não só o que veio no patch —
   * desligar o último canal em duas chamadas separadas é o caminho fácil de
   * chegar numa vitrine que não recebe pedido nenhum.
   */
  const resulting = {
    delivery: patch.acceptsDelivery ?? before?.acceptsDelivery ?? true,
    pickup: patch.acceptsPickup ?? before?.acceptsPickup ?? true,
    preorder: patch.acceptsPreorder ?? before?.acceptsPreorder ?? true,
  };

  if (!resulting.delivery && !resulting.pickup && !resulting.preorder) {
    throw unprocessable(
      'Mantenha ao menos uma forma de receber pedidos: entrega, retirada ou encomenda.',
    );
  }

  if (patch.whatsappMode && !(patch.whatsappNumber ?? before?.whatsappNumber)) {
    throw unprocessable('Cadastre o número de WhatsApp antes de escolher o modo de envio.');
  }

  const saved = await repository.upsertSettings(tx, tenantId, patch);

  await recordAudit(tx, {
    tenantId,
    action: 'settings.updated',
    entityType: 'tenant_settings',
    entityId: tenantId,
    before: before ? toSettings(before) : null,
    after: toSettings(saved),
  });

  return toSettings(saved);
}

/* -------------------------------------------------------------------------- */
/* Horário de funcionamento                                                    */
/* -------------------------------------------------------------------------- */

function toBusinessHour(row: repository.BusinessHourRow): BusinessHour {
  return {
    weekday: row.weekday,
    // `time` volta do Postgres como `HH:MM:SS`; o contrato é `HH:MM`.
    opensAt: row.opensAt.slice(0, 5),
    closesAt: row.closesAt.slice(0, 5),
    scope: row.scope,
  };
}

export async function getBusinessHours(tx: Transaction): Promise<BusinessHour[]> {
  const rows = await repository.listBusinessHours(tx);
  return rows.map(toBusinessHour);
}

export async function replaceBusinessHours(
  tx: Transaction,
  tenantId: string,
  hours: BusinessHour[],
): Promise<BusinessHour[]> {
  // Faixas do mesmo dia e escopo não podem se sobrepor: "abre 8-12 e 8-14"
  // torna indefinido o que a vitrine deve dizer sobre estar aberta.
  const byKey = new Map<string, BusinessHour[]>();
  for (const hour of hours) {
    const key = `${hour.scope}:${hour.weekday}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(hour);
    } else {
      byKey.set(key, [hour]);
    }
  }

  for (const [key, sameDay] of byKey) {
    const sorted = [...sameDay].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.opensAt < sorted[index - 1]!.closesAt) {
        throw unprocessable('Há faixas de horário sobrepostas no mesmo dia.', { key });
      }
    }
  }

  const saved = await repository.replaceBusinessHours(tx, tenantId, hours);

  await recordAudit(tx, {
    tenantId,
    action: 'settings.business_hours_replaced',
    entityType: 'business_hours',
    after: { count: saved.length },
  });

  return saved.map(toBusinessHour);
}

/* -------------------------------------------------------------------------- */
/* Rótulos das colunas do kanban (D18)                                         */
/* -------------------------------------------------------------------------- */

const DEFAULT_LABELS = {
  delivery: DEFAULT_DELIVERY_LABELS as Record<string, string>,
  preorder: DEFAULT_PREORDER_LABELS as Record<string, string>,
};

const VALID_CODES = {
  delivery: new Set<string>(DELIVERY_STATUSES),
  preorder: new Set<string>(PREORDER_STATUSES),
};

const POSITIONS = {
  delivery: new Map<string, number>(
    DELIVERY_STATUSES.map((code, index): [string, number] => [code, index]),
  ),
  preorder: new Map<string, number>(
    PREORDER_STATUSES.map((code, index): [string, number] => [code, index]),
  ),
};

/**
 * Devolve SEMPRE o conjunto completo de colunas.
 *
 * O que está no banco são apenas as customizações; o restante vem do padrão
 * de `@cantina/domain`. Assim o kanban nunca fica com uma coluna sem nome
 * porque o lojista renomeou só duas.
 */
export async function getStatusLabels(tx: Transaction): Promise<StatusLabel[]> {
  const rows = await repository.listStatusLabels(tx);
  const saved = new Map(rows.map((row) => [`${row.flow}:${row.statusCode}`, row]));

  const output: StatusLabel[] = [];

  for (const flow of ['delivery', 'preorder'] as const) {
    for (const [statusCode, position] of POSITIONS[flow]) {
      const row = saved.get(`${flow}:${statusCode}`);
      output.push({
        id: row?.id ?? `${flow}:${statusCode}`,
        flow,
        statusCode,
        label: row?.label ?? DEFAULT_LABELS[flow][statusCode] ?? statusCode,
        color: row?.color ?? null,
        position,
      });
    }
  }

  return output;
}

export async function updateStatusLabels(
  tx: Transaction,
  tenantId: string,
  input: UpdateStatusLabelsRequest,
): Promise<StatusLabel[]> {
  for (const label of input.labels) {
    if (!VALID_CODES[label.flow].has(label.statusCode)) {
      throw unprocessable(`"${label.statusCode}" não é um status de ${label.flow}.`, {
        statusCode: label.statusCode,
        flow: label.flow,
      });
    }
  }

  for (const label of input.labels) {
    await repository.upsertStatusLabel(tx, {
      tenantId,
      flow: label.flow,
      statusCode: label.statusCode,
      label: label.label,
      color: label.color ?? null,
      position: POSITIONS[label.flow].get(label.statusCode) ?? 0,
    });
  }

  await recordAudit(tx, {
    tenantId,
    action: 'settings.status_labels_updated',
    entityType: 'order_status_labels',
    after: { count: input.labels.length },
  });

  return getStatusLabels(tx);
}
