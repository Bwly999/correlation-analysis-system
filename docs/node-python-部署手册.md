# Node + Python 部署手册

本文档对应当前仓库的推荐生产部署方式：

- 前端静态资源由 Nginx 提供
- 浏览器只访问 Node/TS 后端
- Node/TS 后端统一承接存储、AI 编排、算法代理接口
- Python 后端只负责算法计算，不直接暴露给前端

---

## 1. 当前推荐架构

```text
浏览器
  -> Nginx
    -> 前端静态文件 dist
    -> /api/* 转发到 Node 服务

Node 服务
  -> /api/storage/*
  -> /api/workflow-ai/*
  -> /api/analysis/*
       -> 转发到 Python 算法服务

Python 服务
  -> /analyze/random-forest-feature-importance
  -> /analyze/lasso
  -> /analyze/xgboost-shap
```

---

## 2. 端口建议

- 前端静态资源：`80` / `443`
- Node 服务：`127.0.0.1:8787`
- Python 服务：`127.0.0.1:8000`

建议：

- Node 与 Python 只监听内网地址或本机回环地址
- 外部流量统一先进入 Nginx

---

## 3. 前端构建

### 3.1 环境变量

生产环境前端只需要知道 Node API 地址：

```env
VITE_STORAGE_TYPE=server
VITE_API_BASE_URL=https://api.yourcompany.com/api
```

如果 Nginx 将前端与 Node 放在同一域名下，也可以直接写：

```env
VITE_STORAGE_TYPE=server
VITE_API_BASE_URL=/api
```

### 3.2 构建命令

```bash
pnpm install
pnpm build
```

构建产物：

- 前端静态文件：`dist/`
- Node 编译产物：`dist-server/`

---

## 4. Node 服务部署

### 4.1 必需环境变量

```env
WORKFLOW_AI_SERVER_HOST=127.0.0.1
WORKFLOW_AI_SERVER_PORT=8787
PYTHON_ANALYSIS_API_BASE_URL=http://127.0.0.1:8000
```

如需启用 AI 编排系统默认模型，还需要：

```env
OPENAI_API_KEY=你的系统模型密钥
OPENAI_COMPAT_BASE_URL=https://open.bigmodel.cn/api/paas/v4
WORKFLOW_AI_DEFAULT_MODEL=glm-4.7
```

### 4.2 启动命令

```bash
pnpm start:server
```

等价于：

```bash
node dist-server/server/index.js
```

### 4.3 Node 服务职责

Node 服务当前统一提供以下接口：

- `/api/storage/*`
- `/api/workflow-ai/*`
- `/api/analysis/lasso`
- `/api/analysis/random-forest-feature-importance`
- `/api/analysis/xgboost-shap`

其中算法接口会继续转发到 Python：

- `/api/analysis/lasso` -> `/analyze/lasso`
- `/api/analysis/random-forest-feature-importance` -> `/analyze/random-forest-feature-importance`
- `/api/analysis/xgboost-shap` -> `/analyze/xgboost-shap`

---

## 5. Python 服务部署

### 5.1 依赖安装

建议单独使用虚拟环境：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

如果仓库尚未提供 `requirements.txt`，至少需要补齐：

- `fastapi`
- `uvicorn`
- 算法依赖包（按 `backend/algorithms/` 实际使用安装）

### 5.2 启动命令

在仓库根目录启动：

```bash
python backend/main.py
```

或显式使用 uvicorn：

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 5.3 Python 服务职责

Python 只负责算法执行：

- `POST /analyze/lasso`
- `POST /analyze/random-forest-feature-importance`
- `POST /analyze/xgboost-shap`

不建议再让浏览器直接访问 Python。

---

## 6. Nginx 配置示例

```nginx
server {
    listen 80;
    server_name yourcompany.com;

    root /data/apps/correlation-analysis-system/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果要把 Node 放在二级域名，例如 `api.yourcompany.com`，则把前端环境变量 `VITE_API_BASE_URL` 配成对应地址即可。

---

## 7. systemd 示例

### 7.1 Node

```ini
[Unit]
Description=correlation-analysis-node
After=network.target

[Service]
WorkingDirectory=/data/apps/correlation-analysis-system
Environment=WORKFLOW_AI_SERVER_HOST=127.0.0.1
Environment=WORKFLOW_AI_SERVER_PORT=8787
Environment=PYTHON_ANALYSIS_API_BASE_URL=http://127.0.0.1:8000
Environment=OPENAI_API_KEY=your_key
ExecStart=/usr/bin/node /data/apps/correlation-analysis-system/dist-server/server/index.js
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

### 7.2 Python

```ini
[Unit]
Description=correlation-analysis-python
After=network.target

[Service]
WorkingDirectory=/data/apps/correlation-analysis-system
ExecStart=/data/apps/correlation-analysis-system/backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
User=www-data

[Install]
WantedBy=multi-user.target
```

---

## 8. 发布步骤

建议按以下顺序：

1. 拉取代码并安装前端依赖：`pnpm install`
2. 构建前端与 Node：`pnpm build`
3. 准备 Python 虚拟环境与算法依赖
4. 启动 Python 服务并确认 `127.0.0.1:8000` 可访问
5. 启动 Node 服务并确认 `127.0.0.1:8787/api/storage/me` 可访问
6. 配置 Nginx 并重载
7. 浏览器访问站点并验证工作流保存、AI 编排、随机森林特征重要性、Lasso、Xgboost + SHAP

---

## 9. 验证清单

- 打开页面后无 `/analyze/*` 直连请求，浏览器只出现 `/api/*`
- 执行 Lasso 时，浏览器请求为 `/api/analysis/lasso`
- 执行随机森林特征重要性时，浏览器请求为 `/api/analysis/random-forest-feature-importance`
- 执行 Xgboost + SHAP 时，浏览器请求为 `/api/analysis/xgboost-shap`
- Node 日志正常，Python 日志能收到对应算法请求
- 工作流保存/读取正常
- AI 编排功能正常

---

## 10. 常见问题

### 10.1 前端仍然请求 `localhost:8000`

说明部署产物不是最新版本，或前端缓存未刷新。需要重新构建并重新发布 `dist/`。

### 10.2 Node 能启动，但算法接口报 500

先检查：

- `PYTHON_ANALYSIS_API_BASE_URL` 是否正确
- Python 服务是否真的监听在对应地址
- Node 所在机器是否能访问该地址

### 10.3 Python 接口能通，但页面报错

重点检查：

- Nginx 是否把 `/api/` 正确转发到 Node
- 前端 `VITE_API_BASE_URL` 是否仍指向旧的 Python 地址
- Node 是否使用了最新编译产物 `dist-server/`
