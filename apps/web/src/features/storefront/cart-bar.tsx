'use client';

import { BasketIcon } from '../../components/layout/icons';
import { formatCents } from '../../lib/format';
import { useCart } from './cart';
import { FloatingBar } from './floating-bar';
import { useStorePaths } from './store-paths';

/**
 * Sacola flutuante do "pedir agora".
 *
 * Só aparece no cardápio de hoje. Na encomenda ela seria um segundo carrinho
 * na mesma tela — exatamente a confusão que os dois modos existem para evitar
 * (lá, quem lembra da sacola é o selo "3 na sacola" no cartão "Pedir agora").
 * Na sacola e no acompanhamento, levaria para onde a pessoa já está.
 *
 * Com pedido mínimo, a linha fina da pílula enche até ele e o texto diz
 * quanto falta: melhor descobrir aqui do que com o botão de enviar apagado.
 */
export function CartBar({ host, minOrderCents }: { host: string; minOrderCents: number }) {
  const { count, subtotalCents, ready } = useCart();
  const { href, route } = useStorePaths(host);

  if (!ready || count === 0 || route !== '/') return null;

  const missing = Math.max(0, minOrderCents - subtotalCents);

  return (
    <FloatingBar
      href={href('/sacola')}
      icon={<BasketIcon size={21} />}
      count={count}
      title="Ver sacola"
      subtitle={
        missing > 0
          ? `Faltam ${formatCents(missing)} para o pedido mínimo`
          : `${count === 1 ? '1 item' : `${count} itens`} · pedido para hoje`
      }
      amount={formatCents(subtotalCents)}
      {...(minOrderCents > 0 ? { progress: subtotalCents / minOrderCents } : {})}
    />
  );
}
