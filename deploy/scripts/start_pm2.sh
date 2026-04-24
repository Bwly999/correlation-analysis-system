#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[start-pm2] 未找到 pm2，请先执行: npm install -g pm2" >&2
  exit 1
fi

echo "[start-pm2] 使用 pm2 启动服务"
pm2 start ecosystem.config.cjs

echo "[start-pm2] 服务已启动，使用以下命令查看状态："
echo "  pm2 status"
echo "  pm2 logs"
