import type { PlatformRole, UserRole } from '@cantina/contracts';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';
  timeZone: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  scope: 'tenant' | 'platform';
}

/** Sessão do administrador da plataforma. Não tem tenant — é o ponto (D5). */
export interface PlatformContext {
  userId: string;
  role: PlatformRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Definido por `resolveTenantByHost` ou por `requireAuth`. */
      tenant?: ResolvedTenant;
      /** Definido por `requireAuth`. Ausente = requisição pública. */
      auth?: AuthContext;
      /** Definido por `requirePlatformAuth`. Nunca coexiste com `auth`. */
      platform?: PlatformContext;
    }
  }
}
