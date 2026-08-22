FROM oven/bun:1.3
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
RUN bun run build:web

ENV NODE_ENV=production
ENV PORT=8080
ENV FUNDLY_SQLITE=/data/fundly.db
EXPOSE 8080
CMD ["bun", "run", "apps/worker/scripts/serve.ts"]
