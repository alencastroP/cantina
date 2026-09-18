import {
  addDays,
  compareDateOnly,
  dateOnlyIn,
  eachDay,
  weekdayOf,
  DEFAULT_TIME_ZONE,
  type DateOnly,
} from './dates';

/**
 * Agenda de encomendas (D10, §4.9 do PLAN.md).
 *
 * Um dia está disponível quando as quatro condições valem juntas:
 *   1. a regra do dia da semana aceita encomenda;
 *   2. nenhuma exceção fecha aquela data;
 *   3. ainda há vaga (`usados + reservados < capacidade`);
 *   4. a data respeita a antecedência mínima e o horizonte de agendamento.
 *
 * Tudo aqui é puro. Quem lê o banco e reserva a vaga atomicamente é o
 * módulo `availability` da API.
 */

export interface AvailabilityRule {
  /** 0 = domingo … 6 = sábado. */
  weekday: number;
  isOpen: boolean;
  capacity: number;
}

export interface AvailabilityException {
  date: DateOnly;
  isOpen: boolean;
  /** `null` = mantém a capacidade da regra semanal (é só um feriado aberto). */
  capacity: number | null;
  reason?: string | null;
}

export interface DayCounters {
  date: DateOnly;
  usedCount: number;
  reservedCount: number;
}

export interface AvailabilitySettings {
  /** Antecedência mínima entre o pedido e a data da encomenda. */
  leadTimeHours: number;
  /** Quantos dias à frente a vitrine deixa agendar. */
  horizonDays: number;
  timeZone?: string;
}

export type UnavailableReason = 'closed' | 'full' | 'lead_time' | 'horizon';

export interface DayAvailability {
  date: DateOnly;
  weekday: number;
  isOpen: boolean;
  capacity: number;
  taken: number;
  slotsLeft: number;
  available: boolean;
  reason: UnavailableReason | null;
  exceptionReason: string | null;
}

export interface ComputeAvailabilityInput {
  from: DateOnly;
  to: DateOnly;
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  counters: readonly DayCounters[];
  settings: AvailabilitySettings;
  /** Instante da consulta. Injetado para manter a função pura e testável. */
  now: Date;
}

/**
 * Primeira data que respeita a antecedência mínima.
 * Antecedência conta em horas cheias a partir de agora, e o resultado é
 * arredondado para o dia — quem pede às 23h com 24h de antecedência
 * só consegue agendar para depois de amanhã.
 */
export function earliestOrderableDate(
  now: Date,
  leadTimeHours: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): DateOnly {
  const target = new Date(now.getTime() + leadTimeHours * 3_600_000);
  return dateOnlyIn(target, timeZone);
}

export function computeAvailability({
  from,
  to,
  rules,
  exceptions,
  counters,
  settings,
  now,
}: ComputeAvailabilityInput): DayAvailability[] {
  const timeZone = settings.timeZone ?? DEFAULT_TIME_ZONE;
  const today = dateOnlyIn(now, timeZone);

  const earliest = earliestOrderableDate(now, settings.leadTimeHours, timeZone);
  const latest = addDays(today, settings.horizonDays);

  const rulesByWeekday = new Map(rules.map((rule) => [rule.weekday, rule]));
  const exceptionsByDate = new Map(exceptions.map((exception) => [exception.date, exception]));
  const countersByDate = new Map(counters.map((counter) => [counter.date, counter]));

  return eachDay(from, to).map<DayAvailability>((date) => {
    const weekday = weekdayOf(date);
    const rule = rulesByWeekday.get(weekday);
    const exception = exceptionsByDate.get(date);
    const counter = countersByDate.get(date);

    const isOpen = exception ? exception.isOpen : (rule?.isOpen ?? false);
    const capacity = exception?.capacity ?? rule?.capacity ?? 0;
    const taken = (counter?.usedCount ?? 0) + (counter?.reservedCount ?? 0);
    const slotsLeft = Math.max(0, capacity - taken);

    // A ordem das checagens define a mensagem que o cliente vê.
    // "Fechado" antes de "lotado": não adianta dizer que lotou um dia
    // em que a loja nem abre.
    let reason: UnavailableReason | null = null;
    if (!isOpen || capacity <= 0) {
      reason = 'closed';
    } else if (compareDateOnly(date, earliest) < 0) {
      reason = 'lead_time';
    } else if (compareDateOnly(date, latest) > 0) {
      reason = 'horizon';
    } else if (slotsLeft <= 0) {
      reason = 'full';
    }

    return {
      date,
      weekday,
      isOpen,
      capacity,
      taken,
      slotsLeft,
      available: reason === null,
      reason,
      exceptionReason: exception?.reason ?? null,
    };
  });
}

/** Atalho para o checkout: a data pedida ainda aceita encomenda? */
export function isDateAvailable(
  date: DateOnly,
  input: Omit<ComputeAvailabilityInput, 'from' | 'to'>,
): DayAvailability {
  const [day] = computeAvailability({ ...input, from: date, to: date });
  // `eachDay` sobre um intervalo de um dia sempre devolve exatamente um item.
  return day!;
}
