import type { ReactNode } from 'react';

import { AuthProvider } from '../../components/auth-provider';

/**
 * Grupo de rotas autenticadas (`/entrar`, `/painel`).
 *
 * O provedor de sessão fica AQUI, e não no layout raiz, porque a vitrine é
 * pública: envolvê-la faria toda visita de cliente disparar um `/auth/refresh`
 * antes de mostrar o cardápio.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
