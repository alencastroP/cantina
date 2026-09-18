import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === 'production';

// Só ativa os bindings do Cloudflare (`env`, R2, etc.) durante `next dev`.
// Não faz nada em build nem em produção — lá quem inicializa é o Worker.
initOpenNextCloudflareForDev();

/**
 * Cabeçalhos de segurança que valem para o site inteiro.
 *
 * O que NÃO está aqui é tão deliberado quanto o que está: a
 * `Content-Security-Policy` mora no `middleware.ts`, porque precisa de um
 * nonce diferente a cada requisição — e um cabeçalho estático não tem como
 * gerar um. Lá ela também fica restrita às páginas de marketing, pelos motivos
 * explicados naquele arquivo.
 *
 * Os quatro abaixo são seguros de aplicar em tudo, inclusive no painel e na
 * vitrine que já estão em produção: nenhum deles muda o que a página pode
 * fazer, só o que o navegador aceita fazer com ela.
 */
const baseSecurityHeaders = [
  // Sem adivinhação de tipo: um upload de imagem que na verdade é HTML deixa
  // de ser executável como página.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Para fora da origem, só o domínio vaza — nunca o caminho. Importa mais do
  // que parece: a URL da vitrine de uma loja identifica a loja.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // APIs que nenhuma tela usa. Desligá-las remove a superfície de um script
  // injetado pedir permissão em nome do site.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },

  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/**
 * Anti-clickjacking, só onde faz diferença.
 *
 * Painel, admin, cadastro e documentos legais nunca devem aparecer dentro de
 * um iframe de terceiro: é assim que se rouba um clique de "confirmar" ou se
 * desenha um formulário falso por cima de um verdadeiro.
 *
 * A VITRINE fica de fora de propósito. Ela é um cardápio público, e um lojista
 * pode muito bem querer embutir a própria loja no site que ele já tem —
 * bloquear isso em nome de um risco que a vitrine não corre seria quebrar um
 * uso legítimo por hábito.
 */
const frameDenyPaths = [
  '/painel/:path*',
  '/admin/:path*',
  '/entrar',
  '/recuperar',
  '/teste-gratis',
  '/termos',
  '/privacidade',
];

const nextConfig = {
  reactStrictMode: true,

  // Os pacotes do monorepo exportam TypeScript direto, sem passo de build.
  transpilePackages: ['@cantina/contracts', '@cantina/domain'],

  // `output: standalone` só entra no build para o Dockerfile (self-host via
  // VPS/Railway/Fly) — é ele quem seta BUILD_TARGET=docker. No build para
  // Cloudflare Workers (OpenNext) e na Vercel a opção fica de fora: o
  // OpenNext parte da saída padrão do `next build`, não da standalone.
  output: process.env.BUILD_TARGET === 'docker' ? 'standalone' : undefined,

  // A versão do Next não é informação que ajude quem visita, e é informação
  // que ajuda quem procura uma falha conhecida.
  poweredByHeader: false,

  experimental: {
    // A vitrine é renderizada no servidor e chama a API internamente (D16).
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },

  async headers() {
    return [
      { source: '/:path*', headers: baseSecurityHeaders },

      ...frameDenyPaths.map((source) => ({
        source,
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      })),

      // HSTS só em produção: em `localhost`, sob HTTP, ele trancaria o
      // navegador do time num HTTPS que não existe na máquina de ninguém.
      ...(isProduction
        ? [
            {
              source: '/:path*',
              headers: [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
