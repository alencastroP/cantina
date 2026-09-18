import type { ErrorEnvelope } from '@cantina/contracts';

/**
 * Cadastro do teste grátis — cliente HTTP próprio.
 *
 * Este arquivo NÃO importa `lib/api`, e a separação é o ponto principal dele.
 * Aquele módulo guarda o access token do painel numa variável de módulo e
 * manda `credentials: 'include'` em toda chamada. Uma página pública que pede
 * CPF não tem por que conhecer nenhum dos dois: se ela nunca importa o token,
 * nenhum caminho de código dentro dela consegue vazá-lo, e o isolamento deixa
 * de depender de alguém lembrar da regra.
 *
 * As três decisões de segurança que valem para toda chamada daqui:
 *
 *   credentials: 'omit'   nenhum cookie sai junto. Se alguém abrir o cadastro
 *                         numa aba com sessão de lojista aberta, essa sessão
 *                         não viaja no pedido — e nenhum CSRF em cima desta
 *                         rota faz sentido, porque não há credencial ambiente
 *                         para ser aproveitada.
 *   referrerPolicy        o servidor não recebe a URL de onde a pessoa veio.
 *   cache: 'no-store'     nada de resposta de cadastro em cache de navegador
 *                         ou de proxy no meio do caminho.
 *
 * E o que este módulo NÃO faz, de propósito: não recebe, não transporta e não
 * enxerga número de cartão. Ver `safeCheckoutUrl`, no fim do arquivo.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
const API_URL = `${API_BASE}/api/v1`;

export interface TrialSignupInput {
  /** Nome fantasia da doceria. */
  businessName: string;
  /** Subdomínio desejado da vitrine, já em formato de slug. */
  slug: string;
  /** Nome completo de quem assina — o mesmo do CPF. */
  ownerName: string;
  email: string;
  /** Celular com DDD, só dígitos. */
  phone: string;
  /** CPF, só dígitos. Vai para o gateway, que exige para emitir cobrança. */
  document: string;
  /**
   * Sinais anti-robô, coletados na tela.
   *
   * São FRACOS e o servidor precisa tratá-los como tal: qualquer um que monte
   * a requisição à mão manda `website: ''` e `elapsedMs: 40000`. Servem para
   * filtrar o robô preguiçoso, que é a maioria do volume, e nada além disso —
   * a defesa real é limite por IP, verificação do e-mail e o fato de o cadastro
   * só virar conta depois que um pagamento válido é confirmado.
   */
  antiAbuse: {
    /** Campo-isca. Preenchido = quase certamente robô. */
    website: string;
    /** Tempo entre abrir o formulário e enviá-lo. */
    elapsedMs: number;
  };
}

export interface TrialSignupResult {
  /**
   * Página de pagamento HOSPEDADA PELO PROVEDOR.
   *
   * É para onde a pessoa é mandada em seguida, e é lá — no domínio do
   * provedor, dentro do certificado dele — que o cartão é digitado. Nenhum
   * campo de cartão existe no Cantina, nem nesta página nem em nenhuma outra,
   * e é isso que mantém o número fora do nosso DOM, do nosso JavaScript, dos
   * nossos logs e do nosso banco.
   */
  checkoutUrl: string;
}

export class SignupError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: unknown) {
    super(message);
    this.name = 'SignupError';
    this.status = status;
    this.code = code;
    this.fieldErrors = normalizeFields(fields);
  }
}

function normalizeFields(fields: unknown): Record<string, string> {
  if (!fields || typeof fields !== 'object') return {};

  const output: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fields as Record<string, string[]>)) {
    const first = Array.isArray(messages) ? messages[0] : undefined;
    if (typeof first === 'string') output[field] = first;
  }
  return output;
}

/**
 * Envia o cadastro e devolve para onde ir em seguida.
 *
 * `Idempotency-Key` é gerada por TENTATIVA, e não por sessão: se a resposta se
 * perder na rede e a pessoa clicar de novo, o servidor reconhece o mesmo
 * pedido e devolve o mesmo checkout, em vez de criar uma segunda loja com o
 * mesmo CPF. Quem gera a chave é quem tenta — por isso ela é parâmetro.
 */
export async function startTrial(
  input: TrialSignupInput,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<TrialSignupResult> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/signup/trial`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': options.idempotencyKey,
      },
      body: JSON.stringify(input),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new SignupError(0, 'network_error', 'Não foi possível falar com o servidor.');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const envelope = (body as ErrorEnvelope | null)?.error;
    throw new SignupError(
      response.status,
      envelope?.code ?? 'unknown_error',
      envelope?.message ?? 'Não foi possível concluir o cadastro.',
      envelope?.details?.['fields'],
    );
  }

  const checkoutUrl = (body as TrialSignupResult | null)?.checkoutUrl;
  if (typeof checkoutUrl !== 'string') {
    throw new SignupError(502, 'invalid_response', 'Resposta inesperada do servidor.');
  }

  return { checkoutUrl };
}

/* -------------------------------------------------------------------------- */
/* Redirecionamento para o checkout                                            */
/* -------------------------------------------------------------------------- */

/**
 * Hosts para os quais é aceitável mandar alguém depois do cadastro.
 *
 * Configurável por ambiente porque sandbox e produção do provedor têm
 * endereços diferentes, e porque trocar de gateway não deveria exigir deploy
 * de frontend.
 *
 *   NEXT_PUBLIC_CHECKOUT_HOSTS="www.asaas.com,sandbox.asaas.com"
 */
const CHECKOUT_HOSTS = (process.env.NEXT_PUBLIC_CHECKOUT_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

/**
 * Valida para onde o servidor mandou ir ANTES de sair da página.
 *
 * Parece paranoia sobre a própria API, e é — de propósito. Redirecionar para
 * uma URL que veio de uma resposta, sem conferir, é a receita de open redirect:
 * basta uma resposta adulterada (API comprometida, proxy no meio, ambiente de
 * teste apontado para o lugar errado) para que a pessoa termine o cadastro
 * numa página de pagamento falsa, com a nossa marca fresca na memória e
 * disposta a digitar o cartão. Custa cinco linhas evitar.
 *
 * Duas exigências, e nenhuma delas negociável:
 *
 *   1. `https:` — checkout em HTTP não existe;
 *   2. host na lista. Sem lista configurada, nada passa: um ambiente mal
 *      configurado falha fechado, mostrando o link para a pessoa decidir, em
 *      vez de navegar sozinho para qualquer lugar.
 */
export function safeCheckoutUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (!CHECKOUT_HOSTS.includes(url.hostname.toLowerCase())) return null;

  return url;
}
