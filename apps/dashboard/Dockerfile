# Build stage
FROM node:20-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@10.33.0

# Copy workspace root config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/dashboard/package.json ./apps/dashboard/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @web-crawler/dashboard...

# Copy source
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/dashboard/ ./apps/dashboard/

# Build shared-types first
RUN pnpm --filter @web-crawler/shared-types build

# Build Next.js app
WORKDIR /app/apps/dashboard
RUN pnpm build

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

RUN npm install -g pnpm@10.33.0

COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=build /app/apps/dashboard/package.json ./apps/dashboard/
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public 2>/dev/null || true
COPY --from=build /app/node_modules ./node_modules

WORKDIR /app/apps/dashboard
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
