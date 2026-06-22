# Pyodide Runtime 包下载与维护

本文档说明如何为 Notebook Agent 的 Pyodide runtime **追加纯 Python 包**（一条命令搞定），以及相关脚本的工作机制。

> 配套设计文档：`部署与构建.md` §4（资源版本与构建）、`安全模型.md` §6.2（fetch 白名单 shim）。

---

## 1. 一条命令加包

```bash
node scripts/add-pyodide-package.mjs --name <包名> [--version <版本>] [--boot]
```

这条命令自动完成：

1. 从 PyPI 查包元数据，确认是纯 Python wheel（`py3-none-any`）
2. 自动解析硬依赖（过滤 extra 可选依赖、剥离版本约束）
3. 下载 wheel 到 `ops/pyodide-runtime/v0.27.x/`
4. 注入 `pyodide-lock.json` 的 packages 字典（sha256 现算）
5. 登记到 `scripts/pyodide-extra-packages.json`（进 git，CI 复现用）
6. `--boot` 时同时把包名加进 `pyodideBoot.ts` 的 PACKAGES（boot 预装）

### 示例

```bash
# 加 seaborn 最新版（不预装，Agent 用 python_packages 按需加载）
node scripts/add-pyodide-package.mjs --name seaborn

# 加 seaborn 指定版本，并 boot 预装
node scripts/add-pyodide-package.mjs --name seaborn --version 0.13.2 --boot

# 查看帮助
node scripts/add-pyodide-package.mjs --help
```

> 脚本未注册到 `package.json` scripts，直接用 `node` 调用。运行需联网（PyPI）。
> 前置：runtime 目录已存在（先跑过 `node scripts/setup-pyodide-runtime.mjs`）。

---

## 2. 适用范围

**能用本脚本加的包**：纯 Python 包（PyPI 上提供 `xxx-*-py3-none-any.whl`，无 C 扩展）。

典型：seaborn、networkx、sympy、regex、toolz 等数据分析/工具库。

**不能用的包**：

- 含 C 扩展的包（`cp312-*.whl`）：需 emscripten 自行编译 wasm wheel，本脚本不支持
- 依赖了不在 runtime 里的包：脚本会报错列出缺失依赖，需先把依赖加进来

---

## 3. --boot 预装 vs 按需加载

加包时有两个选择：

| 模式 | 命令 | 效果 |
|------|------|------|
| **按需加载**（默认） | 不加 `--boot` | 包在 runtime 里但 boot 不加载；Agent 调 `python_packages(action='load')` 按需加载后再 import |
| **boot 预装** | `--boot` | 包在 boot 阶段 `loadPackage`，立即可用（每次 exec 仍需自行 import） |

**怎么选**：常用必备包（如 seaborn）用 `--boot`；偶尔才用的包走按需加载（省 boot 时间）。

### 按需加载为什么能工作

Pyodide 的 `loadPackage` 命中本地 wheel 时内部走 `fetch(localUrl)` 取字节。Worker 在 boot 后把 `self.fetch` 替换成**白名单 shim**（见 `安全模型.md` §6.2）：只放行 `/pyodide/v0.27/` 同源 runtime 资源，外网一律拒。所以 runtime 内 wheel 能加载，外部包装不了。

---

## 4. 版本升级

```bash
# 升级到指定版本（脚本检测 sha256/version 变化，自动重下 wheel + 更新 lock + 清单）
node scripts/add-pyodide-package.mjs --name seaborn --version 0.13.3
```

幂等：重复跑同一版本会校验 sha256，一致则跳过。

---

## 5. 幕后：两个脚本如何协作

| 脚本 | 作用 | 何时跑 |
|------|------|--------|
| `add-pyodide-package.mjs` | 日常加包/升级（写 wheel + lock + 清单） | 开发者按需 |
| `setup-pyodide-runtime.mjs` | 准备整个 runtime（解压官方 tar + 读清单补纯 Python 包） | 首次准备 / CI 缓存未命中 |

**关键**：清单文件 `scripts/pyodide-extra-packages.json` 进 git，是"项目依赖哪些纯 Python 包"的事实记录。`add-pyodide-package.mjs` 写它，`setup-pyodide-runtime.mjs` 读它。这样：

- 开发者本地加包 → 清单提交 → CI 克隆后 setup 脚本读清单 → 自动补齐同样的包
- 不需要在 CI 上手动重跑每条 add 命令

### 清单文件格式（不用手改，仅供理解）

```json
{
  "packages": [
    {
      "name": "seaborn",
      "version": "0.13.2",
      "wheelFile": "seaborn-0.13.2-py3-none-any.whl",
      "depends": ["numpy", "pandas", "matplotlib"],
      "imports": ["seaborn"]
    }
  ]
}
```

---

## 6. 验证 checklist

加包后：

- [ ] 脚本输出「完成 ✅」且无报错
- [ ] `ops/pyodide-runtime/v0.27.x/` 下有对应 `.whl` 文件
- [ ] `node -e "console.log(!!require('./ops/pyodide-runtime/v0.27.x/pyodide-lock.json').packages.<包名>)"` 输出 `true`
- [ ] 若用了 `--boot`：`npx vitest run src/notebook/worker/__tests__/pyodideBoot.spec.ts` 通过
- [ ] 启动 dev，进 Notebook，Agent 跑 `import <包名>; <包名>.__version__` 返回正确版本

---

## 7. 常见问题

**Q: 报「依赖缺失」怎么办？**
脚本会列出缺失的依赖包名。先把每个依赖用本脚本加进来（如果它们也是纯 Python），或确认它们在 Pyodide 官方 release 里（numpy/pandas 等自带）。

**Q: 报「没有纯 Python wheel」怎么办？**
该包含 C 扩展，本脚本不支持。需 emscripten 编译 wasm wheel（另一条更重的路径）。

**Q: CI 上 runtime 缓存失效重装，加的包会丢吗？**
不会。CI 跑 `setup-pyodide-runtime.mjs`，它会读 `scripts/pyodide-extra-packages.json`（进 git）自动补齐清单里的所有包。

**Q: 为什么 lock 条目的 depends 不带版本约束？**
Pyodide lock 格式要求 depends 是纯包名数组（参照官方 release 里 statsmodels 等条目）。PyPI 元数据的 `pandas>=1.2` 等约束由 runtime 内实际版本满足，不进 lock。

**Q: 清单文件在哪？能手动改吗？**
`scripts/pyodide-extra-packages.json`。**不建议手改**——用 CLI 增删改，避免 sha256/version 不一致。手动改后跑一次 `setup-pyodide-runtime.mjs` 会自动校正 lock。
