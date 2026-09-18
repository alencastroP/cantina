import { DomainError } from '@cantina/domain';

/**
 * Erro de aplicação com status HTTP.
 *
 * `@cantina/domain` lança `DomainError`, que não conhece HTTP —
 * `fromDomainError` faz a tradução numa única tabela, para o mesmo código de
 * regra não virar 400 num módulo e 422 em outro.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  /** Erro esperado (regra de negócio) não polui o log como incidente. */
  readonly expected: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: Record<string, unknown>; expected?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expected = options.expected ?? status < 500;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, 'bad_request', message, { details });

export const unauthorized = (message = 'Autenticação necessária.') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Recurso não encontrado.') =>
  new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, 'conflict', message, { details });

export const unprocessable = (message: string, details?: Record<string, unknown>) =>
  new AppError(422, 'unprocessable_entity', message, { details });

export const tooManyRequests = (message = 'Muitas requisições. Tente em instantes.') =>
  new AppError(429, 'too_many_requests', message);

export const internal = (message = 'Erro interno.', cause?: unknown) =>
  new AppError(500, 'internal_error', message, { cause, expected: false });

/**
 * Códigos de domínio que merecem status diferente de 422.
 * O resto cai em 422: a requisição estava bem formada, mas a regra recusou.
 */
const DOMAIN_STATUS: Record<string, number> = {
  insufficient_stock: 409,
  reservation_underflow: 409,
  invalid_status_transition: 409,
  range_too_large: 400,
  invalid_range: 400,
  invalid_date: 400,
};

export function fromDomainError(error: DomainError): AppError {
  return new AppError(DOMAIN_STATUS[error.code] ?? 422, error.code, error.message, {
    details: error.details,
    cause: error,
  });
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DomainError) return fromDomainError(error);
  return internal('Erro interno.', error);
}
