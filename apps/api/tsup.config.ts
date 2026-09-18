import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Os pacotes do monorepo exportam TypeScript direto, sem passo de build.
  // Empacotá-los aqui é o que dispensa `tsc` em cada `packages/*`.
  noExternal: [/^@cantina\//],
  // `pg` e `drizzle-orm` só constam no package.json de @cantina/db (que cai
  // no noExternal acima) — não no do @cantina/api. Sem isso o tsup não os
  // reconhece como externos e tenta embutir o `pg`, que faz require()
  // dinâmico de módulos nativos do Node (events, net, tls) e quebra em
  // runtime: "Dynamic require of ... is not supported". Ficam disponíveis em
  // produção porque `npm ci` na raiz do monorepo já os instala no
  // node_modules copiado para a imagem (Dockerfile).
  external: ['pg', 'drizzle-orm'],
});
