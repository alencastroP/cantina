import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  accessTokenClaimsSchema,
  platformTokenClaimsSchema,
  type AccessTokenClaims,
  type PlatformTokenClaims,
} from '@cantina/contracts';
import { jwtVerify, SignJWT } from 'jose';

import { env } from '../config/env';

/**
 * Tokens.
 *
 * Access token: JWT curto, guardado em memória no cliente.
 * Refresh token: opaco e aleatório, com apenas o HASH no banco — vazamento
 * de dump de banco não vira sessão válida. Mesma regra para convite e reset.
 */

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

const ISSUER = 'cantina';
const AUDIENCE = 'cantina-api';

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ tid: claims.tid, role: claims.role, scope: claims.scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return accessTokenClaimsSchema.parse(payload);
}

/**
 * Token do administrador da plataforma (D5).
 *
 * Assinado com o mesmo segredo, mas com claims incompatíveis de propósito:
 * este não tem `tid`, e `verifyAccessToken` exige `tid`. Um token de
 * plataforma, portanto, NÃO abre rota de painel — e um token de painel não
 * abre rota de plataforma, porque `scope` aqui é literal. A separação é
 * estrutural: não depende de ninguém lembrar de checar.
 */
export async function signPlatformToken(claims: PlatformTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, scope: 'platform' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);
}

export async function verifyPlatformToken(token: string): Promise<PlatformTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return platformTokenClaimsSchema.parse(payload);
}

/** Token opaco para refresh, convite e reset de senha. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparação em tempo constante — evita distinguir tokens por latência. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const computed = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
