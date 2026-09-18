import { domainError } from './errors';
import {
  roundCents,
  roundUnitCost,
  unitCostToCents,
  type Cents,
  type UnitCost,
} from './money';

/* -------------------------------------------------------------------------- */
/* Custo do insumo (D11)                                                       */
/* -------------------------------------------------------------------------- */

export interface PurchaseCostInput {
  /** Quantidade na unidade de compra. Ex.: 5 (sacos de 5 kg → 5). */
  purchaseQty: number;
  /** Unidades de uso por unidade de compra. Ex.: kg → g = 1000. */
  conversionFactor: number;
  /** Valor total pago pela compra, em centavos. */
  totalCents: Cents;
}

/**
 * Custo por unidade de uso de uma compra.
 *
 *   5 kg de farinha por R$ 50, usada em gramas
 *   → 5000 centavos / (5 × 1000 g) = 1 centavo por grama
 */
export function purchaseUnitCost({
  purchaseQty,
  conversionFactor,
  totalCents,
}: PurchaseCostInput): UnitCost {
  const usageQty = purchaseQty * conversionFactor;
  if (usageQty <= 0) {
    throw domainError('invalid_purchase', 'Quantidade da compra precisa ser maior que zero.');
  }
  return roundUnitCost(totalCents / usageQty);
}

export interface WeightedAverageInput {
  /** Saldo em estoque antes da compra, na unidade de uso. */
  currentQty: number;
  currentUnitCost: UnitCost;
  /** Quantidade que está entrando, na unidade de uso. */
  incomingQty: number;
  incomingUnitCost: UnitCost;
}

/**
 * Custo médio ponderado.
 *
 * Sem saldo anterior (ou com saldo negativo por ajuste pendente), o custo da
 * compra que entra passa a valer sozinho — ponderar sobre saldo inexistente
 * produziria um número sem significado.
 */
export function weightedAverageUnitCost({
  currentQty,
  currentUnitCost,
  incomingQty,
  incomingUnitCost,
}: WeightedAverageInput): UnitCost {
  if (incomingQty <= 0) {
    throw domainError('invalid_quantity', 'A entrada precisa ser maior que zero.');
  }
  if (currentQty <= 0) {
    return roundUnitCost(incomingUnitCost);
  }

  const total = currentQty * currentUnitCost + incomingQty * incomingUnitCost;
  return roundUnitCost(total / (currentQty + incomingQty));
}

/* -------------------------------------------------------------------------- */
/* Custo da ficha técnica                                                      */
/* -------------------------------------------------------------------------- */

export interface RecipeCostItem {
  supplyId: string;
  supplyName: string;
  /** Quantidade para o rendimento inteiro da receita, na unidade de uso. */
  qty: number;
  /** Perda esperada, 0-100. Farinha que fica na tigela, massa que sobra na forma. */
  wastePercent: number;
  unitCost: UnitCost;
}

export interface RecipeCostLine {
  supplyId: string;
  supplyName: string;
  effectiveQty: number;
  costCents: Cents;
  /** Fatia do custo total da receita, 0-100. Mostra onde o dinheiro está. */
  sharePercent: number;
}

export interface RecipeCostBreakdown {
  /** Custo de UMA unidade do produto. É este que congela no item do pedido. */
  unitCostCents: Cents;
  /** Custo do lote inteiro (rendimento). */
  batchCostCents: Cents;
  yieldQty: number;
  lines: RecipeCostLine[];
}

export function recipeCost(items: readonly RecipeCostItem[], yieldQty: number): RecipeCostBreakdown {
  if (yieldQty <= 0) {
    throw domainError('invalid_yield', 'O rendimento da receita precisa ser maior que zero.');
  }

  const lines = items.map<Omit<RecipeCostLine, 'sharePercent'>>((item) => {
    if (item.wastePercent < 0 || item.wastePercent >= 100) {
      throw domainError('invalid_waste', 'A perda precisa estar entre 0 e 100%.', {
        supplyId: item.supplyId,
      });
    }
    const effectiveQty = item.qty * (1 + item.wastePercent / 100);
    return {
      supplyId: item.supplyId,
      supplyName: item.supplyName,
      effectiveQty,
      costCents: unitCostToCents(item.unitCost, effectiveQty),
    };
  });

  const batchCostCents = lines.reduce((total, line) => total + line.costCents, 0);

  return {
    unitCostCents: roundCents(batchCostCents / yieldQty),
    batchCostCents,
    yieldQty,
    lines: lines.map((line) => ({
      ...line,
      sharePercent: batchCostCents === 0 ? 0 : (line.costCents / batchCostCents) * 100,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Margem por canal de venda (D13)                                             */
/* -------------------------------------------------------------------------- */

export interface SalesChannelFees {
  /** Comissão do canal, 0-100. iFood ~23%, vitrine própria 0%. */
  commissionPercent: number;
  /** Taxa da maquininha/gateway, 0-100. */
  paymentFeePercent: number;
  /** Taxa fixa por pedido, em centavos. */
  fixedFeeCents: Cents;
  /** Se o lojista banca o frete em vez de repassá-lo ao cliente. */
  absorbsDeliveryFee: boolean;
}

export interface MarginInput {
  priceCents: Cents;
  /** Custo do produto — de `recipeCost`, ou do custo congelado da venda. */
  unitCostCents: Cents;
  deliveryFeeCents?: Cents;
}

export interface MarginResult {
  priceCents: Cents;
  channelFeesCents: Cents;
  deliveryCostCents: Cents;
  netRevenueCents: Cents;
  unitCostCents: Cents;
  marginCents: Cents;
  /** Margem sobre a receita líquida, 0-100. */
  marginPercent: number;
  /** Markup sobre o custo, 0-∞. */
  markupPercent: number;
}

export function channelMargin(
  { priceCents, unitCostCents, deliveryFeeCents = 0 }: MarginInput,
  channel: SalesChannelFees,
): MarginResult {
  const rate = (channel.commissionPercent + channel.paymentFeePercent) / 100;
  if (rate >= 1) {
    throw domainError('invalid_channel_fees', 'As taxas do canal somam 100% ou mais.');
  }

  const channelFeesCents = roundCents(priceCents * rate) + channel.fixedFeeCents;
  const deliveryCostCents = channel.absorbsDeliveryFee ? deliveryFeeCents : 0;
  const netRevenueCents = priceCents - channelFeesCents - deliveryCostCents;
  const marginCents = netRevenueCents - unitCostCents;

  return {
    priceCents,
    channelFeesCents,
    deliveryCostCents,
    netRevenueCents,
    unitCostCents,
    marginCents,
    marginPercent: netRevenueCents === 0 ? 0 : (marginCents / netRevenueCents) * 100,
    markupPercent: unitCostCents === 0 ? 0 : (marginCents / unitCostCents) * 100,
  };
}

/**
 * Preço que atinge uma margem-alvo naquele canal.
 * É a pergunta que o lojista realmente faz: "por quanto eu preciso vender
 * no iFood pra ganhar o mesmo que ganho no balcão?".
 */
export function priceForTargetMargin(
  unitCostCents: Cents,
  targetMarginPercent: number,
  channel: SalesChannelFees,
  deliveryFeeCents = 0,
): Cents {
  if (targetMarginPercent >= 100) {
    throw domainError('invalid_target_margin', 'A margem-alvo precisa ser menor que 100%.');
  }
  const rate = (channel.commissionPercent + channel.paymentFeePercent) / 100;
  if (rate >= 1) {
    throw domainError('invalid_channel_fees', 'As taxas do canal somam 100% ou mais.');
  }

  const requiredNet = unitCostCents / (1 - targetMarginPercent / 100);
  const deliveryCost = channel.absorbsDeliveryFee ? deliveryFeeCents : 0;

  return roundCents((requiredNet + channel.fixedFeeCents + deliveryCost) / (1 - rate));
}
