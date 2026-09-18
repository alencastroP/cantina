/**
 * Formatação para leitura humana, sempre pt-BR.
 *
 * O backend trabalha em centavos inteiros (invariante 8) e o front nunca
 * converte para decimal antes da hora de exibir — é aqui, e só aqui, que a
 * divisão por 100 acontece.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export function formatCents(value: number): string {
  return brl.format(value / 100);
}

/** Quantidade de estoque: 1500 g vira "1.500", 2.5 vira "2,5". */
export function formatQty(value: number, unit?: string): string {
  const formatted = decimal.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

/** `+5511987654321` vira `(11) 98765-4321`. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
}

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

const dateOnly = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Data de calendário (`AAAA-MM-DD`) não passa por fuso: já é um dia local. */
export function formatDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  return dateOnly.format(new Date(value));
}

/**
 * "há 3 min", "há 2 h". O kanban precisa disso: o que importa num pedido é
 * quanto tempo ele está esperando, não a hora em que entrou.
 */
export function formatElapsed(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

function calendarDay(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

/** `2026-09-19` vira "sábado, 19 de setembro". Sem fuso: é um dia de calendário. */
export function formatDayLong(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(calendarDay(value));
}

/** `2026-09-19` vira "sáb, 19 set" — cabe numa barra de celular. */
export function formatDayShort(value: string): string {
  const date = calendarDay(value);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '');
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(date)
    .replace('.', '');
  return `${weekday}, ${date.getUTCDate()} ${month}`;
}
