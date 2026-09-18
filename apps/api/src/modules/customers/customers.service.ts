import type {
  AnonymizeCustomerRequest,
  CreateAddressRequest,
  CreateCustomerRequest,
  Customer,
  CustomerAddress,
  CustomerDetail,
  CustomerOrder,
  ListCustomersQuery,
  Page,
  UpdateAddressRequest,
  UpdateCustomerRequest,
} from '@cantina/contracts';
import type { Transaction } from '@cantina/db';

import { conflict, forbidden, notFound } from '../../http/errors/app-error';
import { recordAudit } from '../../shared/audit';
import { isUniqueViolation } from '../../shared/db-errors';
import * as repository from './customers.repository';

/**
 * Clientes do lojista (§6.3 do PLAN.md).
 *
 * D4: sem login, telefone como chave natural. `findOrCreate` é a porta que o
 * checkout da vitrine vai usar — por isso ela mora aqui e não no módulo 8.
 */

function toCustomer(row: repository.CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    ordersCount: row.ordersCount,
    totalSpentCents: row.totalSpentCents,
    firstOrderAt: row.firstOrderAt?.toISOString() ?? null,
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    anonymizedAt: row.anonymizedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAddress(row: repository.AddressRow): CustomerAddress {
  return {
    id: row.id,
    label: row.label,
    street: row.street,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    zip: row.zip,
    reference: row.reference,
    isDefault: row.isDefault,
  };
}

async function loadOrThrow(tx: Transaction, customerId: string) {
  const customer = await repository.findCustomerById(tx, customerId);
  if (!customer) throw notFound('Cliente não encontrado.');
  return customer;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                     */
/* -------------------------------------------------------------------------- */

export async function list(
  tx: Transaction,
  query: ListCustomersQuery,
): Promise<Page<Customer>> {
  const rows = await repository.listCustomers(tx, {
    cursor: query.cursor,
    limit: query.limit + 1,
    q: query.q,
    recent: query.recent,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map(toCustomer);

  // A ordenação por atividade não pagina por cursor (a ordem não é o id).
  const nextCursor = query.recent ? null : hasMore ? (items.at(-1)?.id ?? null) : null;

  return { items, nextCursor };
}

export async function get(tx: Transaction, customerId: string): Promise<CustomerDetail> {
  const customer = await loadOrThrow(tx, customerId);
  const addresses = await repository.listAddresses(tx, customerId);
  return { ...toCustomer(customer), addresses: addresses.map(toAddress) };
}

export async function listOrders(
  tx: Transaction,
  customerId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<Page<CustomerOrder>> {
  await loadOrThrow(tx, customerId);

  const rows = await repository.listCustomerOrders(tx, customerId, {
    cursor: query.cursor,
    limit: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map<CustomerOrder>((row) => ({
    id: row.id,
    kind: row.kind === 'preorder' ? 'preorder' : 'delivery',
    code: row.code,
    status: row.status,
    fulfillment: row.fulfillment,
    paymentStatus: row.paymentStatus,
    totalCents: row.totalCents,
    placedAt: row.placedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    dueDate: row.dueDate,
  }));

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

export async function create(
  tx: Transaction,
  tenantId: string,
  input: CreateCustomerRequest,
): Promise<CustomerDetail> {
  try {
    const created = await repository.insertCustomer(tx, {
      tenantId,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      notes: input.notes ?? null,
    });

    await recordAudit(tx, {
      tenantId,
      action: 'customer.created',
      entityType: 'customer',
      entityId: created.id,
      after: { name: created.name },
    });

    return get(tx, created.id);
  } catch (error) {
    if (isUniqueViolation(error, 'customers_tenant_phone_uq')) {
      // Devolve o id junto: quem está atendendo quer ir para o cadastro que
      // já existe, não receber um erro e procurar de novo.
      const existing = await repository.findCustomerByPhone(tx, input.phone);
      throw conflict('Já existe um cliente com este telefone.', {
        phone: input.phone,
        customerId: existing?.id ?? null,
      });
    }
    throw error;
  }
}

/**
 * Find-or-create por telefone — a porta do checkout da vitrine (D4).
 *
 * Atualiza o nome quando o cliente digita um diferente: quem pede é a pessoa
 * na frente do celular, e o nome mais recente é o mais provável de estar
 * certo. Não sobrescreve com vazio.
 */
export async function findOrCreate(
  tx: Transaction,
  tenantId: string,
  input: { name: string; phone: string; email?: string | null },
): Promise<repository.CustomerRow> {
  const existing = await repository.findCustomerByPhone(tx, input.phone);

  if (existing) {
    const patch: Partial<repository.CustomerRow> = {};
    if (input.name && input.name !== existing.name) patch.name = input.name;
    if (input.email && input.email !== existing.email) patch.email = input.email;

    if (Object.keys(patch).length > 0) {
      const updated = await repository.updateCustomer(tx, existing.id, patch);
      return updated ?? existing;
    }
    return existing;
  }

  return repository.insertCustomer(tx, {
    tenantId,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
  });
}

export async function update(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  patch: UpdateCustomerRequest,
): Promise<CustomerDetail> {
  const before = await loadOrThrow(tx, customerId);

  if (before.anonymizedAt) {
    throw forbidden('Este cliente foi anonimizado e não pode ser editado.');
  }

  try {
    const updated = await repository.updateCustomer(tx, customerId, patch);
    if (!updated) throw notFound('Cliente não encontrado.');

    await recordAudit(tx, {
      tenantId,
      action: 'customer.updated',
      entityType: 'customer',
      entityId: customerId,
      before: { name: before.name, phone: before.phone, email: before.email },
      after: { name: updated.name, phone: updated.phone, email: updated.email },
    });

    return get(tx, customerId);
  } catch (error) {
    if (isUniqueViolation(error, 'customers_tenant_phone_uq')) {
      throw conflict('Já existe outro cliente com este telefone.');
    }
    throw error;
  }
}

export async function remove(
  tx: Transaction,
  tenantId: string,
  customerId: string,
): Promise<void> {
  const customer = await loadOrThrow(tx, customerId);

  await repository.softDeleteCustomer(tx, customerId);

  await recordAudit(tx, {
    tenantId,
    action: 'customer.removed',
    entityType: 'customer',
    entityId: customerId,
    before: { name: customer.name },
  });
}

/* -------------------------------------------------------------------------- */
/* Estatísticas (chamada pelos kanbans)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Recalcula os agregados do cliente a partir dos pedidos.
 *
 * Módulos 6 e 7 chamam depois de qualquer mudança de status. Recomputar em
 * vez de incrementar elimina drift por cancelamento ou correção de valor —
 * ver a justificativa em `computeCustomerStats`.
 */
export async function refreshStats(tx: Transaction, customerId: string): Promise<void> {
  const stats = await repository.computeCustomerStats(tx, customerId);
  await repository.saveCustomerStats(tx, customerId, stats);
}

/* -------------------------------------------------------------------------- */
/* LGPD (D24)                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Anonimiza em vez de excluir.
 *
 * O pedido precisa sobreviver para o histórico financeiro fechar, e ele já
 * guarda `customer_name_snapshot` do momento da venda. O que some é o
 * cadastro: nome, telefone, e-mail, observações e endereços.
 *
 * O telefone vira um marcador único (`anon:<id>`) porque a coluna é NOT NULL
 * e tem índice único — zerá-la quebraria a chave natural, e repetir um valor
 * fixo impediria anonimizar o segundo cliente.
 */
export async function anonymize(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  input: AnonymizeCustomerRequest,
): Promise<Customer> {
  const customer = await loadOrThrow(tx, customerId);

  if (customer.anonymizedAt) {
    throw conflict('Este cliente já foi anonimizado.');
  }

  const now = new Date();
  const addressesRemoved = await repository.anonymizeAddresses(tx, customerId);

  const updated = await repository.updateCustomer(tx, customerId, {
    name: 'Cliente anonimizado',
    phone: `anon:${customerId}`,
    email: null,
    notes: null,
    anonymizedAt: now,
  });
  if (!updated) throw notFound('Cliente não encontrado.');

  await recordAudit(tx, {
    tenantId,
    action: 'customer.anonymized',
    entityType: 'customer',
    entityId: customerId,
    // O `before` do log NÃO recebe os dados pessoais: gravá-los ali
    // recriaria exatamente o que a anonimização veio apagar.
    before: { hadEmail: customer.email !== null, addresses: addressesRemoved },
    after: { anonymizedAt: now.toISOString(), reason: input.reason ?? null },
  });

  return toCustomer(updated);
}

/* -------------------------------------------------------------------------- */
/* Endereços                                                                   */
/* -------------------------------------------------------------------------- */

export async function listAddresses(
  tx: Transaction,
  customerId: string,
): Promise<CustomerAddress[]> {
  await loadOrThrow(tx, customerId);
  const rows = await repository.listAddresses(tx, customerId);
  return rows.map(toAddress);
}

export async function createAddress(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  input: CreateAddressRequest,
): Promise<CustomerAddress> {
  await loadOrThrow(tx, customerId);

  const existing = await repository.listAddresses(tx, customerId);
  // O primeiro endereço é o padrão por definição — pedir que o lojista marque
  // seria uma escolha sem alternativa.
  const isDefault = input.isDefault || existing.length === 0;

  const created = await repository.insertAddress(tx, {
    tenantId,
    customerId,
    label: input.label ?? null,
    street: input.street,
    number: input.number ?? null,
    complement: input.complement ?? null,
    neighborhood: input.neighborhood ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    reference: input.reference ?? null,
    isDefault,
  });

  if (isDefault) {
    await repository.clearDefaultAddress(tx, customerId, created.id);
  }

  await recordAudit(tx, {
    tenantId,
    action: 'customer.address_added',
    entityType: 'customer',
    entityId: customerId,
    after: { addressId: created.id },
  });

  return toAddress(created);
}

export async function updateAddress(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  addressId: string,
  patch: UpdateAddressRequest,
): Promise<CustomerAddress> {
  await loadOrThrow(tx, customerId);

  const before = await repository.findAddressById(tx, addressId);
  if (!before || before.customerId !== customerId) {
    throw notFound('Endereço não encontrado.');
  }

  const updated = await repository.updateAddress(tx, addressId, patch);
  if (!updated) throw notFound('Endereço não encontrado.');

  if (patch.isDefault === true) {
    await repository.clearDefaultAddress(tx, customerId, addressId);
  }

  await recordAudit(tx, {
    tenantId,
    action: 'customer.address_updated',
    entityType: 'customer',
    entityId: customerId,
    after: { addressId },
  });

  return toAddress(updated);
}

export async function removeAddress(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  addressId: string,
): Promise<void> {
  await loadOrThrow(tx, customerId);

  const address = await repository.findAddressById(tx, addressId);
  if (!address || address.customerId !== customerId) {
    throw notFound('Endereço não encontrado.');
  }

  await repository.softDeleteAddress(tx, addressId);

  // O padrão não pode simplesmente sumir: promove o endereço mais recente.
  if (address.isDefault) {
    const remaining = await repository.listAddresses(tx, customerId);
    const next = remaining[0];
    if (next) await repository.updateAddress(tx, next.id, { isDefault: true });
  }

  await recordAudit(tx, {
    tenantId,
    action: 'customer.address_removed',
    entityType: 'customer',
    entityId: customerId,
    before: { addressId },
  });
}
