import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../../config/env';
import { logger } from '../../shared/logger';
import { getContext } from '../../shared/request-context';
import { AppError, notFound, toAppError } from './app-error';

/** Formata o erro do Zod no envelope da API, campo a campo. */
function fromZodError(error: ZodError): AppError {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    (fields[path] ??= []).push(issue.message);
  }
  return new AppError(422, 'validation_error', 'Dados inválidos.', { details: { fields } });
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Rota não encontrada: ${req.method} ${req.path}`));
};

/**
 * Último middleware da cadeia. Envelope único: `{ error: { code, message } }`
 * (§6 do PLAN.md), para o front ter um só formato a tratar.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = error instanceof ZodError ? fromZodError(error) : toAppError(error);
  const context = getContext();
  const log = context?.logger ?? logger;

  if (appError.expected) {
    log.warn({ code: appError.code, status: appError.status }, appError.message);
  } else {
    log.error({ err: appError, code: appError.code }, 'Erro não tratado');
  }

  if (res.headersSent) {
    // A resposta já começou a ser enviada; só derrubar a conexão resta.
    res.destroy();
    return;
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      // Detalhe de erro interno não vaza para o cliente em produção.
      message: appError.expected || !isProduction ? appError.message : 'Erro interno.',
      ...(appError.details ? { details: appError.details } : {}),
      ...(context?.requestId ? { requestId: context.requestId } : {}),
    },
  });
};
