/**
 * Números e promessas da landing, em um lugar só.
 *
 * Tudo aqui é COMPROMISSO COMERCIAL, não decisão de código: quanto tempo dura
 * o teste, quanto custa o plano, quantas docerias usam. Espalhados pelo JSX,
 * eles viram cinco versões da mesma promessa e uma delas fica desatualizada.
 *
 * `null` significa "ainda não definido" e a tela mostra um marcador visível no
 * lugar — nunca um número plausível. Uma landing que promete "12 dias grátis"
 * porque alguém chutou no código é um problema de contrato, não de layout.
 */

/** PLACEHOLDER: confirmar a duração real antes de publicar. */
export const TRIAL_DAYS: number | null = null;

/** PLACEHOLDER: preço do plano de entrada, já com o "/mês". */
export const PLAN_PRICE: string | null = null;

/**
 * Métricas de prova social.
 *
 * Só preencher com número que possa ser auditado no banco. Enquanto for
 * `null`, a seção mostra o marcador — que é honesto, e some no dia em que o
 * número existir.
 */
export const METRICS: Array<{ value: string | null; label: string; hint: string }> = [
  {
    value: null, // PLACEHOLDER: contagem real de pedidos processados
    label: 'pedidos passaram pelo Cantina',
    hint: 'delivery e encomenda somados',
  },
  {
    value: null, // PLACEHOLDER: contagem real de docerias ativas
    label: 'docerias usando todo dia',
    hint: 'lojas com pedido nos últimos 30 dias',
  },
  {
    value: null, // PLACEHOLDER: contagem real de encomendas agendadas
    label: 'encomendas agendadas',
    hint: 'reservas com data marcada no calendário',
  },
];

/** Texto do teste: monta a frase sem afirmar um prazo que ninguém confirmou. */
export function trialLabel(): string {
  return TRIAL_DAYS === null ? '[N] dias grátis' : `${TRIAL_DAYS} dias grátis`;
}

export function priceLabel(): string {
  return PLAN_PRICE ?? '[R$ —]/mês';
}
