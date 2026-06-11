/**
 * 内存版的 OPFS mock，实现 FileSystemDirectoryHandle / FileSystemFileHandle 子集。
 *
 * 仅覆盖 src/notebook/shared/opfsAccess.ts 用到的 API：
 *   - DirectoryHandle: getDirectoryHandle / getFileHandle / values / removeEntry
 *   - FileHandle: createWritable / getFile
 *   - WritableStream: write / close
 *   - File: arrayBuffer / text / size / type
 *
 * 不追求 web 标准 100% 一致，仅满足单测目的。
 */

import type {
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsFile,
  OpfsWritable,
} from '../opfsAccess'

interface MemFile {
  kind: 'file'
  name: string
  bytes: Uint8Array
  modifiedAt: number
}

interface MemDir {
  kind: 'directory'
  name: string
  children: Map<string, MemFile | MemDir>
}

const decodeData = (data: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  if (data instanceof Uint8Array) return data
  return new Uint8Array(data)
}

class MemFileHandle implements OpfsFileHandle {
  readonly kind = 'file'
  constructor(
    readonly name: string,
    private readonly node: MemFile,
  ) {}

  async createWritable(): Promise<OpfsWritable> {
    const buffers: Uint8Array[] = []
    const node = this.node
    return {
      async write(chunk) {
        buffers.push(decodeData(chunk))
      },
      async close() {
        const total = buffers.reduce((a, b) => a + b.byteLength, 0)
        const merged = new Uint8Array(total)
        let off = 0
        for (const b of buffers) {
          merged.set(b, off)
          off += b.byteLength
        }
        node.bytes = merged
        node.modifiedAt = Date.now()
      },
    }
  }

  async getFile(): Promise<OpfsFile> {
    const node = this.node
    return {
      get size() {
        return node.bytes.byteLength
      },
      type: '',
      lastModified: node.modifiedAt,
      async arrayBuffer(): Promise<ArrayBuffer> {
        return node.bytes.buffer.slice(
          node.bytes.byteOffset,
          node.bytes.byteOffset + node.bytes.byteLength,
        ) as ArrayBuffer
      },
      async text() {
        return new TextDecoder().decode(node.bytes)
      },
    }
  }
}

export class MemDirectoryHandle implements OpfsDirectoryHandle {
  readonly kind = 'directory'
  constructor(
    readonly name: string,
    private readonly node: MemDir,
  ) {}

  async getDirectoryHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<OpfsDirectoryHandle> {
    let child = this.node.children.get(name)
    if (!child) {
      if (!opts?.create) throw new Error(`NotFoundError: ${name}`)
      child = { kind: 'directory', name, children: new Map() }
      this.node.children.set(name, child)
    }
    if (child.kind !== 'directory') {
      throw new Error(`TypeMismatchError: ${name} is a file`)
    }
    return new MemDirectoryHandle(name, child)
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<OpfsFileHandle> {
    let child = this.node.children.get(name)
    if (!child) {
      if (!opts?.create) throw new Error(`NotFoundError: ${name}`)
      child = { kind: 'file', name, bytes: new Uint8Array(), modifiedAt: Date.now() }
      this.node.children.set(name, child)
    }
    if (child.kind !== 'file') {
      throw new Error(`TypeMismatchError: ${name} is a directory`)
    }
    return new MemFileHandle(name, child)
  }

  async *values(): AsyncIterableIterator<OpfsDirectoryHandle | OpfsFileHandle> {
    for (const child of this.node.children.values()) {
      if (child.kind === 'directory') {
        yield new MemDirectoryHandle(child.name, child)
      } else {
        yield new MemFileHandle(child.name, child)
      }
    }
  }

  async removeEntry(name: string, _opts?: { recursive?: boolean }) {
    if (!this.node.children.has(name)) throw new Error('NotFoundError')
    this.node.children.delete(name)
  }
}

export const createMemOpfsRoot = (): MemDirectoryHandle => {
  return new MemDirectoryHandle('', { kind: 'directory', name: '', children: new Map() })
}
