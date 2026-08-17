# =============================================================================
# Ecclesia / EpaChurch - production container image
# Multi-stage build: dependencies -> build -> minimal runtime.
# =============================================================================

# ---- Stage 1: full dependencies (including dev) for the build ---------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Stage 2: build the frontend bundle and the server bundle ---------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Stage 3: production-only dependencies ----------------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 4: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init gives correct PID 1 signal forwarding so SIGTERM reaches Node and
# the graceful-shutdown handler actually runs.
RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
ENV PORT=3000

# Run as an unprivileged user. Never run a public web process as root.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000

# Platforms such as Railway inject PORT at runtime, so the probe must follow it
# rather than hard-coding 3000. Shell form is used so ${PORT} expands.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.cjs"]
