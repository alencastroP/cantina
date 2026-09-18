/**
 * CPF e CNPJ.
 *
 * Mora no domínio, e não na tela, porque a validação que importa é a do
 * servidor: o formulário só evita que a pessoa perca a viagem até o gateway.
 * Quando a rota pública de cadastro existir, ela importa daqui a MESMA função
 * — duas implementações do dígito verificador viram duas regras diferentes na
 * primeira vez que alguém corrigir uma só.
 *
 * O que estas funções NÃO fazem, de propósito:
 *
 *   - não consultam a Receita nem nenhum serviço externo. Dígito verificador
 *     é aritmética; consulta é dado de terceiro entrando num fluxo de cadastro;
 *   - não registram nada em log. O número inteiro nunca deve aparecer num
 *     arquivo de log — se precisar rastrear, guarde os quatro últimos dígitos.
 */

/** Tudo que não é dígito sai. É o formato em que o número trafega e é guardado. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Sequências de dígito repetido.
 *
 * `111.111.111-11` passa no cálculo do dígito verificador — o algoritmo não
 * as rejeita sozinho. São o preenchimento de teste mais comum, e deixá-las
 * passar significa criar contas com documento inválido no gateway.
 */
function isRepeated(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

/** Dígito verificador de CPF: soma ponderada, módulo 11, resto < 2 vira 0. */
function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * (length + 1 - index);
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || isRepeated(digits)) return false;

  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

/** Pesos do CNPJ: 5..2 seguidos de 9..2, o mesmo bloco deslocado de um. */
const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(digits: string, length: number): number {
  const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - length);

  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += Number(digits[index]) * weights[index]!;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || isRepeated(digits)) return false;

  return (
    cnpjCheckDigit(digits, 12) === Number(digits[12]) &&
    cnpjCheckDigit(digits, 13) === Number(digits[13])
  );
}

/** CPF ou CNPJ — o gateway aceita os dois, e a doceria pode ser qualquer um. */
export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

/**
 * Máscara enquanto se digita.
 *
 * Trunca no comprimento do documento em vez de recusar a tecla: quem colou um
 * número com espaço sobrando vê o campo se ajustar, e não um campo que parou
 * de responder sem dizer por quê.
 */
export function maskCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

/**
 * Só os quatro últimos dígitos, para confirmação visual e para log.
 *
 * `•••.•••.•••-42`. É o máximo que pode aparecer numa tela de confirmação, num
 * e-mail ou num registro de auditoria.
 */
export function maskedCpfTail(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return '';
  return `•••.•••.•••-${digits.slice(9)}`;
}
