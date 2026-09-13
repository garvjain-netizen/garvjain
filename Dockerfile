# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build only needs DATABASE_URL to be parseable, not reachable.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# The worker and the migration scripts run from source via tsx, so the whole
# app is kept rather than only the standalone bundle.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json next.config.ts tsconfig.json ./
COPY db ./db
COPY scripts ./scripts
COPY worker ./worker
COPY src ./src
EXPOSE 3000
CMD ["npm", "start"]
