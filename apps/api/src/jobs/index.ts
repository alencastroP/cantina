import PgBoss from 'pg-boss';

import { env } from '../config/env';
import { logger } from '../shared/logger';

/**
 * Fila de jobs sobre o próprio Postgres (P8).
 *
 * pg-boss em vez de BullMQ para não somar Redis à infraestrutura antes de
 * precisar — e, principalmente, porque enfileirar na MESMA transação que
 * grava o pedido elimina a classe de bug "job disparou antes do commit".
 *
 * Usa a conexão administrativa: pg-boss cria e mantém o schema `pgboss`,
 * e o papel `cantina_app` não tem DDL de propósito.
 */

export const JOBS = {
  /** Devolve reservas de pedidos de delivery nunca confirmados (D14). */
  expireReservations: 'stock.expire-reservations',
  /**
   * Devolve reservas de ENCOMENDAS nunca confirmadas (D14).
   *
   * Fila própria, e não a do delivery: aqui a expiração também libera a vaga
   * na agenda, que é escassa. Separar deixa o log e a métrica dizerem qual
   * dos dois fluxos está acumulando abandono.
   */
  expirePreorders: 'preorder.expire-reservations',
  /** Varre insumos abaixo do mínimo e gera notificação (D8). */
  scanLowStock: 'stock.scan-low-stock',
  /** Lembra o lojista das encomendas do dia seguinte. */
  remindPreorders: 'preorder.remind-due',
  /** Materializa o próximo lançamento de cada recorrência (§4.10). */
  materializeRecurrences: 'finance.materialize-recurrences',
  /** Cobrança e mudança de status de assinatura em atraso (módulo 11). */
  dunning: 'subscription.dunning',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) {
    throw new Error('Fila de jobs não iniciada. Chame startJobs() antes.');
  }
  return boss;
}

export async function startJobs(): Promise<PgBoss> {
  const instance = new PgBoss({
    connectionString: env.DATABASE_ADMIN_URL,
    max: 2,
    // Retenção curta: o histórico que importa está em `stock_movements` e
    // `audit_logs`, não na fila.
    archiveCompletedAfterSeconds: 60 * 60 * 24,
    deleteAfterDays: 7,
  });

  instance.on('error', (error) => {
    logger.error({ err: error }, 'Erro na fila de jobs');
  });

  await instance.start();

  for (const name of Object.values(JOBS)) {
    await instance.createQueue(name);
  }

  boss = instance;
  logger.info({ queues: Object.values(JOBS).length }, 'Fila de jobs iniciada');
  return instance;
}

export async function stopJobs(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  boss = null;
  logger.info('Fila de jobs encerrada.');
}

/**
 * Registro de handler.
 *
 * Cada módulo da §8 registra os seus no boot — o worker de expiração de
 * reserva entra junto com o módulo 6, não antes. Fila declarada sem handler
 * apenas acumula; é intencional, e é o que permite subir a infraestrutura
 * inteira agora e ligar os consumidores um a um.
 */
export async function registerJob<T extends object>(
  name: JobName,
  handler: (data: T) => Promise<void>,
): Promise<void> {
  await getBoss().work<T>(name, async ([job]) => {
    if (!job) return;
    await handler(job.data);
  });
  logger.debug({ job: name }, 'Handler registrado');
}
