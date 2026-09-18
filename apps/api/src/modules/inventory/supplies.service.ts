import type {
  CreateSupplierRequest,
  CreateSupplyRequest,
  ListSuppliesQuery,
  Page,
  Supplier,
  Supply,
  UpdateSupplierRequest,
  UpdateSupplyRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';
import { availableQty } from '@cantina/domain';

import { conflict, notFound } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as repository from './supplies.repository';

/** Insumos e fornecedores (§6.5 do PLAN.md). */

function toSupply(row: repository.SupplyWithBalance): Supply {
  const balance = { qtyOnHand: row.qtyOnHand, qtyReserved: row.qtyReserved };

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    usageUnit: row.usageUnit,
    avgUnitCost: row.avgUnitCost,
    minStockQty: row.minStockQty,
    qtyOnHand: row.qtyOnHand,
    qtyReserved: row.qtyReserved,
    qtyAvailable: availableQty(balance),
    isLow: row.minStockQty > 0 && row.qtyOnHand <= row.minStockQty,
    active: row.active,
  };
}

export async function list(tx: Transaction, query: ListSuppliesQuery): Promise<Page<Supply>> {
  const rows = await repository.listSupplies(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    type: query.type,
    active: query.active,
    lowOnly: query.lowOnly,
    q: query.q,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toSupply);

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function get(tx: Transaction, supplyId: string): Promise<Supply> {
  const row = await repository.findSupplyById(tx, supplyId);
  if (!row) throw notFound('Insumo não encontrado.');
  return toSupply(row);
}

export async function lowStock(tx: Transaction): Promise<Supply[]> {
  const rows = await repository.findLowStockSupplies(tx);
  return rows.map(toSupply);
}

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateSupplyRequest,
): Promise<Supply> {
  try {
    const created = await repository.insertSupply(tx, {
      tenantId,
      name: input.name,
      type: input.type,
      usageUnit: input.usageUnit,
      minStockQty: input.minStockQty,
      active: input.active,
      // Custo nasce zerado: quem o define é a primeira compra (D11).
      avgUnitCost: 0,
    });

    await recordAudit(tx, {
      tenantId,
      action: 'supply.created',
      entityType: 'supply',
      entityId: created.id,
      after: { name: created.name, usageUnit: created.usageUnit },
    });

    return get(tx, created.id);
  } catch (error) {
    if (isUniqueViolation(error, 'supplies_tenant_name_uq')) {
      throw conflict('Já existe um insumo com este nome.', { name: input.name });
    }
    throw error;
  }
}

export async function update(
  tx: Transaction,
  tenantId: string,
  supplyId: string,
  patch: UpdateSupplyRequest,
): Promise<Supply> {
  const before = await repository.findSupplyById(tx, supplyId);
  if (!before) throw notFound('Insumo não encontrado.');

  /**
   * `usageUnit` não é editável, e isso é deliberado.
   *
   * Trocar grama por mililitro reinterpreta todo o histórico de compras, o
   * custo médio e as quantidades das receitas de uma vez — sem nenhuma
   * conversão possível, porque o número gravado não diz qual era a unidade
   * quando foi gravado. O caminho correto é criar um insumo novo.
   */
  const values: Parameters<typeof repository.updateSupply>[2] = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.minStockQty !== undefined) values.minStockQty = patch.minStockQty;
  if (patch.active !== undefined) values.active = patch.active;

  try {
    const updated = await repository.updateSupply(tx, supplyId, values);
    if (!updated) throw notFound('Insumo não encontrado.');

    await recordAudit(tx, {
      tenantId,
      action: 'supply.updated',
      entityType: 'supply',
      entityId: supplyId,
      before: { name: before.name, minStockQty: before.minStockQty, active: before.active },
      after: { name: updated.name, minStockQty: updated.minStockQty, active: updated.active },
    });

    return get(tx, supplyId);
  } catch (error) {
    if (isUniqueViolation(error, 'supplies_tenant_name_uq')) {
      throw conflict('Já existe um insumo com este nome.');
    }
    throw error;
  }
}

export async function remove(
  tx: Transaction,
  tenantId: string,
  supplyId: string,
): Promise<void> {
  const supply = await repository.findSupplyById(tx, supplyId);
  if (!supply) throw notFound('Insumo não encontrado.');

  // Remover um insumo usado em receita zeraria o custo daqueles produtos sem
  // nenhum aviso — a margem passaria a mentir para cima.
  const usages = await repository.countRecipeUsages(tx, supplyId);
  if (usages > 0) {
    throw conflict(
      `Este insumo está em ${usages} ficha(s) técnica(s). Remova-o das receitas antes.`,
      { recipeUsages: usages },
    );
  }

  await repository.softDeleteSupply(tx, supplyId);

  await recordAudit(tx, {
    tenantId,
    action: 'supply.removed',
    entityType: 'supply',
    entityId: supplyId,
    before: { name: supply.name, qtyOnHand: supply.qtyOnHand },
  });
}

/* -------------------------------------------------------------------------- */
/* Fornecedores                                                                */
/* -------------------------------------------------------------------------- */

function toSupplier(row: repository.SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    active: row.active,
  };
}

export async function listSuppliers(
  tx: Transaction,
  query: { cursor?: string | undefined; limit: number; active?: boolean | undefined },
): Promise<Page<Supplier>> {
  const rows = await repository.listSuppliers(tx, { ...query, limit: query.limit + 1 });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toSupplier);

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function createSupplier(
  tx: Transaction,
  tenantId: string,
  input: CreateSupplierRequest,
): Promise<Supplier> {
  const created = await repository.insertSupplier(tx, {
    tenantId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
    active: input.active,
  });

  await recordAudit(tx, {
    tenantId,
    action: 'supplier.created',
    entityType: 'supplier',
    entityId: created.id,
    after: { name: created.name },
  });

  return toSupplier(created);
}

export async function updateSupplier(
  tx: Transaction,
  tenantId: string,
  supplierId: string,
  patch: UpdateSupplierRequest,
): Promise<Supplier> {
  const before = await repository.findSupplierById(tx, supplierId);
  if (!before) throw notFound('Fornecedor não encontrado.');

  const updated = await repository.updateSupplier(tx, supplierId, patch);
  if (!updated) throw notFound('Fornecedor não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'supplier.updated',
    entityType: 'supplier',
    entityId: supplierId,
    before: { name: before.name, active: before.active },
    after: { name: updated.name, active: updated.active },
  });

  return toSupplier(updated);
}

/**
 * Fornecedor é removido logicamente e as compras antigas continuam
 * apontando para ele — o histórico de "quanto paguei e a quem" é a base do
 * custo médio e não pode perder a referência.
 */
export async function removeSupplier(
  tx: Transaction,
  tenantId: string,
  supplierId: string,
): Promise<void> {
  const supplier = await repository.findSupplierById(tx, supplierId);
  if (!supplier) throw notFound('Fornecedor não encontrado.');

  await repository.softDeleteSupplier(tx, supplierId);

  await recordAudit(tx, {
    tenantId,
    action: 'supplier.removed',
    entityType: 'supplier',
    entityId: supplierId,
    before: { name: supplier.name },
  });
}
