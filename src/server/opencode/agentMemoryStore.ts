import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

export type AgentMemoryKind = 'field_semantics' | 'method_preference' | 'analysis_finding'

export type AgentMemoryItem = {
  id: string
  userId: string
  workflowId?: string
  kind: AgentMemoryKind
  content: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type AgentMemoryStoreOptions = {
  filePath?: string
  maxItemsPerUser?: number
}

export type AgentMemoryUpsertInput = {
  userId: string
  workflowId?: string
  kind: AgentMemoryKind
  content: Record<string, unknown>
  now?: number
}

export type AgentMemoryQuery = {
  userId: string
  workflowId?: string
  kind?: AgentMemoryKind
  limit?: number
}

type AgentMemoryDocument = {
  memories: AgentMemoryItem[]
}

const DEFAULT_MEMORY_FILE =
  process.env.AGENT_MEMORY_STORE_FILE
  || join(tmpdir(), 'correlation-analysis-system', 'agent-memory.json')

const DEFAULT_MAX_ITEMS_PER_USER = 100

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const ensureStoreFile = (filePath: string) => {
  mkdirSync(dirname(filePath), { recursive: true })
  if (!existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify({ memories: [] }, null, 2), 'utf-8')
  }
}

const readDocument = (filePath: string): AgentMemoryDocument => {
  ensureStoreFile(filePath)
  try {
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { memories: [] }
    const parsed = JSON.parse(raw) as Partial<AgentMemoryDocument>
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories as AgentMemoryItem[] : [],
    }
  } catch {
    return { memories: [] }
  }
}

const writeDocument = (filePath: string, document: AgentMemoryDocument) => {
  ensureStoreFile(filePath)
  writeFileSync(filePath, JSON.stringify(document, null, 2), 'utf-8')
}

const sortRecentFirst = (items: AgentMemoryItem[]) =>
  [...items].sort((left, right) => right.updatedAt - left.updatedAt)

export const createAgentMemoryStore = (options: AgentMemoryStoreOptions = {}) => {
  const filePath = options.filePath ?? DEFAULT_MEMORY_FILE
  const maxItemsPerUser = options.maxItemsPerUser ?? DEFAULT_MAX_ITEMS_PER_USER

  const persist = (memories: AgentMemoryItem[]) => {
    const byUser = new Map<string, AgentMemoryItem[]>()
    for (const memory of memories) {
      byUser.set(memory.userId, [...(byUser.get(memory.userId) ?? []), memory])
    }

    const trimmed = [...byUser.values()].flatMap((items) =>
      sortRecentFirst(items).slice(0, maxItemsPerUser))

    writeDocument(filePath, {
      memories: sortRecentFirst(trimmed),
    })
  }

  const listMemories = (query: AgentMemoryQuery): AgentMemoryItem[] => {
    const document = readDocument(filePath)
    const items = document.memories.filter((memory) => {
      if (memory.userId !== query.userId) return false
      if (query.workflowId !== undefined && memory.workflowId !== query.workflowId) return false
      if (query.kind !== undefined && memory.kind !== query.kind) return false
      return true
    })

    return sortRecentFirst(items)
      .slice(0, query.limit ?? items.length)
      .map(cloneValue)
  }

  const upsertMemory = (input: AgentMemoryUpsertInput): AgentMemoryItem => {
    const now = input.now ?? Date.now()
    const document = readDocument(filePath)
    const memory: AgentMemoryItem = {
      id: randomUUID(),
      userId: input.userId,
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      kind: input.kind,
      content: cloneValue(input.content),
      createdAt: now,
      updatedAt: now,
    }

    persist([...document.memories, memory])
    return cloneValue(memory)
  }

  const listRecentPreferences = (userId: string, limit = 5) =>
    listMemories({
      userId,
      kind: 'method_preference',
      limit,
    })

  return {
    upsertMemory,
    listMemories,
    listRecentPreferences,
  }
}

export const agentMemoryStore = createAgentMemoryStore()
