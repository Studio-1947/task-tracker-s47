# Multi-stage build for the NestJS API (monorepo-aware).
# Build context is the repo ROOT: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- deps: install with the full workspace manifest set (cached) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ---- build: compile shared then api ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @task-tracker/shared build \
 && pnpm --filter @task-tracker/api build

# ---- prod deps only ----
FROM base AS proddeps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo
RUN corepack enable
COPY --from=proddeps /repo/node_modules ./node_modules
COPY --from=proddeps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=proddeps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts

EXPOSE 3000
WORKDIR /repo/apps/api
# Apply migrations, then boot. (For zero-downtime you'd split these; fine for inhouse.)
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main.js"]
