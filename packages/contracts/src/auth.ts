import { z } from 'zod';

import { uuidSchema, userRoleSchema } from './common';

/**
 * Contratos de autenticação (§6.2 do PLAN.md).
 *
 * D16: o painel fala direto com a API usando token. O access token vive em
 * memória no cliente e o refresh vai em cookie httpOnly — o mesmo desenho
 * que o app mobile futuro vai usar, sem um segundo caminho de auth.
 */

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres'),
  /**
   * Slug da empresa. Necessário porque o e-mail é único POR TENANT (D3):
   * a mesma pessoa pode ter conta em duas lojas.
   */
  tenantSlug: z.string().trim().toLowerCase().optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTenantSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  status: z.enum(['trial', 'active', 'past_due', 'suspended', 'canceled']),
});
export type AuthTenant = z.infer<typeof authTenantSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: authUserSchema,
  tenant: authTenantSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = z.object({
  user: authUserSchema,
  tenant: authTenantSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  tenantSlug: z.string().trim().toLowerCase(),
});

/**
 * `tenantSlug` acompanha o token nos dois fluxos por link.
 *
 * Não é credencial: serve para abrir o contexto de RLS antes de procurar o
 * token. Sem ele, a busca pelo hash teria de varrer todas as empresas com a
 * conexão de plataforma. Slug errado só faz o hash não bater.
 */
export const resetPasswordRequestSchema = z.object({
  tenantSlug: z.string().trim().toLowerCase(),
  token: z.string().min(16),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres'),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const inviteUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2),
  role: userRoleSchema,
});
export type InviteUserRequest = z.infer<typeof inviteUserRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  tenantSlug: z.string().trim().toLowerCase(),
  token: z.string().min(16),
  password: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres'),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

/** Conteúdo do access token. Nada aqui é confiável sem verificar a assinatura. */
export const accessTokenClaimsSchema = z.object({
  sub: uuidSchema,
  tid: uuidSchema,
  role: userRoleSchema,
  /** `tenant` (painel) ou `platform` (admin da plataforma, D5). */
  scope: z.enum(['tenant', 'platform']),
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;
