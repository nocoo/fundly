FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
WORKDIR /app

COPY package.json bun.lock tsconfig.json tsconfig.scripts.json biome.json ./
COPY src src
COPY scripts scripts
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/bun.lock* apps/web/
COPY apps/worker/bun.lock* apps/worker/

RUN bun install --frozen-lockfile \
  && bun install --frozen-lockfile --cwd apps/web \
  && bun install --frozen-lockfile --cwd apps/worker

COPY . .
# content/macro-daily/*.md is served from disk at runtime (see docs/17-MACRO-DAILY.md)
RUN bun run build:web

ENV NODE_ENV=production
ENV PORT=8080
ENV FUNDLY_SQLITE=/data/fundly.db
EXPOSE 8080
CMD ["bun", "run", "apps/worker/scripts/serve.ts"]
