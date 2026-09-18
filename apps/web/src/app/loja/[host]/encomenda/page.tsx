import type { Menu, StorefrontConfig } from '@cantina/contracts';

import { PreorderFlow } from '../../../../features/storefront/preorder-flow';
import { serverFetch } from '../../../../lib/api';

export const metadata = { title: 'Encomendar' };

/**
 * Encomenda na vitrine.
 *
 * O cardápio vem filtrado por `for=preorder`: produtos marcados como
 * exclusivos de delivery não aparecem aqui, e o contrário também vale.
 */
export default async function EncomendaPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;

  const [config, menu] = await Promise.all([
    serverFetch<StorefrontConfig>('/storefront/config', {
      tenantHost: host,
      revalidate: 60,
      tags: [`storefront:${host}`],
    }),
    serverFetch<Menu>('/storefront/menu?for=preorder', {
      tenantHost: host,
      revalidate: 30,
      tags: [`menu:${host}`],
    }),
  ]);

  return <PreorderFlow host={host} config={config} menu={menu} />;
}
