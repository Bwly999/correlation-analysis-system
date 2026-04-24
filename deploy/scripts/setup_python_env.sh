#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# 跨平台 venv 可执行文件目录
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  BIN_DIR="$VENV_DIR/Scripts"
else
  BIN_DIR="$VENV_DIR/bin"
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[python-env] 未找到 Python: $PYTHON_BIN" >&2
  exit 1
fi

echo "[python-env] 项目目录: $ROOT_DIR"
echo "[python-env] 使用 Python: $PYTHON_BIN"

if [ ! -d "$VENV_DIR" ]; then
  echo "[python-env] 创建虚拟环境: $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

source "$BIN_DIR/activate"

python -m pip install --upgrade pip setuptools wheel

if [ -f "$BACKEND_DIR/requirements.txt" ]; then
  echo "[python-env] 安装 backend/requirements.txt"
  pip install -r "$BACKEND_DIR/requirements.txt"
else
  echo "[python-env] 未发现 backend/requirements.txt，安装最小运行依赖"
  pip install fastapi uvicorn numpy pandas scikit-learn xgboost shap matplotlib
fi

echo "[python-env] 完成"
