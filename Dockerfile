# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile

# Stage 2: Build application
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm prisma:generate
RUN pnpm build
RUN pnpm prune --prod

# Stage 3: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health/live || exit 1

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/main"]
