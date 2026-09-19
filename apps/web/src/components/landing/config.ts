/**
 * Números e promessas da landing, em um lugar só.
 *
 * Tudo aqui é COMPROMISSO COMERCIAL, não decisão de código: quanto tempo dura
 * o teste e quanto custa o plano. Espalhados pelo JSX, eles viram cinco
 * versões da mesma promessa e uma delas fica desatualizada.
 *
 * `null` significa "ainda não definido" e a tela mostra um marcador visível no
 * lugar — nunca um número plausível. Uma landing que promete "12 dias grátis"
 * porque alguém chutou no código é um problema de contrato, não de layout.
 */

/** Duração do teste grátis, em dias. Valor comercial definido. */
export const TRIAL_DAYS: number | null = 15;

/** PLACEHOLDER: preço do plano de entrada, já com o "/mês". */
export const PLAN_PRICE: string | null = null;

/** Texto do teste: um lugar só para a promessa que aparece em quatro botões. */
export function trialLabel(): string {
  return TRIAL_DAYS === null ? '[N] dias grátis' : `${TRIAL_DAYS} dias grátis`;
}

export function priceLabel(): string {
  return PLAN_PRICE ?? '[R$ ..]/mês';
}
