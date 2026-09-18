/**
 * Erro de regra de negócio. Não conhece HTTP.
 * A camada `http/errors` da API traduz `code` para status.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function domainError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, details);
}
