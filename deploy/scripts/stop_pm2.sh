#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[stop-pm2] 未找到 pm2" >&2
  exit 1
fi

echo "[stop-pm2] 停止 pm2 服务"
pm2 stop ecosystem.config.cjs

echo "[stop-pm2] 服务已停止"
