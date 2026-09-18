import { domainError } from './errors';

/**
 * Datas de calendário (P5).
 *
 * Encomenda é marcada para um DIA, não para um instante. Guardar isso como
 * timestamp faz "27 de dezembro" virar "26 de dezembro às 21h" para metade
 * dos leitores. Então: `DateOnly` (string `YYYY-MM-DD`) em todo o domínio,
 * e a única conversão para instante acontece na borda, com timezone explícito.
 */

export type DateOnly = string;

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): value is DateOnly {
  return DATE_ONLY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function assertDateOnly(value: string, field = 'data'): DateOnly {
  if (!isDateOnly(value)) {
    throw domainError('invalid_date', `${field} precisa estar no formato AAAA-MM-DD.`, { value });
  }
  return value;
}

/** Data de calendário do instante `at`, no fuso informado. */
export function dateOnlyIn(at: Date, timeZone: string = DEFAULT_TIME_ZONE): DateOnly {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Hora local (`HH:MM`) do instante `at`, no fuso informado. */
export function timeIn(at: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

function toUtcDate(value: DateOnly): Date {
  assertDateOnly(value);
  return new Date(`${value}T00:00:00Z`);
}

/** 0 = domingo … 6 = sábado. Calculado em UTC, portanto imune a fuso. */
export function weekdayOf(value: DateOnly): number {
  return toUtcDate(value).getUTCDay();
}

export function addDays(value: DateOnly, days: number): DateOnly {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(from: DateOnly, to: DateOnly): number {
  const ms = toUtcDate(to).getTime() - toUtcDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Intervalo fechado [from, to]. Protegido contra intervalo absurdo. */
export function eachDay(from: DateOnly, to: DateOnly, maxDays = 400): DateOnly[] {
  const span = daysBetween(from, to);
  if (span < 0) {
    throw domainError('invalid_range', 'A data inicial precisa ser anterior à final.', { from, to });
  }
  if (span > maxDays) {
    throw domainError('range_too_large', `O intervalo não pode passar de ${maxDays} dias.`, {
      from,
      to,
    });
  }
  return Array.from({ length: span + 1 }, (_, index) => addDays(from, index));
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/**
 * Deslocamento do fuso NAQUELE instante, em milissegundos (UTC − local).
 * Calculado por formatação e não por tabela: o `Intl` já carrega as regras
 * de horário de verão, inclusive as que mudaram de ano para ano.
 */
function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  // `hour: '2-digit'` com `hour12: false` devolve 24 na meia-noite em alguns ICU.
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );

  return at.getTime() - local;
}

/**
 * Instante em que o dia `value` COMEÇA no fuso informado.
 *
 * É a conversão da borda que o cabeçalho deste arquivo promete, e existe por
 * um motivo concreto: uma venda das 21h em São Paulo é meia-noite em UTC, e
 * um relatório que corta o dia por `completed_at::date` a joga no dia
 * seguinte — o faturamento de sexta aparece no sábado, todo sábado.
 *
 * Comparar o timestamp com estes limites, em vez de converter cada linha,
 * também mantém o índice de `completed_at` utilizável.
 */
export function zonedStartOfDay(value: DateOnly, timeZone: string = DEFAULT_TIME_ZONE): Date {
  assertDateOnly(value);
  const naive = Date.parse(`${value}T00:00:00Z`);

  const guess = timeZoneOffsetMs(new Date(naive), timeZone);
  const instant = naive + guess;

  // Segunda passada: na virada do horário de verão o deslocamento da meia-noite
  // UTC não é o da meia-noite local, e o certo é o do instante já corrigido.
  const refined = timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(refined === guess ? instant : naive + refined);
}

/**
 * Instante em que o dia `value` TERMINA, exclusivo — isto é, o começo do dia
 * seguinte. Intervalo meio-aberto `[início, fim)` para não perder o último
 * segundo do dia nem depender de precisão de timestamp.
 */
export function zonedEndOfDay(value: DateOnly, timeZone: string = DEFAULT_TIME_ZONE): Date {
  return zonedStartOfDay(addDays(value, 1), timeZone);
}
