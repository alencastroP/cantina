/**
 * WhatsApp (D7).
 *
 * v1: apenas link `wa.me` com a mensagem pré-montada. Sem API oficial, sem
 * credencial, sem custo — e cobre o fluxo que o lojista já usa hoje.
 *
 * A porta existe para que trocar por Cloud API depois seja implementar
 * `sendMessage` sem tocar nos módulos que só precisam do link.
 */

export interface WhatsAppProvider {
  /** Link que abre a conversa com a mensagem escrita. */
  buildLink(input: { phone: string; message: string }): string;
  /** Envio ativo. Só a Cloud API implementa — o link não notifica ninguém. */
  sendMessage?(input: { phone: string; message: string }): Promise<void>;
}

/** Normaliza para o formato que o wa.me espera: dígitos, com DDI, sem "+". */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export const waLinkProvider: WhatsAppProvider = {
  buildLink({ phone, message }) {
    const number = toWhatsAppNumber(phone);
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  },
};

export interface OrderMessageItem {
  qty: number;
  productName: string;
  variantName?: string | null;
  totalCents: number;
  notes?: string | null;
}

export interface OrderMessageInput {
  storeName: string;
  /** Presente quando `whatsapp_mode = 'persist'` — o pedido já existe (D7). */
  orderCode?: number | null;
  customerName: string;
  items: OrderMessageItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  fulfillment: 'delivery' | 'pickup';
  address?: string | null;
  paymentMethodLabel?: string | null;
  /** Data combinada, no caso de encomenda. */
  dueDate?: string | null;
  notes?: string | null;
}

const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/**
 * Mensagem do pedido.
 *
 * Formatada para ser lida no celular do lojista, não para ser bonita: uma
 * linha por item, totais no fim, e o código do pedido no topo quando existe —
 * é por ele que o lojista acha o pedido no kanban.
 */
export function formatOrderMessage(input: OrderMessageInput): string {
  const lines: string[] = [];

  lines.push(input.orderCode ? `*Pedido #${input.orderCode}* — ${input.storeName}` : `*Novo pedido* — ${input.storeName}`);
  lines.push(`Cliente: ${input.customerName}`);
  if (input.dueDate) lines.push(`Para: ${input.dueDate}`);
  lines.push('');

  for (const item of input.items) {
    const name = item.variantName ? `${item.productName} (${item.variantName})` : item.productName;
    lines.push(`${item.qty}x ${name} — ${brl(item.totalCents)}`);
    if (item.notes) lines.push(`   obs: ${item.notes}`);
  }

  lines.push('');
  lines.push(`Subtotal: ${brl(input.subtotalCents)}`);
  if (input.deliveryFeeCents > 0) lines.push(`Entrega: ${brl(input.deliveryFeeCents)}`);
  lines.push(`*Total: ${brl(input.totalCents)}*`);

  lines.push('');
  lines.push(input.fulfillment === 'pickup' ? 'Retirada no local' : `Entrega: ${input.address ?? 'a combinar'}`);
  if (input.paymentMethodLabel) lines.push(`Pagamento: ${input.paymentMethodLabel}`);
  if (input.notes) lines.push(`Observações: ${input.notes}`);

  return lines.join('\n');
}
