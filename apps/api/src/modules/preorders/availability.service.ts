import type {
  AvailabilityException,
  AvailabilityRule,
  CreateExceptionRequest,
  DayAvailability,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import {
  computeAvailability,
  isDateAvailable,
  type DateOnly,
} from '@cantina/domain';

import { conflict, notFound, unprocessable } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import * as settingsService from '../settings/settings.service';
import * as repository from './availability.repository';

/**
 * Agenda de encomendas (D10).
 *
 * A regra de "este dia aceita encomenda?" vive em `@cantina/domain`; aqui só
 * se busca o que ela precisa e se aplica o resultado. A tabela
 * `availability_days` existe para uma coisa que a função pura não pode fazer:
 * reservar vaga sem corrida.
 */

export async function getRules(tx: Transaction): Promise<AvailabilityRule[]> {
  const saved = await repository.listRules(tx);
  const byWeekday = new Map(saved.map((rule) => [rule.weekday, rule]));

  // Devolve sempre os sete dias: a tela edita a semana inteira, e um dia
  // ausente no banco significa "fechado", não "não existe".
  return Array.from({ length: 7 }, (_, weekday) => {
    const rule = byWeekday.get(weekday);
    return {
      weekday,
      isOpen: rule?.isOpen ?? false,
      capacity: rule?.capacity ?? 0,
    };
  });
}

export async function putRules(
  tx: Transaction,
  tenantId: string,
  rules: AvailabilityRule[],
): Promise<AvailabilityRule[]> {
  const weekdays = new Set(rules.map((rule) => rule.weekday));
  if (weekdays.size !== 7) {
    throw unprocessable('Envie os sete dias da semana, uma vez cada.');
  }

  await repository.replaceRules(tx, tenantId, rules);

  await recordAudit(tx, {
    tenantId,
    action: 'availability.rules_updated',
    entityType: 'availability_rules',
    after: { openDays: rules.filter((rule) => rule.isOpen).length },
  });

  return getRules(tx);
}

export async function listExceptions(
  tx: Transaction,
  from?: string,
  to?: string,
): Promise<AvailabilityException[]> {
  return repository.listExceptions(tx, from, to);
}

export async function upsertException(
  tx: Transaction,
  tenantId: string,
  input: CreateExceptionRequest,
): Promise<AvailabilityException> {
  const saved = await repository.upsertException(tx, {
    tenantId,
    date: input.date,
    isOpen: input.isOpen,
    capacity: input.capacity ?? null,
    reason: input.reason ?? null,
  });

  await recordAudit(tx, {
    tenantId,
    action: 'availability.exception_set',
    entityType: 'availability_exception',
    entityId: saved.id,
    after: { date: input.date, isOpen: input.isOpen, reason: input.reason ?? null },
  });

  return {
    id: saved.id,
    date: saved.date,
    isOpen: saved.isOpen,
    capacity: saved.capacity,
    reason: saved.reason,
  };
}

export async function removeException(
  tx: Transaction,
  tenantId: string,
  id: string,
): Promise<void> {
  const removed = await repository.deleteException(tx, id);
  if (!removed) throw notFound('Exceção não encontrada.');

  await recordAudit(tx, {
    tenantId,
    action: 'availability.exception_removed',
    entityType: 'availability_exception',
    entityId: id,
  });
}

/* -------------------------------------------------------------------------- */
/* Disponibilidade                                                             */
/* -------------------------------------------------------------------------- */

async function loadInputs(tx: Transaction, tenantId: string, from: string, to: string) {
  const [rules, exceptions, days, settings] = await Promise.all([
    repository.listRules(tx),
    repository.listExceptions(tx, from, to),
    repository.listDays(tx, from, to),
    settingsService.get(tx, tenantId),
  ]);

  return {
    rules,
    exceptions: exceptions.map((exception) => ({
      date: exception.date,
      isOpen: exception.isOpen,
      capacity: exception.capacity,
      reason: exception.reason,
    })),
    counters: days.map((day) => ({
      date: day.date,
      usedCount: day.usedCount,
      reservedCount: day.reservedCount,
    })),
    settings: {
      leadTimeHours: settings.preorderLeadTimeHours,
      horizonDays: settings.preorderHorizonDays,
    },
  };
}

export async function getRange(
  tx: Transaction,
  tenantId: string,
  from: DateOnly,
  to: DateOnly,
  timeZone: string,
): Promise<DayAvailability[]> {
  const inputs = await loadInputs(tx, tenantId, from, to);

  return computeAvailability({
    from,
    to,
    rules: inputs.rules,
    exceptions: inputs.exceptions,
    counters: inputs.counters,
    settings: { ...inputs.settings, timeZone },
    now: new Date(),
  });
}

/**
 * Reserva a vaga de uma encomenda.
 *
 * Duas etapas, e a ordem importa: primeiro a validação de regra (a função
 * pura decide se o dia aceita), depois o `UPDATE` condicional que garante a
 * vaga. A primeira dá a mensagem certa ("fechado", "antecedência mínima"); a
 * segunda é o que impede dois clientes de pegarem a última.
 */
export async function reserveSlot(
  tx: Transaction,
  tenantId: string,
  date: DateOnly,
  timeZone: string,
): Promise<string> {
  const inputs = await loadInputs(tx, tenantId, date, date);

  const day = isDateAvailable(date, {
    rules: inputs.rules,
    exceptions: inputs.exceptions,
    counters: inputs.counters,
    settings: { ...inputs.settings, timeZone },
    now: new Date(),
  });

  if (!day.available) {
    // A mensagem vem do MOTIVO: "fechado", "lotado" e "antecedência mínima"
    // levam a ações diferentes de quem está comprando.
    throw conflict(REASON_MESSAGES[day.reason ?? 'closed'] ?? REASON_MESSAGES['closed']!, {
      date,
      reason: day.reason,
    });
  }

  await repository.ensureDay(tx, tenantId, date, day.capacity);

  const reserved = await repository.reserveSlot(tx, date);
  if (!reserved) {
    // Só chega aqui quando o dia lotou ENTRE a validação e o update — a
    // corrida que a condição no `WHERE` existe para pegar.
    throw conflict('Este dia acabou de lotar. Escolha outra data.', { date });
  }

  return reserved.id;
}

const REASON_MESSAGES: Record<string, string> = {
  closed: 'Não aceitamos encomendas nesta data.',
  full: 'Este dia já está lotado. Escolha outra data.',
  lead_time: 'Esta data está dentro do prazo mínimo de antecedência.',
  horizon: 'Ainda não abrimos agenda para esta data.',
};

export async function consumeSlot(tx: Transaction, dayId: string): Promise<void> {
  await repository.consumeSlot(tx, dayId);
}

export async function releaseSlot(
  tx: Transaction,
  dayId: string,
  fromReserved: boolean,
): Promise<void> {
  await repository.releaseSlot(tx, dayId, fromReserved);
}
