/**
 * Erros do Postgres que o código precisa distinguir.
 *
 * Confiar no código do banco em vez de checar antes é deliberado: um
 * `select` seguido de `insert` tem janela de corrida, e o índice único não.
 * O caminho feliz também fica com uma consulta a menos.
 */

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as PostgresError;
  return typeof candidate.code === 'string' ? candidate : null;
}

/** `constraint` é o NOME do índice, como declarado no schema Drizzle. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);
  if (pgError?.code !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || pgError.constraint === constraint;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return asPostgresError(error)?.code === FOREIGN_KEY_VIOLATION;
}

export function isCheckViolation(error: unknown): boolean {
  return asPostgresError(error)?.code === CHECK_VIOLATION;
}

export function violatedConstraint(error: unknown): string | null {
  return asPostgresError(error)?.constraint ?? null;
}
