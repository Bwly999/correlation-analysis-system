#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

if [ ! -d ".git" ]; then
  echo "[deploy-release] 当前目录不是 git 仓库: $ROOT_DIR" >&2
  exit 1
fi

echo "[deploy-release] 项目目录: $ROOT_DIR"
echo "[deploy-release] 当前分支: $(git branch --show-current)"
echo "[deploy-release] 当前提交: $(git rev-parse --short HEAD)"

echo "[deploy-release] 拉取最新代码"
git pull --ff-only

echo "[deploy-release] 构建前端与 Node"
bash "$ROOT_DIR/deploy/scripts/build.sh"

echo "[deploy-release] 准备 Python 虚拟环境"
bash "$ROOT_DIR/deploy/scripts/setup_python_env.sh"

cat <<'EOF'
[deploy-release] 半自动步骤已完成。

接下来请手工执行：
1. sudo systemctl restart correlation-analysis-python
2. sudo systemctl restart correlation-analysis-node
3. sudo nginx -t
4. sudo systemctl reload nginx
5. bash deploy/scripts/healthcheck.sh
EOF
