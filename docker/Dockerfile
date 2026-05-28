# === Stage 1: Build ===
FROM node:20-slim AS builder

WORKDIR /app
RUN npm install -g pnpm@9.15.9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# === Stage 2: Production ===
FROM node:20-slim AS runner

WORKDIR /app
RUN npm install -g pnpm@9.15.9

# 只复制产物
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8787

# 必须通过环境变量覆盖默认的 127.0.0.1
ENV WORKFLOW_AI_SERVER_HOST=0.0.0.0
ENV WORKFLOW_AI_SERVER_PORT=8787
# 前端从同域访问 API
ENV VITE_API_BASE_URL=/api

CMD ["node", "dist-server/server/index.js"]
