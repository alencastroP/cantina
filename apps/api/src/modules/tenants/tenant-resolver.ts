import { and, eq, isNull } from 'drizzle-orm';

import { tenantDomains, tenants } from '@cantina/db';

import { platformDb } from '../../db';
import type { ResolvedTenant } from '../../types/express';

/**
 * Resolução de tenant por host (D2).
 *
 * Roda ANTES de existir contexto de tenant — é a única consulta do caminho
 * de vitrine que usa a conexão de plataforma, e é por isso que
 * `tenant_domains` fica fora do RLS (ver `PLATFORM_TABLES`).
 *
 * Cache em memória com TTL curto: a vitrine é a rota mais chamada do sistema
 * e este lookup precederia toda requisição. O TTL de 60s é o teto do atraso
 * para uma mudança de domínio ou uma suspensão de assinatura entrar em vigor;
 * `invalidateTenantCache` encurta isso quando a mudança parte daqui.
 */

const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 10_000;

interface CacheEntry {
  tenant: ResolvedTenant | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function normalizeHostname(host: string | undefined): string | null {
  if (!host) return null;
  const withoutPort = host.split(':')[0]?.trim().toLowerCase();
  return withoutPort && withoutPort.length > 0 ? withoutPort : null;
}

async function query(hostname: string): Promise<ResolvedTenant | null> {
  const rows = await platformDb.db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      timeZone: tenants.timeZone,
    })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
    .where(and(eq(tenantDomains.hostname, hostname), isNull(tenants.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}

export async function findTenantByHost(host: string | undefined): Promise<ResolvedTenant | null> {
  const hostname = normalizeHostname(host);
  if (!hostname) return null;

  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const tenant = await query(hostname);

  cache.set(hostname, {
    tenant,
    // Host inexistente é cacheado por menos tempo: pode ser um domínio
    // recém-apontado que ainda vai ser cadastrado.
    expiresAt: Date.now() + (tenant ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });

  return tenant;
}

export function invalidateTenantCache(hostname?: string): void {
  if (hostname) {
    const normalized = normalizeHostname(hostname);
    if (normalized) cache.delete(normalized);
    return;
  }
  cache.clear();
  byIdCache.clear();
}

/* -------------------------------------------------------------------------- */
/* Por id — caminho do painel, onde o tenant vem do token                      */
/* -------------------------------------------------------------------------- */

const byIdCache = new Map<string, CacheEntry>();

export async function findTenantById(tenantId: string): Promise<ResolvedTenant | null> {
  const cached = byIdCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const rows = await platformDb.db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      timeZone: tenants.timeZone,
    })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
    .limit(1);

  const tenant = rows[0] ?? null;
  byIdCache.set(tenantId, {
    tenant,
    expiresAt: Date.now() + (tenant ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
  });

  return tenant;
}

export async function findTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  const rows = await platformDb.db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      timeZone: tenants.timeZone,
    })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), isNull(tenants.deletedAt)))
    .limit(1);

  return rows[0] ?? null;
}
