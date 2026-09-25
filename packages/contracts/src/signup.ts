import { isValidCpf, onlyDigits } from '@cantina/domain';
import { z } from 'zod';

import { phoneSchema, slugSchema } from './common';

/**
 * Cadastro público do teste grátis (SIGNUP-TESTE-GRATIS.md).
 *
 * Única rota do sistema pública, anônima E que cria estado permanente — por
 * isso o CPF é validado pelo dígito verificador de verdade, com a MESMA
 * função que a tela usa (`isValidCpf`, de `@cantina/domain`), e não só pelo
 * comprimento como `startSubscriptionRequestSchema` ainda faz.
 */
export const trialSignupRequestSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  slug: slugSchema.min(3).max(40),
  ownerName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
  /** CPF. Vai para o gateway, que exige para emitir cobrança. */
  document: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine(isValidCpf, { message: 'CPF inválido.' }),
  /**
   * Sinais anti-robô, FRACOS por natureza — ver `assertNotBot` no serviço.
   * A defesa real é o limite por IP e o fato de a conta só nascer de
   * verdade com pagamento confirmado.
   */
  antiAbuse: z.object({
    website: z.string().max(200),
    elapsedMs: z.number().int().min(0),
  }),
});
export type TrialSignupRequest = z.infer<typeof trialSignupRequestSchema>;

export const trialSignupResponseSchema = z.object({
  checkoutUrl: z.string(),
});
export type TrialSignupResponse = z.infer<typeof trialSignupResponseSchema>;
