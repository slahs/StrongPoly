# --- Build ---
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile
COPY packages packages
RUN pnpm build

# --- Laufzeit ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/server/dist/server.mjs ./server.mjs
COPY --from=build /app/packages/client/dist ./public
ENV STATIC_DIR=/app/public
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT}/healthz || exit 1
CMD ["node", "server.mjs"]
