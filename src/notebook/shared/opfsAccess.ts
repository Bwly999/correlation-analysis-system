/**
 * OPFS 工作区访问层（最小版）。
 *
 * 设计要点：
 *   - 调用方通过 navigator.storage.getDirectory() 拿到 root，再传进来。
 *     测试时可注入内存版替身，不耦合浏览器 OPFS API 实现细节。
 *   - 路径必须以 inputs/ scripts/ artifacts/ reports/ 之一开头，
 *     拒绝绝对路径与 .. 越界（详见 docs/design-doc/notebook-agent/架构与数据流.md §3.2）。
 *   - 跨平台：路径分隔符同时接受 / 与 \。
 */

// ──────────────────────────────────────────────
// 公开常量
// ──────────────────────────────────────────────

export const WORKSPACE_TOP_DIRS = ['inputs', 'scripts', 'artifacts', 'reports'] as const
export type WorkspaceTopDir = (typeof WORKSPACE_TOP_DIRS)[number]
const TOP_DIR_SET: ReadonlySet<string> = new Set<string>(WORKSPACE_TOP_DIRS)

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

/**
 * 我们只用 FileSystemDirectoryHandle 的子集，给出一个最小接口
 * 让浏览器原生 OPFS 与测试 mock 都能匹配（duck typing）。
 */
export interface OpfsDirectoryHandle {
  readonly name: string
  readonly kind: 'directory'
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<OpfsDirectoryHandle>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<OpfsFileHandle>
  values(): AsyncIterableIterator<OpfsDirectoryHandle | OpfsFileHandle>
  removeEntry?(name: string, opts?: { recursive?: boolean }): Promise<void>
}

export interface OpfsFileHandle {
  readonly name: string
  readonly kind: 'file'
  createWritable(): Promise<OpfsWritable>
  getFile(): Promise<OpfsFile>
}

export interface OpfsWritable {
  write(data: ArrayBuffer | Uint8Array | string): Promise<void>
  close(): Promise<void>
}

export interface OpfsFile {
  readonly size: number
  readonly type: string
  readonly lastModified: number
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

export interface TreeNode {
  name: string
  kind: 'directory' | 'file'
  size?: number
  modifiedAt?: number
  children?: TreeNode[]
}

// ──────────────────────────────────────────────
// 路径解析
// ──────────────────────────────────────────────

const ABSOLUTE_PATH_RE = /^([a-zA-Z]:[/\\]|[/\\])/

export const resolveSafePath = (relPath: string): string[] => {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new Error('路径不能为空')
  }
  if (ABSOLUTE_PATH_RE.test(relPath)) {
    throw new Error(`禁止绝对路径：${relPath}`)
  }
  const segments = relPath.split(/[/\\]+/).filter(Boolean)
  const stack: string[] = []
  for (const seg of segments) {
    if (seg === '.') continue
    if (seg === '..') {
      throw new Error(`禁止 .. 越界：${relPath}`)
    }
    stack.push(seg)
  }
  if (stack.length === 0) {
    throw new Error(`空路径：${relPath}`)
  }
  const top = stack[0]!
  if (!TOP_DIR_SET.has(top)) {
    throw new Error(
      `路径必须以 ${WORKSPACE_TOP_DIRS.join('/')} 之一开头，得到 "${top}"`,
    )
  }
  return stack
}

// ──────────────────────────────────────────────
// 操作
// ──────────────────────────────────────────────

export const ensureWorkspaceTree = async (root: OpfsDirectoryHandle): Promise<void> => {
  for (const dir of WORKSPACE_TOP_DIRS) {
    await root.getDirectoryHandle(dir, { create: true })
  }
}

const navigateToParent = async (
  root: OpfsDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<OpfsDirectoryHandle> => {
  // segments 至少有一个分量（已经过 resolveSafePath 校验），最后一个是文件名
  let dir = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i]!, { create })
  }
  return dir
}

const toUint8 = (data: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Uint8Array) return data
  return new Uint8Array(data)
}

export const writeFile = async (
  root: OpfsDirectoryHandle,
  relPath: string,
  data: ArrayBuffer | Uint8Array | string,
  tracker?: QuotaTracker,
): Promise<{ path: string; bytes: number }> => {
  const segments = resolveSafePath(relPath)
  const bytes = toUint8(data)
  if (tracker) tracker.reserveOrThrow(bytes.byteLength)
  const parentDir = await navigateToParent(root, segments, /* create */ true)
  const fileHandle = await parentDir.getFileHandle(segments[segments.length - 1]!, {
    create: true,
  })
  const writable = await fileHandle.createWritable()
  await writable.write(bytes)
  await writable.close()
  return { path: segments.join('/'), bytes: bytes.byteLength }
}

export const readFile = async (root: OpfsDirectoryHandle, relPath: string): Promise<string> => {
  const segments = resolveSafePath(relPath)
  let dir = root
  try {
    for (let i = 0; i < segments.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(segments[i]!)
    }
    const handle = await dir.getFileHandle(segments[segments.length - 1]!)
    const file = await handle.getFile()
    return await file.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/NotFoundError|not.?found|不存在/i.test(message)) {
      throw new Error(`文件不存在：${relPath}`)
    }
    throw err
  }
}

/**
 * 拿原始字节，用于二进制判定 / fs_grep 头部探测 / 下载 zip。
 */
export const readBytes = async (
  root: OpfsDirectoryHandle,
  relPath: string,
): Promise<Uint8Array> => {
  const segments = resolveSafePath(relPath)
  let dir = root
  try {
    for (let i = 0; i < segments.length - 1; i += 1) {
      dir = await dir.getDirectoryHandle(segments[i]!)
    }
    const handle = await dir.getFileHandle(segments[segments.length - 1]!)
    const file = await handle.getFile()
    const ab = await file.arrayBuffer()
    return new Uint8Array(ab)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/NotFoundError|not.?found|不存在/i.test(message)) {
      throw new Error(`文件不存在：${relPath}`)
    }
    throw err
  }
}

/**
 * 浅查询：返回 root 下某级目录的直接 entries（不递归）。
 *
 * 拒绝拿 workspace 顶级目录之外的内容（即使空字符串也接受 = 列出 4 个顶级目录）。
 */
export const listDirectoryEntries = async (
  root: OpfsDirectoryHandle,
  relPath: string,
): Promise<TreeNode[]> => {
  let dir = root
  if (relPath !== '') {
    const segments = resolveSafePath(relPath)
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg)
    }
  }
  const out: TreeNode[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      out.push({ name: entry.name, kind: 'directory' })
    } else {
      const file = await entry.getFile()
      out.push({
        name: entry.name,
        kind: 'file',
        size: file.size,
        modifiedAt: file.lastModified,
      })
    }
  }
  return out
}

/**
 * 删除文件或目录（递归）。
 */
export const removePath = async (
  root: OpfsDirectoryHandle,
  relPath: string,
): Promise<void> => {
  const segments = resolveSafePath(relPath)
  let dir = root
  for (let i = 0; i < segments.length - 1; i += 1) {
    dir = await dir.getDirectoryHandle(segments[i]!)
  }
  if (!dir.removeEntry) {
    throw new Error('该 OPFS handle 不支持 removeEntry')
  }
  await dir.removeEntry(segments[segments.length - 1]!, { recursive: true })
}

// ──────────────────────────────────────────────
// 配额控制
//
// 业务层简单维护"已写字节累计"，超过 SESSION_QUOTA_BYTES 抛 quota_exceeded。
// 浏览器全局配额由 navigator.storage.estimate 报告，仅作 UI 提示。
// ──────────────────────────────────────────────

export const SESSION_QUOTA_BYTES = 500 * 1024 * 1024
export const SINGLE_WRITE_LIMIT_BYTES = 50 * 1024 * 1024

export interface QuotaTracker {
  /** 当前已写字节累计 */
  used: () => number
  /** 写前调用；超过单次或总量上限抛 'quota_exceeded' 错误 */
  reserveOrThrow: (incomingBytes: number) => void
  /** 重置（session 关闭时） */
  reset: () => void
}

export const createQuotaTracker = (
  totalLimitBytes: number = SESSION_QUOTA_BYTES,
  singleLimitBytes: number = SINGLE_WRITE_LIMIT_BYTES,
): QuotaTracker => {
  let used = 0
  return {
    used: () => used,
    reserveOrThrow: (incoming) => {
      if (incoming > singleLimitBytes) {
        const err = new Error(
          `单次写入 ${incoming} 字节超过单次上限 ${singleLimitBytes}（quota_exceeded）`,
        )
        ;(err as Error & { code?: string }).code = 'quota_exceeded'
        throw err
      }
      if (used + incoming > totalLimitBytes) {
        const err = new Error(
          `累计写入 ${used + incoming} 字节超过 session 上限 ${totalLimitBytes}（quota_exceeded）`,
        )
        ;(err as Error & { code?: string }).code = 'quota_exceeded'
        throw err
      }
      used += incoming
    },
    reset: () => {
      used = 0
    },
  }
}

const buildSubtree = async (
  dir: OpfsDirectoryHandle,
  relName: string,
): Promise<TreeNode> => {
  const children: TreeNode[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      children.push(await buildSubtree(entry, entry.name))
    } else {
      const file = await entry.getFile()
      children.push({
        name: entry.name,
        kind: 'file',
        size: file.size,
        modifiedAt: file.lastModified,
      })
    }
  }
  // 稳定排序：先目录后文件，再按名称
  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return { name: relName, kind: 'directory', children }
}

export const listTree = async (root: OpfsDirectoryHandle): Promise<TreeNode> => {
  return buildSubtree(root, root.name)
}
