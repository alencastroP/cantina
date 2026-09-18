import type { StorefrontConfig } from '@cantina/contracts';

/**
 * Horário da loja, contado do jeito que o cliente precisa.
 *
 * "Fechado" sozinho não ajuda ninguém a decidir nada; "abre amanhã às 07:00"
 * ajuda. O cálculo roda no SERVIDOR, no layout, no fuso da loja — o relógio do
 * celular é do cliente (FRONTEND.md). Enquanto o fuso não vem na configuração
 * pública, vale o padrão do cadastro, `America/Sao_Paulo`, como no resto do front.
 */

export const WEEKDAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clock(now: Date, timeZone: string): { weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return {
    weekday: WEEKDAY_CODES.indexOf(part('weekday')),
    time: `${part('hour')}:${part('minute')}`,
  };
}

export interface StoreNow {
  /** Dia da semana de hoje, no fuso da loja — destaca a linha na tabela. */
  weekday: number;
  /** "até 19:00" quando aberta; "abre amanhã às 07:00" quando fechada. */
  hint: string | null;
}

export function storeNow(
  config: Pick<StorefrontConfig, 'hours' | 'isOpenNow'>,
  now = new Date(),
  timeZone = 'America/Sao_Paulo',
): StoreNow {
  const { weekday, time } = clock(now, timeZone);

  if (config.isOpenNow) {
    const slot = config.hours.find(
      (hour) => hour.weekday === weekday && time >= hour.opensAt && time <= hour.closesAt,
    );
    return { weekday, hint: slot ? `até ${slot.closesAt}` : null };
  }

  // Oito voltas: a oitava é o mesmo dia da semana que vem, em qualquer horário.
  for (let offset = 0; offset < 8; offset += 1) {
    const day = (weekday + offset) % 7;
    const next = config.hours
      .filter((hour) => hour.weekday === day && (offset > 0 || hour.opensAt > time))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))[0];

    if (next) {
      const when = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : WEEKDAY_NAMES[day];
      return { weekday, hint: `abre ${when} às ${next.opensAt}` };
    }
  }

  return { weekday, hint: null };
}
