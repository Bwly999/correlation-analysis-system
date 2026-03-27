#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

echo "[build] 项目目录: $ROOT_DIR"
echo "[build] 安装前端依赖"
pnpm install

echo "[build] 构建前端与 Node"
pnpm build

echo "[build] 完成"
