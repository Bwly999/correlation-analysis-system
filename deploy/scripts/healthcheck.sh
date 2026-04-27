#!/usr/bin/env bash
set -euo pipefail

PYTHON_BASE_URL="${PYTHON_BASE_URL:-http://127.0.0.1:8000}"
NODE_BASE_URL="${NODE_BASE_URL:-http://127.0.0.1:8787}"
NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-}"

NODE_AUTH_ARGS=()
if [ -n "$NODE_AUTH_TOKEN" ]; then
  NODE_AUTH_ARGS=(-H "Authorization: Bearer $NODE_AUTH_TOKEN")
fi

echo "[healthcheck] 检查 Python 根接口"
curl --fail --silent --show-error "$PYTHON_BASE_URL/" >/dev/null
echo "[healthcheck] Python 服务可访问"

echo "[healthcheck] 检查 Node 存储接口"
curl --fail --silent --show-error "${NODE_AUTH_ARGS[@]}" "$NODE_BASE_URL/api/storage/me" >/dev/null
echo "[healthcheck] Node 服务可访问"

echo "[healthcheck] 检查 Node -> Python Lasso 代理链路"
HTTP_CODE="$(
  curl --silent --show-error --output /tmp/correlation_analysis_lasso_check.json \
    --write-out "%{http_code}" \
    "${NODE_AUTH_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -X POST \
    "$NODE_BASE_URL/api/analysis/lasso" \
    -d '{"data":[{"target":1,"f1":1,"f2":8},{"target":2,"f1":2,"f2":7},{"target":3,"f1":3,"f2":6},{"target":4,"f1":4,"f2":5},{"target":5,"f1":5,"f2":4},{"target":6,"f1":6,"f2":3},{"target":7,"f1":7,"f2":2},{"target":8,"f1":8,"f2":1}],"target":"target","config":{"targetField":"target"}}'
)"

if [ "$HTTP_CODE" = "200" ]; then
  echo "[healthcheck] Lasso 代理链路返回 200，链路正常"
elif [ "$HTTP_CODE" = "400" ]; then
  echo "[healthcheck] Lasso 代理链路返回 400，说明链路已通但算法参数/样本校验失败"
  cat /tmp/correlation_analysis_lasso_check.json
  exit 1
else
  echo "[healthcheck] Lasso 代理链路异常，HTTP 状态码: $HTTP_CODE" >&2
  cat /tmp/correlation_analysis_lasso_check.json || true
  exit 1
fi

echo "[healthcheck] 全部通过"
