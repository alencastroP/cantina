import type { Server } from 'node:http';

import { API_VERSION } from '@cantina/contracts';

import { createApp } from './app';
import { env } from './config/env';
import { closeDatabases } from './db';
import { startJobs, stopJobs } from './jobs/index';
import { registerOrderJobs } from './modules/delivery-orders/orders.jobs';
import { registerBillingJobs } from './modules/billing/billing.jobs';
import { registerFinanceJobs } from './modules/finance/finance.jobs';
import { registerPreorderJobs } from './modules/preorders/preorders.jobs';
import { logger } from './shared/logger';

/**
 * Ponto de entrada.
 *
 * Desligamento gracioso não é luxo aqui: uma requisição interrompida no meio
 * pode estar dentro de uma transação que reserva estoque. Fechar o servidor
 * antes das conexões de banco garante que ela termina — commit ou rollback,
 * mas não pela metade.
 */

let server: Server | null = null;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  const app = createApp();

  await startJobs();
  // Cada módulo registra os próprios consumidores da fila. A expiração de
  // reserva (D14) entra com o kanban de delivery, que é quem cria reservas.
  await registerOrderJobs();
  await registerPreorderJobs();
  await registerFinanceJobs();
  await registerBillingJobs();

  server = app.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV, base: `${env.API_URL}/api/${API_VERSION}` },
      'API no ar',
    );
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'Falha ao subir o servidor');
    process.exit(1);
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Encerrando...');

  const forceExit = setTimeout(() => {
    logger.error('Desligamento demorou demais; encerrando à força.');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          resolve();
        });
      });
    }
    await stopJobs();
    await closeDatabases();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Erro durante o desligamento');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Promise rejeitada sem tratamento');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Exceção não capturada');
  void shutdown('uncaughtException');
});

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Falha no bootstrap');
  process.exit(1);
});
