import { integer, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Colunas reutilizadas em todo o schema.
 *
 * Este arquivo NÃO importa nenhuma tabela — é o que quebra o ciclo entre
 * `_tenant.ts` (que precisa referenciar `tenants`) e os módulos de schema.
 */

/** UUID v7: ordenável no tempo, seguro de expor em URL pública (P4). */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const deletedAt = () => timestamp('deleted_at', { withTimezone: true, mode: 'date' });

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Dinheiro exibido/cobrado: inteiro em centavos (P3, invariante 8). */
export const money = (name: string) => integer(name).notNull().default(0);

export const nullableMoney = (name: string) => integer(name);

/** Quantidade física de estoque ou de receita, na unidade de uso. */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 4, mode: 'number' });

/**
 * Custo por unidade de uso, em centavos FRACIONÁRIOS.
 * 1 g de farinha custa 0,2 centavo — inteiro não serve aqui.
 */
export const unitCost = (name: string) =>
  numeric(name, { precision: 16, scale: 6, mode: 'number' });

/** Percentual 0-100 com três casas (comissão de marketplace, perda de receita). */
export const percent = (name: string) => numeric(name, { precision: 6, scale: 3, mode: 'number' });

/** Telefone em E.164 — chave natural do cliente final (D4). */
export const phone = (name: string) => text(name);
