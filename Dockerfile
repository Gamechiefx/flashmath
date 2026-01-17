# syntax=docker/dockerfile:1.4
# Enable BuildKit features for faster builds

# Base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with BuildKit cache mount
# This caches the npm cache directory between builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Skip database initialization during build to avoid lock contention
# from multiple Next.js worker processes
ENV SKIP_DB_INIT=true

# Build Next.js with BuildKit cache for .next/cache
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies including netcat for entrypoint health checks
RUN apk add --no-cache libc6-compat netcat-openbsd

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy custom server.js with Socket.io support
COPY --from=builder --chown=nextjs:nodejs /app/server.js ./server.js

# Copy ALL node_modules for server.js dependencies (socket.io, ioredis, pg, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy migration scripts and SQL files
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.js ./scripts/migrate.js
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db/migrations ./src/lib/db/migrations

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations before starting the server
# --skip-if-exists ensures safe deployment even on existing databases
CMD ["sh", "-c", "node scripts/migrate.js --skip-if-exists && node server.js"]
