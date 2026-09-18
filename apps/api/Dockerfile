# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# API — build em duas etapas.
#
# O tsup empacota os pacotes do monorepo (@cantina/*) dentro do bundle
# (`noExternal`), então a imagem final não precisa de nenhum `packages/*`,
# só das dependências externas de produção.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY . .
RUN npm run build -w @cantina/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

# Nunca como root.
RUN addgroup -S cantina && adduser -S cantina -G cantina

COPY --from=deps /repo/node_modules node_modules
COPY --from=build /repo/apps/api/dist dist
COPY --from=build /repo/package.json package.json

# Migrations e políticas de RLS não rodam no boot da API: são passo separado
# do deploy, com a conexão administrativa (§3 do PLAN.md).
COPY --from=build /repo/packages/db packages/db

USER cantina
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3333/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
