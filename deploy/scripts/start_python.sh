#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/backend/.venv"
HOST="${PYTHON_HOST:-127.0.0.1}"
PORT="${PYTHON_PORT:-8000}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[start-python] 未找到虚拟环境，请先执行 deploy/scripts/setup_python_env.sh" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "[start-python] 启动 Python 服务: $HOST:$PORT"
exec "$VENV_DIR/bin/uvicorn" backend.main:app --host "$HOST" --port "$PORT"
