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
});
