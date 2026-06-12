# 1. Base image
FROM node:20-alpine AS base

# Install libc6-compat for compatibility (needed for some Next.js deps like sharp)
RUN apk add --no-cache libc6-compat

# 2. Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package.json files so npm ci can resolve them
COPY packages/shared-core/package.json ./packages/shared-core/
COPY packages/mobile-contracts/package.json ./packages/mobile-contracts/
COPY mobile/package.json ./mobile/

# Install dependencies (ci ensures strict adherence to the lockfile)
RUN npm ci

# 3. Builder stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_S3_ENDPOINT
ARG NEXT_PUBLIC_INSTANT_API_URI
ARG NEXT_PUBLIC_INSTANT_WEBSOCKET_URI
ARG NEXT_PUBLIC_INSTANT_APP_ID

# Build the application
RUN npm run build

# 4. Runner stage (Production)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1
# Ensure sharp is found in the standalone build on Alpine
ENV NEXT_SHARP_PATH=/app/node_modules/sharp

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy the standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
# "server.js" is the entry point created by output: 'standalone'
CMD ["node", "server.js"]
