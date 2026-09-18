import { boolean, date, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { primaryId, timestamps } from './_columns';
import { tenantId } from './_tenant';

/**
 * Agenda de encomendas (§4.9 do PLAN.md, D10).
 *
 * Desvio consciente do plano: o `cutoff_time` da regra semanal foi removido.
 * `preorder_lead_time_hours` em `tenant_settings` cobre o mesmo caso de forma
 * mais geral ("48h de antecedência" em vez de "até as 18h de véspera") e é
 * mais fácil de explicar ao lojista. Uma coluna que não é aplicada em lugar
 * nenhum é pior que a ausência dela.
 */

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: primaryId(),
    tenantId: tenantId(),
    /** 0 = domingo … 6 = sábado. */
    weekday: integer('weekday').notNull(),
    isOpen: boolean('is_open').notNull().default(false),
    /** Encomendas aceitas neste dia da semana. */
    capacity: integer('capacity').notNull().default(0),
    ...timestamps(),
  },
  (table) => [uniqueIndex('availability_rules_uq').on(table.tenantId, table.weekday)],
);

/** Feriado, férias, ou um mutirão que abre um dia normalmente fechado. */
export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: primaryId(),
    tenantId: tenantId(),
    date: date('date').notNull(),
    isOpen: boolean('is_open').notNull().default(false),
    /** `null` mantém a capacidade da regra semanal. */
    capacity: integer('capacity'),
    reason: text('reason'),
    ...timestamps(),
  },
  (table) => [uniqueIndex('availability_exceptions_uq').on(table.tenantId, table.date)],
);

/**
 * Contador materializado por data.
 *
 * É o que permite reservar vaga ATOMICAMENTE, sem ler-depois-escrever:
 *
 *   UPDATE availability_days SET reserved_count = reserved_count + 1
 *    WHERE tenant_id = $1 AND date = $2
 *      AND reserved_count + used_count < capacity
 *   RETURNING id;
 *
 * Zero linhas devolvidas = o dia lotou entre a consulta do cliente e o envio
 * do pedido. Sem esta tabela, dois clientes pegam a última vaga do sábado.
 */
export const availabilityDays = pgTable(
  'availability_days',
  {
    id: primaryId(),
    tenantId: tenantId(),
    date: date('date').notNull(),
    /** Materializada de regra + exceção no momento em que o dia é criado. */
    capacity: integer('capacity').notNull().default(0),
    /** Encomendas confirmadas. */
    usedCount: integer('used_count').notNull().default(0),
    /** Encomendas pendentes que já seguram vaga. */
    reservedCount: integer('reserved_count').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('availability_days_uq').on(table.tenantId, table.date),
    index('availability_days_tenant_date_idx').on(table.tenantId, table.date),
  ],
);
