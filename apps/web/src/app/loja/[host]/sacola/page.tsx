import type { DeliveryZonePublic, StorefrontConfig } from '@cantina/contracts';

import { Checkout } from '../../../../features/storefront/checkout';
import { serverFetch } from '../../../../lib/api';

export const metadata = { title: 'Sacola' };

/**
 * Sacola.
 *
 * A configuração vem do servidor (formas de pagamento aceitas, mínimo, se a
 * loja entrega) junto com os bairros atendidos, que viram atalhos no campo de
 * bairro; o carrinho e o envio são do browser, onde o carrinho vive.
 */
export default async function SacolaPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;

  const [config, zones] = await Promise.all([
    serverFetch<StorefrontConfig>('/storefront/config', {
      tenantHost: host,
      revalidate: 60,
      tags: [`storefront:${host}`],
    }),
    serverFetch<DeliveryZonePublic[]>('/storefront/delivery-zones', {
      tenantHost: host,
      revalidate: 60,
      tags: [`storefront:${host}`],
    }).catch((): DeliveryZonePublic[] => []),
  ]);

  return <Checkout host={host} config={config} zones={zones} />;
}
