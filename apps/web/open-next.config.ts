import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Config do adaptador OpenNext para Cloudflare Workers.
 *
 * Sem cache incremental configurado: o `revalidate: 30` da vitrine
 * (src/app/loja/[host]/page.tsx) ainda funciona, só sem persistir entre
 * requisições de instâncias diferentes do Worker. Se o tráfego justificar,
 * plugue um bucket R2 aqui (`overrides/incremental-cache/r2-incremental-cache`)
 * — é só isso, sem mexer nas páginas.
 */
export default defineCloudflareConfig({});
