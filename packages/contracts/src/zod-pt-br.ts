import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

/**
 * Mensagens de validação em português.
 *
 * Sem isto, todo campo validado só por `.min(2)` ou `.email()` devolvia a
 * mensagem padrão do Zod — "String must contain at least 2 character(s)" —
 * e era ela que aparecia embaixo do campo, no meio de uma tela em português.
 *
 * Mensagem escrita no schema continua valendo: o mapa só preenche o que
 * ninguém escreveu. E ele é instalado aqui, no pacote de contratos, porque é
 * o mesmo schema que valida na API e tipa o front — um lugar só.
 */

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export const ptBrErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Campo obrigatório.' };
      }
      return { message: 'Valor em formato inválido.' };

    case ZodIssueCode.too_small: {
      const min = Number(issue.minimum);
      if (issue.type === 'string') {
        return {
          message: min <= 1 ? 'Campo obrigatório.' : `Use pelo menos ${min} caracteres.`,
        };
      }
      if (issue.type === 'array') {
        return { message: `Adicione pelo menos ${min} ${plural(min, 'item', 'itens')}.` };
      }
      if (issue.type === 'number') {
        return {
          message: issue.inclusive ? `O valor mínimo é ${min}.` : `Informe um valor maior que ${min}.`,
        };
      }
      break;
    }

    case ZodIssueCode.too_big: {
      const max = Number(issue.maximum);
      if (issue.type === 'string') return { message: `Use no máximo ${max} caracteres.` };
      if (issue.type === 'array') {
        return { message: `No máximo ${max} ${plural(max, 'item', 'itens')}.` };
      }
      if (issue.type === 'number') {
        return {
          message: issue.inclusive ? `O valor máximo é ${max}.` : `Informe um valor menor que ${max}.`,
        };
      }
      break;
    }

    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') {
        return { message: 'Informe um e-mail válido, como nome@sualoja.com.br.' };
      }
      if (issue.validation === 'uuid') return { message: 'Identificador inválido.' };
      if (issue.validation === 'url') return { message: 'Informe um endereço válido.' };
      if (issue.validation === 'datetime') return { message: 'Data e hora inválidas.' };
      return { message: 'Formato inválido.' };

    case ZodIssueCode.invalid_enum_value:
      return { message: 'Escolha uma das opções.' };

    case ZodIssueCode.not_finite:
      return { message: 'Informe um número.' };

    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida.' };

    case ZodIssueCode.unrecognized_keys:
      return { message: 'Há campos não reconhecidos.' };

    default:
      break;
  }

  return { message: ctx.defaultError };
};

z.setErrorMap(ptBrErrorMap);
