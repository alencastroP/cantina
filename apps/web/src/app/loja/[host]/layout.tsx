import type { DeliveryZonePublic, StorefrontConfig } from '@cantina/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { CartProvider } from '../../../features/storefront/cart';
import { storeNow } from '../../../features/storefront/hours';
import { StoreShell } from '../../../features/storefront/store-shell';
import { ApiError, serverFetch } from '../../../lib/api';

/**
 * Casca da vitrine — dados no servidor, apresentação em `StoreShell`.
 *
 * Renderizada no servidor (D16): o `host` vem do segmento de rota criado pelo
 * middleware e segue para a API em `X-Tenant-Host`. O cliente nunca precisa
 * saber que existe multi-tenancy.
 *
 * Cache por tag `storefront:<host>`: quando a loja muda horário, nome ou
 * bairros, o módulo de configuração invalida essa tag e a próxima visita já
 * vê o novo.
 */

async function loadConfig(host: string): Promise<StorefrontConfig> {
  try {
    return await serverFetch<StorefrontConfig>('/storefront/config', {
      tenantHost: host,
      revalidate: 60,
      tags: [`storefront:${host}`],
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 503)) {
      notFound();
    }
    throw error;
  }
}

/**
 * Bairros atendidos — alimentam "entrega a partir de R$ 5", a lista de
 * bairros na folha de horários e as sugestões do campo de bairro. Sem eles a
 * vitrine funciona igual, só com menos dicas: falha aqui não derruba a loja.
 */
async function loadZones(host: string): Promise<DeliveryZonePublic[]> {
  try {
    return await serverFetch<DeliveryZonePublic[]>('/storefront/delivery-zones', {
      tenantHost: host,
      revalidate: 60,
      tags: [`storefront:${host}`],
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string }>;
}): Promise<Metadata> {
  const { host } = await params;

  try {
    const config = await loadConfig(host);
    return {
      title: { absolute: config.name },
      description: config.about ?? `Peça online na ${config.name}.`,
    };
  } catch {
    return { title: 'Loja' };
  }
}

export default async function LojaLayout({
  params,
  children,
}: {
  params: Promise<{ host: string }>;
  children: ReactNode;
}) {
  const { host } = await params;
  const [config, zones] = await Promise.all([loadConfig(host), loadZones(host)]);
  const now = storeNow(config);

  return (
    <CartProvider host={host}>
      <StoreShell
        host={host}
        config={config}
        zones={zones}
        openingHint={now.hint}
        today={now.weekday}
      >
        {children}
      </StoreShell>
    </CartProvider>
  );
}
