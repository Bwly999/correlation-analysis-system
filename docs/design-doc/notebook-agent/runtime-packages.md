# Pyodide Runtime 包下载与维护

本文档说明 Notebook Agent 的 Pyodide 自托管 runtime 如何准备、如何向 runtime 追加**官方 release 不含的纯 Python 包**（通用流程，不仅限 seaborn），以及相关脚本的使用方式。

> 配套设计文档：`部署与构建.md` §4（资源版本与构建）、`安全模型.md` §6.2（fetch 白名单 shim）。

---

## 1. 背景

Notebook Agent 运行在浏览器内 Pyodide（WASM Python 0.27.7）上，**没有后端 Python**。所有可用的第三方包必须以 wheel 形式预置在自托管 runtime 里，boot 阶段由 `pyodide.loadPackage()` 载入。

包来源分两类：

| 来源 | 是否在官方 release | 准备方式 |
|------|-------------------|----------|
| numpy / pandas / scipy / scikit-learn / matplotlib / statsmodels | ✅ 在 | `setup-pyodide-runtime.mjs` 解压官方 tar.bz2 自动获得 |
| **seaborn 等官方未构建的纯 Python 包** | ❌ 不在 | `setup-pyodide-runtime.mjs` 的 `EXTRA_PYPI_PACKAGES` 清单从 PyPI 单独下载 |

Pyodide 0.27.7 官方 release **不构建 seaborn**（见 [官方包列表](https://pyodide.org/en/0.27.7/usage/packages-in-pyodide.html)），但 seaborn 本身是纯 Python wheel（`py3-none-any`），可从 PyPI 直接下载补进 runtime。

---

## 2. 脚本：`scripts/setup-pyodide-runtime.mjs`

### 2.1 作用

一次性准备 `ops/pyodide-runtime/v0.27.x/`：

1. 从 GitHub release 下载 `pyodide-0.27.7.tar.bz2` 并解压（全量，不裁剪 wheel）
2. 遍历 `EXTRA_PYPI_PACKAGES` 清单，对每个包：
   - 从 PyPI JSON API 解析纯 Python wheel 的下载 URL + sha256
   - 下载 wheel 到 runtime 目录
   - 往 `pyodide-lock.json` 的 `packages` 字典注入一条记录（`depends` / `imports` / `sha256` 等字段）
3. 全程**幂等**：wheel 已存在且 sha256 匹配则跳过下载，lock 条目已一致则不重写

### 2.2 运行方式

```bash
# 首次准备（runtime 目录不存在时下载官方 tar + 补纯 Python 包）
node scripts/setup-pyodide-runtime.mjs

# 再次运行（幂等：runtime 已就绪则只校验/补齐 EXTRA_PYPI_PACKAGES）
node scripts/setup-pyodide-runtime.mjs
```

> 该脚本**未注册到 `package.json` scripts**，直接用 `node` 调用。
>
> 运行需要联网：GitHub release（官方 tar）+ PyPI（纯 Python wheel）。离线环境会失败。

### 2.3 触发时机

- **本地开发**：克隆仓库后、首次启动 dev 前跑一次
- **CI**：缓存 `ops/pyodide-runtime/` 目录（hashKey = `package.json` 锁定的版本 + `EXTRA_PYPI_PACKAGES` 内容）；缓存未命中时跑此脚本
- **升级包版本**：改 `EXTRA_PYPI_PACKAGES` 后重跑（脚本会检测 sha256/version 变化并更新 lock）

---

## 3. 新增一个纯 Python 包（通用流程）

以新增 `xxx` 包为例（假设它是纯 Python，官方 release 没有）。

### 3.1 确认包是纯 Python

先在 [PyPI](https://pypi.org) 确认该包提供 `xxx-*-py3-none-any.whl`（universal wheel，无 C 扩展）。

- ✅ 纯 Python：`py3-none-any.whl`，可直接走本流程
- ❌ 含 C 扩展（`cp312-*.whl` / `pyodide_*_wasm32.whl`）：需要 emscripten 自行编译，**本脚本不支持**，属于另一条更重的路径

### 3.2 确认依赖在 runtime 里已有

包的依赖必须在 runtime 里已经存在（官方 release 自带或已在 `EXTRA_PYPI_PACKAGES` 里），否则 `loadPackage` 时无法解析传递依赖。

可在 [PyPI 包页面](https://pypi.org) 的 `Requires-Dist` 查看直接依赖。例如 seaborn 0.13.2 依赖 `numpy` / `pandas` / `matplotlib`，这三个都在官方 release 里。

### 3.3 往 `EXTRA_PYPI_PACKAGES` 清单追加条目

编辑 `scripts/setup-pyodide-runtime.mjs` 顶部的 `EXTRA_PYPI_PACKAGES` 数组：

```javascript
const EXTRA_PYPI_PACKAGES = [
  {
    name: 'seaborn',
    version: '0.13.2',
    wheelFile: 'seaborn-0.13.2-py3-none-any.whl',
    depends: ['numpy', 'pandas', 'matplotlib'],
    imports: ['seaborn'],
  },
  // 新增条目：
  {
    name: 'xxx',
    version: '1.2.3',
    wheelFile: 'xxx-1.2.3-py3-none-any.whl',
    depends: ['numpy'],           // 直接依赖（lock 中已有的包名）
    imports: ['xxx'],
  },
]
```

字段说明：

| 字段 | 含义 |
|------|------|
| `name` | 包名（与 PyPI 项目名一致，lock 的 key） |
| `version` | 精确版本（必须与 `wheelFile` 里的版本一致） |
| `wheelFile` | wheel 文件名（从 PyPI 拷贝准确文件名） |
| `depends` | 直接依赖包名数组（**不含版本约束**，PyPI 元数据里的 `>=1.2` 等约束忽略，只取包名） |
| `imports` | 该包提供的顶层 import 名（通常与 name 一致；有命名空间包时多个） |

> `sha256` **不用手填**——脚本运行时现算并写入 lock。

### 3.4 运行脚本

```bash
node scripts/setup-pyodide-runtime.mjs
```

脚本会：下载 wheel → 计算 sha256 → 注入 lock 条目。成功后 `ops/pyodide-runtime/v0.27.x/` 里会有 `xxx-1.2.3-py3-none-any.whl`，`pyodide-lock.json` 会多一条 `xxx` 记录。

### 3.5（可选）加入 boot 预装

如果希望该包**boot 阶段就加载好（立即可用）**，编辑 `src/notebook/worker/pyodideBoot.ts` 的 `PACKAGES` 数组追加 `'xxx'`（注意依赖顺序，放在依赖项之后）。

如果**不**加入 `PACKAGES`，包仍在 runtime 里，Agent 可通过 `python_packages(action='load')` 工具按需加载（见 §4）。

### 3.6 同步文档与 prompt

- `部署与构建.md` §4.2 默认包列表（仅当加入 boot 预装时）
- `src/server/notebookAgent/systemPrompt.ts` 的「可用包」段（仅当加入 boot 预装时）

---

## 4. 按需加载机制（python_packages 工具）

即便不加入 boot 预装，runtime 里已有的包都可以在运行时按需加载。

### 4.1 Agent 侧

Agent 调用 `python_packages` 工具：

- `action=list`（默认）：返回 loaded 全量（boot 预装的几个）+ notLoaded 数量提示
- `action=load, packages=['xxx']`：触发 `pyodide.loadPackage('xxx')`，成功后即可 `import xxx`

### 4.2 为什么按需加载能工作

Pyodide 的 `loadPackage` 命中本地 wheel 时内部仍会走 `fetch(localUrl)` 取字节。Worker 在 boot 后把 `self.fetch` 替换成**白名单 shim**（见 `安全模型.md` §6.2）：只放行 `/pyodide/v0.27/` 同源 runtime 资源，外网一律拒。

因此：
- ✅ runtime 内已有的 wheel：shim 放行同源请求，loadPackage 成功
- ❌ runtime 外的包（PyPI 外部安装）：shim 拒绝外网 URL，micropip 装包被阻断

这是纯 Python 包能"按需加载"但不能"动态装外部包"的根本原因。

---

## 5. 验证 checklist

新增/升级包后：

- [ ] `node scripts/setup-pyodide-runtime.mjs` 成功，输出含「wheel 下载完成」或「已就绪」
- [ ] `ops/pyodide-runtime/v0.27.x/` 下能看到对应 `.whl` 文件
- [ ] `pyodide-lock.json` 的 `packages` 里有该包条目（可用 `node -e "console.log(!!require('./ops/pyodide-runtime/v0.27.x/pyodide-lock.json').packages.xxx)"` 确认）
- [ ] 若改了 `PACKAGES`：`npx vitest run src/notebook/worker/__tests__/pyodideBoot.spec.ts` 通过
- [ ] `npx vue-tsc --noEmit` 无类型错误
- [ ] 启动 dev，进 Notebook，让 Agent 跑 `import xxx; xxx.__version__` 返回正确版本

---

## 6. 常见问题

**Q: 升级 seaborn 版本怎么办？**
改 `EXTRA_PYPI_PACKAGES` 里 seaborn 的 `version` 和 `wheelFile`，重跑脚本。脚本检测到 sha256/version 变化会重下 wheel + 更新 lock。

**Q: 某个包依赖另一个不在 runtime 里的包怎么办？**
先把依赖包也加进 `EXTRA_PYPI_PACKAGES`（如果它是纯 Python）或确认它在官方 release 里。否则该包无法用本流程加入。

**Q: CI 上 runtime 缓存失效后重装，seaborn 会丢吗？**
不会。CI 跑的就是 `setup-pyodide-runtime.mjs`，`EXTRA_PYPI_PACKAGES` 的补包逻辑每次都会执行（幂等），只要 CI 能访问 PyPI 就会自动补齐。

**Q: 为什么 lock 条目的 `depends` 不带版本约束？**
Pyodide lock 格式要求 `depends` 是纯包名数组（参照官方 release 里 statsmodels 等条目）。PyPI 元数据里的 `pandas>=1.2` 等约束由 runtime 内实际版本满足，不进 lock。
