# D-02: Playwright official image — multi-arch manifest (resolves ARM64 on Apple Silicon / Oracle Cloud)
# Chromium is pre-installed. Node.js must be installed separately.

# Build stage — compiles TypeScript; context must be monorepo root
FROM mcr.microsoft.com/playwright:v1.50.1-noble AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.0

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/crawler/package.json ./apps/crawler/

RUN pnpm install --frozen-lockfile --filter @web-crawler/crawler...

COPY tsconfig.base.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/crawler/ ./apps/crawler/

RUN pnpm --filter @web-crawler/shared-types build
RUN pnpm --filter @web-crawler/crawler build

# Runtime stage — production image
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.0

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/crawler/package.json ./apps/crawler/

RUN pnpm install --frozen-lockfile --filter @web-crawler/crawler...

COPY --from=builder /app/apps/crawler/dist/ ./apps/crawler/dist/
COPY --from=builder /app/packages/shared-types/dist/ ./packages/shared-types/dist/

WORKDIR /app/apps/crawler

CMD ["node", "dist/index.js"]
