# 部署手册

本目录提供一套“通用 Linux 手工部署 + 半自动脚本”方案，不依赖 Docker。

适用目标：

- 前端静态资源由 Nginx 提供
- 浏览器只访问 `/api/*`
- Node 服务统一承接存储、AI 编排、算法代理接口
- Python 服务只负责算法计算

推荐拓扑：

```text
浏览器
  -> Nginx
    -> 前端静态资源 dist
    -> /api/* 转发到 Node

Node 服务
  -> /api/storage/*
  -> /api/workflow-ai/*
  -> /api/analysis/*
       -> 转发到 Python

Python 服务
  -> /analyze/lasso
  -> /analyze/xgboost-shap
```

---

## 1. 目录说明

- `env/`
  - 环境变量模板
- `scripts/`
  - 半自动部署脚本
- `templates/`
  - Nginx 与 systemd 模板

---

## 2. 前置要求

目标机器建议具备：

- `git`
- `node >= 20.19`
- `pnpm`
- `python >= 3.10`
- `nginx`
- `systemd`

可先检查版本：

```bash
node -v
pnpm -v
python3 --version
nginx -v
```

如果没有 `pnpm`：

```bash
npm install -g pnpm
```

---

## 3. 推荐部署目录

建议把项目放到：

```bash
/data/apps/correlation-analysis-system
```

以下手册默认以这个路径举例。

---

## 4. 环境变量准备

### 4.1 前端环境变量

复制模板：

```bash
cp deploy/env/frontend.env.example .env.production.local
```

推荐配置：

```env
VITE_STORAGE_TYPE=server
VITE_API_BASE_URL=/api
# VITE_WORKFLOW_API_AUTH_TOKEN=仅本地调试使用的 JWT
```

说明：

- 如果前端与 Node 通过同一个域名由 Nginx 承接，推荐直接写 `/api`
- 如果你们必须分离域名，也可以改成完整地址，例如 `https://api.example.com/api`
- `VITE_WORKFLOW_API_AUTH_TOKEN` 只建议本地调试固定 token；生产环境建议在 `src/services/apiAuth.ts` 对接内部系统获取的 JWT

### 4.2 Node 运行环境变量

复制模板：

```bash
cp deploy/env/server.env.example deploy/env/server.env
```

按实际机器修改：

```env
WORKFLOW_AI_SERVER_HOST=127.0.0.1
WORKFLOW_AI_SERVER_PORT=8787
WORKFLOW_STORAGE_BACKEND=lowdb
WORKFLOW_STORAGE_DATA_DIR=.workflow-storage
WORKFLOW_STORAGE_MYSQL_HOST=127.0.0.1
WORKFLOW_STORAGE_MYSQL_PORT=3306
WORKFLOW_STORAGE_MYSQL_USER=root
WORKFLOW_STORAGE_MYSQL_PASSWORD=
WORKFLOW_STORAGE_MYSQL_DATABASE=correlation_analysis_system
WORKFLOW_JWT_SECRET=
PYTHON_ANALYSIS_API_BASE_URL=http://127.0.0.1:8000
OPENAI_API_KEY=
OPENAI_COMPAT_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
WORKFLOW_AI_DEFAULT_MODEL=glm-4.7
```

说明：

- `OPENAI_API_KEY` 只在你启用系统默认 AI 编排模型时必填
- Python 服务建议只监听本机回环地址，不对外暴露
- `WORKFLOW_STORAGE_BACKEND` 支持 `lowdb` 与 `mysql`
- 当 `WORKFLOW_STORAGE_BACKEND=lowdb` 时，`WORKFLOW_STORAGE_DATA_DIR` 用于指定工作流与历史数据目录
- 当 `WORKFLOW_STORAGE_BACKEND=mysql` 时，请先手工创建 `WORKFLOW_STORAGE_MYSQL_DATABASE`，再执行 `pnpm db:mysql:migrate` 应用 Drizzle 迁移
- `lowdb` 模式默认按单 Node 实例设计，不建议多个实例直接共享同一落盘目录
- `mysql` 模式适合多实例共享同一套工作流、版本和历史数据
- `WORKFLOW_JWT_SECRET` 非空时启用全局 Node API JWT 鉴权；除 `OPTIONS` 预检外，请求必须携带 `Authorization: Bearer <JWT>`
- JWT payload 默认使用 `w3Account` 作为用户 ID、`cnName` 作为用户名称；未配置 `WORKFLOW_JWT_SECRET` 时保持本地无鉴权模式

---

## 5. Python 虚拟环境与依赖

执行：

```bash
bash deploy/scripts/setup_python_env.sh
```

脚本行为：

- 在 `backend/.venv` 创建虚拟环境
- 优先安装 `backend/requirements.txt`
- 若仓库中没有 `backend/requirements.txt`，退回安装一组最小运行依赖：
  - `fastapi`
  - `uvicorn`
  - `numpy`
  - `pandas`
  - `scikit-learn`
  - `xgboost`
  - `shap`
  - `matplotlib`

如果你们后续补齐了 `backend/requirements.txt`，脚本会优先按它安装。

---

## 6. 构建前端和 Node

执行：

```bash
bash deploy/scripts/build.sh
```

脚本行为：

- 执行 `pnpm install`
- 若使用 MySQL storage，先执行 `pnpm db:mysql:migrate`
- 执行 `pnpm build`

构建产物：

- 前端：`dist/`
- Node：`dist-server/`（自包含单文件，不依赖 `node_modules`）

---

## 7. 手工启动服务

### 7.1 启动 Python

执行：

```bash
bash deploy/scripts/start_python.sh
```

默认行为：

- 使用 `backend/.venv/bin/uvicorn`
- 启动 `backend.main:app`
- 默认监听 `127.0.0.1:8000`

你也可以手工启动：

```bash
source backend/.venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 7.2 启动 Node

执行：

```bash
bash deploy/scripts/start_node.sh
```

默认行为：

- 自动加载 `deploy/env/server.env`
- 启动 `dist-server/server/index.js`

---

## 8. 健康检查

执行：

```bash
bash deploy/scripts/healthcheck.sh
```

检查内容：

- Python 根接口是否可访问
- Node `/api/storage/me` 是否可访问
- Node 到 Python 的 Lasso 代理链路是否可用

如果 Python 算法因样本问题返回 400，脚本会明确标明是“链路已通但样本校验失败”，不会误报成 Node 代理故障。

如果已配置 `WORKFLOW_JWT_SECRET`，健康检查也需要携带内部系统签发的 JWT；执行脚本时可临时设置 `NODE_AUTH_TOKEN=<JWT>`，也可用带 `Authorization` 头的 `curl` 命令单独排查。

---

## 9. 半自动发布流程

执行：

```bash
bash deploy/scripts/deploy_release.sh
```

脚本行为：

1. 检查当前目录是否为 git 仓库
2. 显示当前分支与提交信息
3. 执行 `git pull --ff-only`
4. 构建前端和 Node
5. 准备 Python 虚拟环境与依赖
6. 提示下一步手工重启 systemd 服务与 reload Nginx

这个脚本不会直接修改 Nginx，也不会直接重启服务，避免在通用 Linux 环境里误操作。

---

## 10. Nginx 配置

参考模板：

```bash
deploy/templates/nginx.conf.example
```

典型配置：

```nginx
server {
    listen 80;
    server_name analysis.example.com;

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

应用后执行：

```bash
nginx -t
systemctl reload nginx
```

---

## 10.1 Notebook（pyodide）部署要点

Notebook 是后引入的独立入口（`/notebook.html`），在浏览器内用 pyodide 跑 Python。它对 nginx 有额外要求，**如果沿用上面第 10 节的老配置，notebook 一定起不来**。请使用 `deploy/templates/nginx.conf.example` 的最新版本，它已包含以下三处关键配置：

### 1. pyodide 资源位置（无需额外操作）

pyodide 不需要单独部署。执行 `pnpm build` 时，`build:pyodide` 脚本会自动把 `ops/pyodide-runtime/v0.27.x/` 拷贝到 `dist/pyodide/v0.27/`，随前端构建产物一起走。部署时 `dist/` 整个拷到 nginx root 即可，pyodide 已在内。

> 不要把 `ops/` 单独拷到部署机。`ops/` 不进 git，只是开发机的源材料。

### 2. COI 头（命门）

notebook 用 `SharedArrayBuffer`（pyodide 中断 buffer 依赖），浏览器只在 `crossOriginIsolated === true` 时才提供。nginx 必须配：

- `/notebook.html`：带 `COOP: same-origin` + `COEP: require-corp`
- `/pyodide/*`：带 `CORP: cross-origin`（反直觉，但 COEP 模式下的硬规则，见 `src/server/notebookHeadersPlugin.ts` 注释）+ 正确的 `Content-Type: application/wasm`（pyodide 加载硬要求）

模板里的三个 `add_header` 一处都不能漏或改值。每行末尾的 `always` 必须保留，否则 4xx 时不带头。

### 3. SSE 流式配置

notebook Agent 事件流走 SSE，nginx 反代 `/api/` 时必须 `proxy_buffering off`，否则事件积压、长任务超时断开。模板已含此项。

### 4. 验证

部署后浏览器开 `/notebook.html`，F12 检查：

- Console：`crossOriginIsolated` 必须为 `true`
- Network：`GET /pyodide/v0.27/pyodide.asm.wasm` 状态 200，Response Headers 含 `Cross-Origin-Resource-Policy: cross-origin` 和 `Content-Type: application/wasm`

若 `crossOriginIsolated` 为 `false`，99% 是 `/notebook.html` 漏带 COOP/COEP，或某个 `/pyodide/*` 响应漏带 CORP。Console 通常会有 `NotSameOriginAfterDefaultedToSameOriginByCoep` 类报错。

---

## 11. systemd 配置

参考模板：

- `deploy/templates/correlation-analysis-node.service.example`
- `deploy/templates/correlation-analysis-python.service.example`

### 11.1 Node

```bash
sudo cp deploy/templates/correlation-analysis-node.service.example /etc/systemd/system/correlation-analysis-node.service
sudo vim /etc/systemd/system/correlation-analysis-node.service
```

重点替换：

- `WorkingDirectory`
- `EnvironmentFile`
- `ExecStart`
- `User`

### 11.2 Python

```bash
sudo cp deploy/templates/correlation-analysis-python.service.example /etc/systemd/system/correlation-analysis-python.service
sudo vim /etc/systemd/system/correlation-analysis-python.service
```

重点替换：

- `WorkingDirectory`
- `ExecStart`
- `User`

### 11.3 启用服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable correlation-analysis-python
sudo systemctl enable correlation-analysis-node
sudo systemctl start correlation-analysis-python
sudo systemctl start correlation-analysis-node
```

查看状态：

```bash
sudo systemctl status correlation-analysis-python
sudo systemctl status correlation-analysis-node
```

---

## 12. 正式上线步骤

建议按顺序执行：

1. 拉代码

```bash
cd /data/apps/correlation-analysis-system
git pull --ff-only
```

2. 复制或检查环境变量文件

```bash
cp deploy/env/frontend.env.example .env.production.local
cp deploy/env/server.env.example deploy/env/server.env
```

3. 准备 Python 环境

```bash
bash deploy/scripts/setup_python_env.sh
```

4. 构建前端和 Node

```bash
bash deploy/scripts/build.sh
```

5. 重启服务

```bash
sudo systemctl restart correlation-analysis-python
sudo systemctl restart correlation-analysis-node
```

6. 重载 Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

7. 执行健康检查

```bash
bash deploy/scripts/healthcheck.sh
```

8. 浏览器验收

- 页面正常打开
- 工作流保存/读取正常
- `Lasso 回归` 能运行
- `Xgboost + SHAP` 能运行
- 浏览器中只出现 `/api/*`，不再直接访问 `/analyze/*`

---

## 13. 使用 pm2 管理（跨平台）

如果你需要在 Windows 或不想配置 systemd 的环境运行，可以使用 pm2 统一管理 Node 和 Python 服务。

### 13.1 安装 pm2

```bash
npm install -g pm2
```

### 13.2 启动服务

```bash
bash deploy/scripts/start_pm2.sh
```

或者直接执行：

```bash
pm2 start ecosystem.config.cjs
```

### 13.3 停止服务

```bash
bash deploy/scripts/stop_pm2.sh
```

或者直接执行：

```bash
pm2 stop ecosystem.config.cjs
```

### 13.4 常用命令

```bash
pm2 status          # 查看服务状态
pm2 logs            # 查看实时日志
pm2 logs cas-node   # 只看 Node 服务日志
pm2 logs cas-python # 只看 Python 服务日志
pm2 restart all     # 重启所有服务
pm2 monit           # 监控面板
```

### 13.5 日志位置

pm2 日志输出到 `deploy/logs/` 目录：

- `node-out.log` / `node-error.log`：Node 服务日志
- `python-out.log` / `python-error.log`：Python 服务日志

---

## 14. 常见排障

### 14.1 前端还在请求 `localhost:8000`

原因通常有两个：

- `dist/` 不是最新构建产物
- 浏览器缓存了旧包

处理：

```bash
bash deploy/scripts/build.sh
sudo systemctl reload nginx
```

然后浏览器强刷。

### 14.2 Node 能启动，但 `/api/analysis/*` 返回 500

重点检查：

- `deploy/env/server.env` 里的 `PYTHON_ANALYSIS_API_BASE_URL`
- Python 是否真的启动在 `127.0.0.1:8000`
- 机器本机是否能访问 Python

可先执行：

```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8787/api/storage/me
# 已启用 WORKFLOW_JWT_SECRET 时：
curl -H "Authorization: Bearer <JWT>" http://127.0.0.1:8787/api/storage/me
```

### 14.3 Python 启动失败

通常是：

- 虚拟环境没建好
- 算法依赖没装全

重新执行：

```bash
bash deploy/scripts/setup_python_env.sh
```

### 14.4 AI 编排不可用

检查：

- `OPENAI_API_KEY`
- `OPENAI_COMPAT_BASE_URL`
- `WORKFLOW_AI_DEFAULT_MODEL`

---

## 15. 推荐做法

如果你要最稳妥的线上方案，建议：

- 前端环境变量固定用 `VITE_API_BASE_URL=/api`
- Nginx 统一托管静态资源和 `/api`
- Node 只监听 `127.0.0.1:8787`
- Python 只监听 `127.0.0.1:8000`
- 所有外部流量统一先进入 Nginx

这样最简单，也最容易排障。
