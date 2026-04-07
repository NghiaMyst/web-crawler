# D-02: Playwright official image — multi-arch manifest (resolves ARM64 on Apple Silicon / Oracle Cloud)
# Chromium is pre-installed. Node.js must be installed separately.
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Install Node.js 20 (Playwright noble image is Ubuntu 24.04, not Alpine)
RUN apt-get update && apt-get install -y curl \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10.33.0

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/crawler/package.json ./apps/crawler/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter @web-crawler/crawler...

# Copy compiled output
COPY apps/crawler/dist/ ./apps/crawler/dist/
COPY packages/shared-types/dist/ ./packages/shared-types/dist/

WORKDIR /app/apps/crawler

CMD ["node", "dist/index.js"]
