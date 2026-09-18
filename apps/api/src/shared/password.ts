import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com Argon2id.
 *
 * `@node-rs/argon2` traz binário pré-compilado — não exige toolchain de C++
 * na máquina de quem clona o repositório nem na imagem de build.
 *
 * Parâmetros: OWASP mínimo para Argon2id (19 MiB, 2 iterações, 1 thread).
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(plain: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash) {
    // Usuário convidado que ainda não definiu senha. Verificamos mesmo assim
    // contra um hash descartável para não devolver mais rápido que um
    // usuário real — a diferença de tempo revelaria quais e-mails existem.
    await hash('nao-existe', OPTIONS).catch(() => undefined);
    return false;
  }

  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    return false;
  }
}
