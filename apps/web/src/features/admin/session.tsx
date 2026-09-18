'use client';

import type { PlatformSession } from '@cantina/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { adminApi, readSession, writeSession, type AdminSession } from './api';

/**
 * Sessão da administração da plataforma.
 *
 * Muito menor que o provedor do painel, e de propósito: não há renovação de
 * token, nem cookie, nem redirecionamento automático. Uma ferramenta interna
 * usada algumas vezes por semana não precisa de sessão longa — precisa de
 * sessão curta.
 */

interface AdminSessionValue {
  session: AdminSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Context = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  // Começa carregando porque o `sessionStorage` só existe no cliente: no
  // primeiro render do servidor não há como saber se há sessão, e mostrar o
  // login antes de conferir faria a tela piscar a cada navegação.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(readSession());
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result: PlatformSession = await adminApi.login(email, password);
    const next = { accessToken: result.accessToken, user: result.user };
    writeSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, loading, login, logout }),
    [session, loading, login, logout],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const value = useContext(Context);
  if (!value) throw new Error('useAdminSession precisa estar dentro de <AdminSessionProvider>.');
  return value;
}
