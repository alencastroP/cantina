/**
 * Rolagem que respeita quem desligou animação no sistema.
 *
 * `behavior: 'smooth'` ignora `prefers-reduced-motion` — o CSS global não
 * alcança rolagem disparada por JavaScript.
 */
export function scrollToElement(
  element: Element | null,
  block: ScrollLogicalPosition = 'start',
): void {
  if (!element) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
}
