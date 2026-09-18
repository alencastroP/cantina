/**
 * Junta classes, ignorando o que for falso.
 *
 * Sem `tailwind-merge` de propósito: as variantes dos primitivos são mapas
 * explícitos de classes, então não existe conflito para resolver em tempo de
 * execução. Uma dependência a menos na página que o cliente carrega.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
