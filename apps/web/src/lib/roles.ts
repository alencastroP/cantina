import type { UserRole } from '@cantina/contracts';

/**
 * O que cada papel enxerga no painel.
 *
 * Espelha as travas da API — não as substitui. A API corta custo da resposta
 * de quem não pode vê-lo e recusa a ficha técnica a quem não gerencia; aqui
 * isso só evita mostrar um cartão vazio ou um botão que sempre devolve 403.
 */

/** Ficha técnica, simulador, custo do produto: `requireManager` na API. */
export function canManageCosts(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

/** Custo congelado no pedido e custo médio do insumo: gestão e financeiro. */
export function canSeeCosts(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'manager' || role === 'finance';
}
