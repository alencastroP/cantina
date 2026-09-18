'use client';

import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Endereços da vitrine, do ponto de vista do NAVEGADOR.
 *
 * O middleware reescreve `padaria.cantina.app/sacola` para
 * `/loja/padaria.cantina.app/sacola`, mas isso é interno: o navegador continua
 * em `/sacola`. Um link para `/loja/<host>/sacola` passaria de novo pelo
 * middleware e viraria `/loja/<host>/loja/<host>/sacola` — um 404. Era o que
 * acontecia com "Encomendar", "Ver sacola", o histórico e o redirecionamento
 * depois do checkout.
 *
 * Quando a vitrine é aberta pelo caminho direto (`cantina.app/loja/<host>`,
 * que o middleware deixa passar no domínio raiz), o prefixo continua valendo.
 */
export function useStorePaths(host: string): {
  /** `'/sacola'` → o endereço certo para `<Link>` e `router.push`. */
  href: (path: string) => string;
  /** A rota da loja sem prefixo: `'/'`, `'/encomenda'`, `'/sacola'`… */
  route: string;
} {
  const pathname = usePathname();
  const prefix = `/loja/${host}`;
  const base = pathname.startsWith(prefix) ? prefix : '';
  const route = base ? pathname.slice(base.length) || '/' : pathname;

  const href = useCallback(
    (path: string) => (path === '/' ? base || '/' : `${base}${path}`),
    [base],
  );

  return { href, route };
}

export type StoreMode = 'now' | 'later';

/** Encomenda é `/encomenda`; todo o resto da vitrine é o "pedir agora". */
export function modeOf(route: string): StoreMode {
  return route.startsWith('/encomenda') ? 'later' : 'now';
}
