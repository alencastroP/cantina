/**
 * Slug para o endereço da vitrine.
 *
 * Existe uma cópia disto no servidor (`apps/api/src/shared/slug.ts`), e a
 * duplicação é deliberada: aqui o slug é uma SUGESTÃO enquanto o usuário
 * digita — puro feedback visual, sem valor de verdade. A validação real
 * acontece na API, que também resolve colisões. Importar a versão do servidor
 * arrastaria o pacote de domínio para o bundle do browser por causa de vinte
 * linhas.
 */

/** Marcas diacríticas separadas pela normalização NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function slugify(value: string, maxLength = 40): string {
  return value
    .normalize('NFD')
    // "Pão de Açúcar" → "pao-de-acucar"
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(EDGE_HYPHENS, '')
    .slice(0, maxLength)
    .replace(EDGE_HYPHENS, '');
}
