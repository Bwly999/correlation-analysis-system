# 附录 B：节点速查总表

> 本表列出系统全部节点。**活跃(active)** 节点可从节点库新建；**旧版(legacy)** 节点仅用于打开历史工作流，不在新建库中。
>
> 节点按官方库分组(`libraryGroup`)归类。

---

## 按分组速查

### 导入数据 `import-data`（trigger）

| 节点 id | 显示名 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------------|
| `file-import` | 本地文件导入 | table | 活跃 | 上传 CSV/Excel/JSON |
| `manual-json-import` | 手动输入数据 | table / json | 活跃 | 粘贴 JSON 作数据源 |
| `neighbor-system` | 看板数据对接 | table | 活跃 | 从看板系统取数（见 [附录 A](./A-看板数据对接.md)） |

### 清洗与筛选 `clean-filter`（action）

| 节点 id | 显示名 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------------|
| `data-dedup` | 去重 | table | 活跃 | 按整行或字段组合去重 |
| `data-missing-outlier` | 缺失/异常值处理 | table | 活跃 | 清空值、IQR/百分比/手动区间剔异常 |
| `data-encoding-scaling` | 编码/缩放 | table | 活跃 | 分类编码 + Z-Score/Min-Max 缩放 |
| `data-filter` | 数据筛选 | table | 活跃 | 多条件过滤（AND/OR） |
| `data-cleaning` | 数据清洗 | table | **旧版** | 已拆分为上面三个节点 |

### 字段与结构处理 `field-shaping`（action）

| 节点 id | 显示名 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------------|
| `field-selection` | 字段选择 | table | 活跃 | 包含/排除指定字段（支持正则搜索） |
| `sort` | 排序 | table | 活跃 | 多优先级排序，支持升降序 |
| `data-limit` | 数据量限制 | table | 活跃 | 保留前 N 或后 N 条 |
| `js-transform` | JS 代码执行 | table | 活跃 | 自定义 JS 转换 rows |

### 合并与聚合 `merge-aggregate`（action）

| 节点 id | 显示名 | 输入 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------|------------|
| `data-merge` | 数据合并 | 多输入(≥2) | table / tableCollection | 活跃 | 纵向追加/横向关联/分组集合 |
| `data-aggregation` | 数据聚合 | table | table | 活跃 | 分组统计/移动窗口/时间窗口/行内合并 |
| `data-profiling` | 数据体检 | table | report | **旧版** | 字段类型与风险识别（旧工作流用） |

### 统计分析 `stat-analysis`（terminal）

| 节点 id | 显示名 | 执行 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------|------------|
| `correlation-analysis` | 单调性分析 | 前端 | report | 活跃 | Pearson/Spearman/Kendall 相关性 |
| `vif` | VIF 共线性检测 | 前端 | report | 活跃 | 多重共线性诊断 |
| `pca` | PCA 主成分分析 | 前端 | report | 活跃 | 降维、解释方差、载荷 |
| `anova` | 方差分析 | 前端 | report | 活跃 | 单因素方差分析 |
| `classification-factor-screening` | 分类因子筛查 | 前端 | report | 活跃 | 分类目标的因子显著性筛查 |
| `pearson` | Pearson 相关分析 | 前端 | report | **旧版** | 用 `correlation-analysis` 替代 |
| `spearman` | Spearman 秩相关分析 | 前端 | report | **旧版** | 用 `correlation-analysis` 替代 |
| `kendall` | Kendall 秩相关分析 | 前端 | report | **旧版** | 用 `correlation-analysis` 替代 |

### 模型分析 `model-analysis`（terminal）

| 节点 id | 显示名 | 执行 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------|------------|
| `xgboost-shap` | XGBoost + SHAP | 后端 Python | report | 活跃 | 回归 + SHAP 变量贡献解释 |
| `random-forest-feature-importance` | 随机森林特征重要性 | 后端 Python | report | 活跃 | 特征重要性排序 |
| `lasso` | Lasso 回归 | 后端 Python | report | 活跃 | L1 正则稀疏特征选择 |
| `multiple-linear-regression` | 多元线性回归 | 后端 Python | report | 活跃 | 多因子线性回归 |
| `logistic-regression-classification` | 逻辑回归分类分析 | 后端 Python | report | 活跃 | 二分类/多分类建模 |

### 结果展示与导出 `result-output`（terminal）

| 节点 id | 显示名 | 输出 | 状态 | 一句话用途 |
|---------|--------|------|------|------------|
| `chart-display` | 图表展示 | chart | **旧版** | 散点/柱状/分布/箱线图，已被结果预览的图表能力取代 |
| `data-export` | 数据导出 | file | **旧版** | CSV/Excel/JSON/HTML 导出，已被结果预览的导出能力取代 |

---

## 按角色速查

| 角色 | category | 节点 |
|------|----------|------|
| **触发器**（起点） | trigger | `file-import`、`manual-json-import`、`neighbor-system` |
| **处理**（中段） | action | 去重/缺失异常/编码缩放/筛选/字段选择/排序/限量/合并/聚合/JS 转换（+旧版 data-cleaning、data-profiling） |
| **终点**（分析/输出） | terminal | 相关性/VIF/PCA/ANOVA/分类筛查/XGBoost-SHAP/随机森林/Lasso/线性回归/逻辑回归（+旧版 pearson/spearman/kendall/chart-display/data-export） |

---

## 输出类型说明

| 输出类型 | 含义 |
|----------|------|
| `table` | 表格（行 × 列） |
| `json` | 任意 JSON 结构 |
| `report` | 结构化分析报告（含图表与解读） |
| `chart` | 单独图表（旧版） |
| `file` | 导出文件（旧版） |
| `tableCollection` | 多张表的集合（data-merge 的 collection 模式） |

---

> 各节点的详细用法见 [03-节点手册](../03-节点手册/README.md)。
