# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Web — Next.js em modo standalone (P12).
#
# `output: 'standalone'` no next.config gera um servidor autocontido, o que
# mantém o deploy agnóstico: a mesma imagem roda em VPS, Railway ou Fly.
# Em Vercel, este Dockerfile simplesmente não é usado.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @cantina/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S cantina && adduser -S cantina -G cantina

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

USER cantina
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
