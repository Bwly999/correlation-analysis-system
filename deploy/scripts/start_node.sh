#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/env/server.env}"

cd "$ROOT_DIR"

if [ ! -f "$ROOT_DIR/dist-server/server/index.js" ]; then
  echo "[start-node] 未找到 dist-server/server/index.js，请先执行 deploy/scripts/build.sh" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  echo "[start-node] 加载环境变量: $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "[start-node] 未找到环境变量文件，继续使用当前 shell 环境: $ENV_FILE"
fi

echo "[start-node] 启动 Node 服务"
exec node dist-server/server/index.js
