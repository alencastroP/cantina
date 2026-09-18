import type { Menu } from '@cantina/contracts';

import { MenuList } from '../../../features/storefront/menu-list';
import { serverFetch } from '../../../lib/api';

/**
 * Cardápio da loja.
 *
 * Renderizado no servidor com cache curto e invalidação por tag: quando o
 * estoque muda, o módulo de estoque invalida `menu:<host>` e a próxima visita
 * já vê a disponibilidade nova, sem esperar o TTL vencer.
 *
 * Os 30 segundos são a rede de segurança para a invalidação que não vier —
 * disponibilidade errada na vitrine vira pedido que o lojista não consegue
 * entregar.
 */
export default async function LojaPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;

  const menu = await serverFetch<Menu>('/storefront/menu?for=delivery', {
    tenantHost: host,
    revalidate: 30,
    tags: [`menu:${host}`],
  });

  return <MenuList menu={menu} />;
}
