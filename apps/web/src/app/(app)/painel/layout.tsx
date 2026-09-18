'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useSession } from '../../../components/auth-provider';
import { PanelShell } from '../../../components/layout/panel-shell';
import { Spinner } from '../../../components/ui/feedback';

/**
 * Guarda do painel.
 *
 * Isto é conveniência de navegação, não segurança: o que protege os dados é o
 * `requireAuth` da API e o RLS do banco. Um usuário sem sessão que forçasse a
 * rota veria uma casca vazia — toda requisição dela voltaria 401.
 */
export default function PainelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/entrar');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-muted">
        <Spinner size={24} />
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  return <PanelShell>{children}</PanelShell>;
}
