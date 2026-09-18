import { z } from 'zod';

/**
 * Ambiente validado no boot. Falha cedo e alto: subir com `JWT_ACCESS_SECRET`
 * vazio e descobrir no primeiro login é pior do que não subir.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `silent` desliga o log — usado pelos testes.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  API_URL: z.string().url().default('http://localhost:3333'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  ROOT_DOMAIN: z.string().default('cantina.localhost'),

  /** Papel `cantina_app`, sujeito a RLS. Todas as rotas de tenant. */
  DATABASE_URL: z.string().url(),
  /** Papel com BYPASSRLS. Só `platform`, migrations e resolução de host. */
  DATABASE_ADMIN_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  JWT_ACCESS_SECRET: z.string().min(32, 'Use pelo menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Use pelo menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),

  ASAAS_API_KEY: z.string().optional(),
  ASAAS_BASE_URL: z.string().url().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Cantina <nao-responda@cantina.app>'),

  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('cantina'),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function load(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}\n\nVeja .env.example.`);
  }

  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
