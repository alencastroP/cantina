/**
 * Slugs para URL de vitrine.
 *
 * A vitrine é pública e indexável, então o slug de um produto é endereço
 * permanente: uma vez publicado, mudá-lo quebra links já compartilhados.
 * Por isso renomear o produto NÃO regera o slug — só uma edição explícita
 * do campo muda.
 */

/** Marcas diacríticas separadas pela normalização NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function slugify(value: string, maxLength = 60): string {
  const slug = value
    .normalize('NFD')
    // "Pão de Açúcar" → "Pao de Acucar"
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG, '-')
    .replace(EDGE_HYPHENS, '')
    .slice(0, maxLength)
    .replace(EDGE_HYPHENS, '');

  // Nome só de emoji ou de pontuação não produz slug algum.
  return slug.length > 0 ? slug : 'item';
}

/**
 * Resolve colisão com sufixo numérico: `coxinha`, `coxinha-2`, `coxinha-3`.
 *
 * `taken` vem de uma consulta por prefixo dentro do tenant — slug é único
 * por empresa, não globalmente (§3: toda chave composta começa por tenant).
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  // Mil produtos com o mesmo nome é erro de importação, não uso legítimo.
  return `${base}-${Date.now().toString(36)}`;
}
