'use client';

import type { AuthTenant, AuthUser, LoginResponse, MeResponse } from '@cantina/contracts';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, setAccessToken } from '../lib/api';

/**
 * Sessão do painel.
 *
 * O access token não sobrevive a um reload por decisão (ele vive em memória,
 * fora do alcance de qualquer script). Então o app começa em `loading` e
 * troca o cookie de refresh por um token novo — é esse o único momento em que
 * a tela pisca antes de decidir se há sessão.
 */

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface SessionValue {
  status: SessionStatus;
  user: AuthUser | null;
  tenant: AuthTenant | null;
  login: (input: { email: string; password: string; tenantSlug?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const renewed = await api.refresh();
      if (!alive) return;

      if (!renewed) {
        setStatus('anonymous');
        return;
      }

      try {
        const me = await api.get<MeResponse>('/auth/me');
        if (!alive) return;
        setUser(me.user);
        setTenant(me.tenant);
        setStatus('authenticated');
      } catch {
        if (alive) setStatus('anonymous');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback<SessionValue['login']>(async (input) => {
    const session = await api.post<LoginResponse>('/auth/login', input);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setTenant(session.tenant);
    setStatus('authenticated');
  }, []);

  const logout = useCallback<SessionValue['logout']>(async () => {
    // A falha do logout não pode prender o usuário na sessão: o estado local
    // é limpo de qualquer jeito, e o refresh no servidor expira sozinho.
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setTenant(null);
    setStatus('anonymous');
    router.replace('/entrar');
  }, [router]);

  const value = useMemo<SessionValue>(
    () => ({ status, user, tenant, login, logout }),
    [status, user, tenant, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession precisa estar dentro de <AuthProvider>.');
  }
  return context;
}
