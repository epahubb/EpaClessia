# =============================================================================
# Ecclesia / EpaChurch - production container image
# Multi-stage build: dependencies -> build -> minimal runtime.
# =============================================================================

# ---- Stage 1: full dependencies (including dev) for the build ---------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Prefer `npm ci` for a reproducible build. Two separate things make `npm ci`
# hard-fail, and neither should be able to take a deployment down:
#   1. No package-lock.json committed at all.
#   2. package.json and package-lock.json have drifted apart, because a
#      dependency was added without regenerating the lock (npm error EUSAGE,
#      "Missing: <pkg> from lock file").
# In both cases fall back to `npm install`, which resolves from package.json,
# and print a loud warning. Commit a regenerated lockfile to get determinism
# back: a fallback build is correct but not byte-for-byte reproducible.
RUN if [ -f package-lock.json ]; then \
      npm ci || { \
        echo "WARNING: package-lock.json is out of sync with package.json."; \
        echo "WARNING: falling back to 'npm install'. Run 'npm install' locally and commit package-lock.json."; \
        npm install; \
      }; \
    else \
      echo "WARNING: no package-lock.json committed. This build is not reproducible."; \
      npm install; \
    fi

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
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev || { \
        echo "WARNING: package-lock.json is out of sync with package.json. Falling back to 'npm install'."; \
        npm install --omit=dev; \
      }; \
    else \
      npm install --omit=dev; \
    fi

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
