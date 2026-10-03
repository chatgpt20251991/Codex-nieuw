# Official Node 22 bookworm-slim index resolved 3 October 2026; review updates in PRs.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/ops ./scripts/ops
RUN npm ci --no-audit --no-fund
# Synthetic build-only URLs: no database connection or migration occurs in a build.
RUN DATABASE_URL=postgresql://build:build@localhost/build DIRECT_DATABASE_URL=postgresql://build:build@localhost/build npm run db:generate
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN=${NEXT_PUBLIC_EVIDENCE_UPLOAD_ORIGIN}
RUN node scripts/ops/build-origins.cjs
RUN npm run build
RUN node node_modules/typescript/bin/tsc apps/web/lib/auth-config.ts --outDir .ops --module commonjs --target es2022 --skipLibCheck
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/scripts/ops ./scripts/ops
COPY --from=build --chown=node:node /app/.ops ./.ops
USER node
# Select api or web with the service's Docker command. Neither runs migrations.
CMD ["node", "scripts/ops/start-service.cjs", "api"]
