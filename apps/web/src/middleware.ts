import { NextResponse, type NextRequest } from 'next/server';

/**
 * Resolução de tenant por host (D2) e cabeçalhos de segurança das páginas
 * públicas de marketing.
 *
 * ── Tenant ───────────────────────────────────────────────────────────────────
 *
 * `padaria.cantina.app/produto/x` → reescrito para `/loja/padaria.cantina.app/produto/x`.
 * O hostname vira segmento de rota, então cada vitrine tem sua própria chave
 * de cache no Next e a página recebe o host sem precisar ler header.
 *
 * O domínio raiz (e `www`) NÃO é vitrine: ali moram o painel, o admin, a
 * landing e o cadastro. Por isso a checagem é por sufixo, e não uma lista de
 * hosts — empresas entram e saem o tempo todo (§3 do PLAN.md).
 *
 * Domínio próprio do lojista cai no mesmo caminho sem mudança nenhuma: o
 * hostname completo é a chave, seja ele subdomínio ou não.
 *
 * ── Content-Security-Policy ──────────────────────────────────────────────────
 *
 * Aplicada APENAS às rotas listadas em `MARKETING_PATHS`, e a limitação é
 * deliberada. Uma CSP estrita só vale alguma coisa se ninguém precisar afrouxá-la
 * depois; ligá-la de uma vez no painel e na vitrine — que estão em produção,
 * com cliente em cima — é o caminho mais curto para alguém adicionar
 * `'unsafe-inline'` num incidente de sexta-feira e nunca mais tirar.
 *
 * Estas páginas são o lugar certo para começar: são novas, não têm terceiro
 * nenhum carregado, e uma delas coleta CPF. Estender para o resto do site é
 * incluir os caminhos aqui — depois de testar o painel inteiro com a política
 * em modo `Report-Only`, que é como se descobre o que quebra sem quebrar.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'cantina.localhost';
const isProduction = process.env.NODE_ENV === 'production';

/** Rotas que existem só no domínio raiz. */
const ROOT_ONLY_PREFIXES = [
  '/painel',
  '/admin',
  '/entrar',
  '/recuperar',
  '/api',
  // Cadastro e documentos legais: sob um host de vitrine, `/teste-gratis`
  // seria reescrito para `/loja/<host>/teste-gratis` e daria 404 — um 404 na
  // página de cadastro é venda perdida em silêncio.
  '/teste-gratis',
  '/termos',
  '/privacidade',
];

/** Páginas públicas de marketing, que recebem a CSP estrita. */
const MARKETING_PATHS = new Set(['/', '/teste-gratis', '/termos', '/privacidade']);

function isRootHost(hostname: string): boolean {
  return hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`;
}

/**
 * Origem da API, para o `connect-src`.
 *
 * Se a variável vier vazia ou torta, o resultado é string vazia e a diretiva
 * fica só com `'self'` — a página falha ao enviar o cadastro, de forma visível,
 * em vez de liberar conexão para qualquer destino.
 */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? '').origin;
  } catch {
    return '';
  }
}

function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",

    /**
     * `strict-dynamic` com nonce.
     *
     * O Next injeta scripts inline (o payload de hidratação) e carrega os
     * chunks a partir deles. Com o nonce no cabeçalho da REQUISIÇÃO, o Next o
     * reconhece e assina os próprios scripts; `strict-dynamic` estende essa
     * confiança ao que eles carregam, sem precisar listar caminho de chunk.
     *
     * O efeito prático: script injetado por XSS não roda, porque não tem como
     * adivinhar um nonce que muda a cada requisição. É a diferença entre uma
     * CSP que atrapalha o atacante e uma que o impede.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? '' : " 'unsafe-eval'"}`,

    // `unsafe-inline` só em estilo, e é uma concessão consciente: atributos
    // `style` inline (largura de barra, altura de coluna) são usados nos
    // mockups, e injeção de CSS não executa código — o risco é exfiltração por
    // seletor, que `connect-src` e `img-src` já contêm.
    "style-src 'self' 'unsafe-inline'",

    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin()}`.trim(),

    // Nada de iframe: nem esta página dentro de outra (clickjacking em cima do
    // formulário de cadastro), nem outra página dentro desta.
    "frame-ancestors 'none'",
    "frame-src 'none'",

    // `form-action 'self'`: mesmo que alguém consiga injetar um formulário,
    // ele não tem para onde postar os dados.
    "form-action 'self'",

    "base-uri 'none'",
    "object-src 'none'",
  ];

  if (isProduction) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

/**
 * Resposta das páginas de marketing: CSP com nonce + `Referrer-Policy` fechada.
 *
 * `no-referrer` aqui e não no site inteiro: a próxima navegação a partir do
 * cadastro é para o gateway de pagamento, e não há motivo para contar a ele de
 * qual URL a pessoa veio.
 */
function withSecurityHeaders(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const csp = buildCsp(nonce);

  // O Next lê o nonce do cabeçalho da requisição para assinar os próprios
  // scripts. Sem repassá-lo aqui, a página carrega sem JavaScript nenhum.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

export function middleware(request: NextRequest): NextResponse {
  const hostname = (request.headers.get('host') ?? '').split(':')[0]?.toLowerCase() ?? '';
  const { pathname } = request.nextUrl;

  if (isRootHost(hostname) || hostname === '') {
    return MARKETING_PATHS.has(pathname)
      ? withSecurityHeaders(request)
      : NextResponse.next();
  }

  // Host de vitrine tentando acessar o painel: manda para o domínio raiz,
  // em vez de renderizar um painel por subdomínio (que quebraria o cookie
  // de sessão, compartilhado no domínio raiz).
  if (ROOT_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.host = ROOT_DOMAIN;
    return NextResponse.redirect(url);
  }

  // Só o caminho muda: o `clone()` já carrega a query. Concatenar `search` ao
  // `pathname` codificava o `?` como `%3F` e a query virava parte do segmento
  // — `/pedido/12?phone=…` chegava à página com `code = "12?phone=…"`.
  const url = request.nextUrl.clone();
  url.pathname = `/loja/${hostname}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Tudo, menos assets estáticos e o favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
};
