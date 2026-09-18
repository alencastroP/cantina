import { z } from 'zod';

import { cursorQuerySchema, userRoleSchema, uuidSchema } from './common';

/**
 * Usuários do painel (§6.2 do PLAN.md).
 *
 * D3: um usuário pertence a uma empresa. Não existe "trocar de empresa" —
 * o `tenant_id` vem do token e é definitivo.
 */

export const userStatusSchema = z.enum(['invited', 'active', 'disabled']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  status: userStatusSchema,
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const listUsersQuerySchema = cursorQuerySchema.extend({
  status: userStatusSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    role: userRoleSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const pendingInviteSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  role: userRoleSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type PendingInvite = z.infer<typeof pendingInviteSchema>;

/** O que a tela de aceite mostra antes de pedir a senha. */
export const inviteDetailsSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema,
  tenantName: z.string(),
});
export type InviteDetails = z.infer<typeof inviteDetailsSchema>;
