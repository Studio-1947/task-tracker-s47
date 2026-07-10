# Build the static SPA and serve it with nginx (also reverse-proxies /api -> api:3000).
# Build context is the repo ROOT: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Cache-bust this layer on every deploy by passing the git commit SHA.
# docker build --build-arg CACHEBUST=$(git rev-parse HEAD) ...
ARG CACHEBUST=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @task-tracker/shared build \
 && pnpm --filter @task-tracker/web build

FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
