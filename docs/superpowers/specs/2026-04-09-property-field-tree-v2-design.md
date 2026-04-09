# 树形字段虚拟树替换设计

## 背景

当前 `src/components/workflow/config/propertyField/inputs/PropertyFieldTreeInput.vue` 使用 `PrimeVue Tree` 渲染树形字段。即使已经加入“安全展开”和搜索结果保护，展开大量节点时仍然会因为树组件递归挂载大量 DOM 导致体验迟滞。

本次目标不是继续在 `PrimeVue Tree` 上做补丁，而是直接将树主体替换为支持虚拟渲染的组件，并在尽量不改变现有业务协议的前提下提升展开与搜索体验。

## 目标

- 使用 `Element Plus` 的 `Tree V2` 替换当前 `PrimeVue Tree`
- 采用按需引入，不把 `Element Plus` 全局注册到项目
- 保持当前树形字段的主要业务行为不变：
  - 单选时仅允许叶子节点最终生效
  - 多选支持父子联动与半选
  - 保持当前对象值输出协议
- 搜索仍使用本地树过滤逻辑
- 搜索结果保护先通过变量关闭，优先观察 `Tree V2` 在不保护场景下的真实性能

## 非目标

- 不重做整套树搜索交互文案
- 不改 `NodeProperty` 协议
- 不引入第二套全局 UI 主题
- 不在本次实现里设计自动阈值切换策略

## 方案比较

### 方案 A：继续优化 `PrimeVue Tree`

- 优点：改动小
- 缺点：核心瓶颈仍在递归树渲染，提升有限

### 方案 B：自研虚拟树

- 优点：UI 和行为完全可控
- 缺点：需要自己实现展开、半选、父子联动、可见列表维护，风险高

### 方案 C：替换为 `Element Plus Tree V2`

- 优点：现成虚拟树，支持大数据和复选树
- 缺点：引入一项新的组件依赖，需要处理局部样式接入

本次采用方案 C。

## 设计

### 1. 依赖接入

- 在 `package.json` 中新增 `element-plus`
- 在树输入组件内按需引入 `ElTreeV2`
- 仅接入 `Tree V2` 所需样式，不做全局 `app.use(ElementPlus)`

### 2. 组件边界

#### `PropertyFieldTreeInput.vue`

职责：

- 维持输入框、按钮、错误态、空态、提示文案
- 负责 `modelValue` 与树选择状态互转
- 接入 `ElTreeV2`

保留内容：

- `selectionKeysToObjectValue`
- `objectValueToSelectionKeys`
- `normalizeSingleSelection`

替换内容：

- 删除 `PrimeVue Tree` 渲染
- 改为 `Element Plus Tree V2` 的节点数据与勾选/展开事件桥接

#### `usePropertyFieldTreeSearch.ts`

职责继续保持：

- 标准化树节点
- 搜索防抖
- 搜索过滤

新增开关：

- `enableSearchResultGuard = false`
- `enableSafeExpandLimit = true` 或单独变量化

开关语义：

- `enableSearchResultGuard = false` 时，搜索直接返回完整命中子树
- `enableSearchResultGuard = true` 时，恢复当前“命中子树 + 摘要节点”保护策略

### 3. 数据与行为兼容

#### 选择行为

- 对外仍使用当前 `TreeSelectionKeys` 风格的数据桥接
- 组件内部需要把 `Element Plus Tree V2` 的选中结果转换为现有协议
- 单选时最终只保留叶子节点
- 多选时保留父子联动与半选状态

#### 展开行为

- 展开状态由组件本地维护
- “安全展开”按钮仍保留，但是否限制展开数量由变量控制
- 默认先保留展开限制，便于和关闭搜索保护后的体验分开评估

#### 搜索行为

- 搜索仍然基于前端树数据过滤，而不是完全依赖组件内建过滤
- 搜索态下手动展开父节点时，只允许看到命中子树
- 关闭保护时，不生成摘要节点

## 影响文件

- `package.json`
- `pnpm-lock.yaml`
- `src/components/workflow/config/propertyField/inputs/PropertyFieldTreeInput.vue`
- `src/components/workflow/config/propertyField/usePropertyFieldTreeSearch.ts`
- `src/components/workflow/config/propertyField/inputs/__tests__/PropertyFieldTreeInput.spec.ts`
- `src/components/workflow/config/propertyField/__tests__/usePropertyFieldTreeSearch.spec.ts`

如实现细节改变现有树字段交互说明，再补 `CHANGELOG.md`。

## 测试策略

先写失败测试，再实现：

1. `usePropertyFieldTreeSearch.spec.ts`
   - `enableSearchResultGuard = false` 时搜索返回完整命中子树
   - `enableSearchResultGuard = true` 时仍保留摘要节点降级

2. `PropertyFieldTreeInput.spec.ts`
   - 组件改用 `ElTreeV2` 后，搜索、展开、收起仍可工作
   - 单选叶子约束不变
   - 对象值单选 / 多选输出不变

3. 如需要新增桥接函数
   - 为 `Element Plus` 勾选结果到现有 `selectionKeys` 的转换补独立单测

## 风险

- `Element Plus Tree V2` 的勾选和半选状态事件模型与 `PrimeVue Tree` 不完全一致，需要做一层兼容桥接
- 局部引入新组件库后，可能出现样式基线差异，需要局部样式收敛
- 若关闭搜索保护后高命中搜索仍然明显卡顿，需要再开启保护或追加阈值策略

## 验收标准

- 大树展开时主观流畅度明显优于当前 `PrimeVue Tree`
- 搜索、勾选、对象值输出协议不回归
- 搜索保护可通过变量关闭
- 相关单测通过
