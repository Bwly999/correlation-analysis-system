/**
 * Notebook Agent Session 文件的对象存储（S3/MinIO）。
 *
 * 参考 ../historyObjectStorage.ts 模式，提供 S3 client 工厂、
 * 配置读取、对象存储接口，用做 notebook agent JSONL 会话文件的远端归档。
 *
 * 不设置 S3 环境变量时 S3 不启用（isNotebookSessionS3Enabled() 返回 false），
 * 系统仅使用本地 workflow/sessions/ 目录（可通过 NOTEBOOK_SESSION_DIR 修改）。
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

const DEFAULT_BUCKET = 'notebook-agent-sessions'

export interface NotebookSessionStorageConfig {
  endpoint?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  forcePathStyle?: boolean
}

export const readNotebookSessionStorageConfigFromEnv = (): Required<NotebookSessionStorageConfig> => ({
  endpoint: process.env.NOTEBOOK_SESSION_S3_ENDPOINT?.trim() || '',
  bucket: process.env.NOTEBOOK_SESSION_S3_BUCKET?.trim() || DEFAULT_BUCKET,
  accessKeyId: process.env.NOTEBOOK_SESSION_S3_ACCESS_KEY?.trim() || '',
  secretAccessKey: process.env.NOTEBOOK_SESSION_S3_SECRET_KEY?.trim() || '',
  region: process.env.NOTEBOOK_SESSION_S3_REGION?.trim() || 'us-east-1',
  forcePathStyle: true,
})

/** 仅当同时设置了 endpoint 和 accessKeyId 才算启用了 S3 */
export const isNotebookSessionS3Enabled = (): boolean => {
  const config = readNotebookSessionStorageConfigFromEnv()
  return Boolean(config.endpoint && config.accessKeyId)
}

export const createNotebookSessionStorageClient = (
  config = readNotebookSessionStorageConfigFromEnv(),
): S3Client =>
  new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

export interface NotebookSessionObjectStorage {
  putObject(key: string, body: string): Promise<void>
  getObject(key: string): Promise<string | null>
  /** 二进制重载：workspace 快照 zip 等非文本对象用此方法（复用同一 S3 client） */
  putObjectBytes(key: string, body: Buffer, contentType?: string): Promise<void>
  getObjectBytes(key: string): Promise<Buffer | null>
  deleteObject(key: string): Promise<void>
  /** 列出 prefix 下的所有对象 key（一次最多 1000，内部自动分页） */
  listObjectKeys(prefix: string): Promise<string[]>
}

const readAllBytes = async (body: unknown): Promise<Buffer | null> => {
  if (!body) return null
  const chunks: Buffer[] = []
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * S3 单次操作兜底超时（毫秒）。
 *
 * AWS SDK v3 自身没有默认超时：端点不可达（TCP 停滞）或 GetObject 响应头已返回
 * 但 body 流永不 end 时，client.send / readAllBytes 会无限挂起，导致 workspace-snapshot
 * 等接口卡死（httpClient 也无超时，浏览器侧一并永久 pending）。这里用 Promise.race
 * 强制快速失败，交由上层 try/catch 兜底返回 404/null，而非无限等待。
 */
const S3_OP_TIMEOUT_MS = 5_000

const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} 超时（${S3_OP_TIMEOUT_MS}ms）`)),
      S3_OP_TIMEOUT_MS,
    )
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })

/**
 * 读 body 流时附加超时：超时后主动销毁流，避免 for-await 永久挂在一个
 * 永不 end 的流上、泄漏底层 socket。readAllBytes 的 for-await 在流被 destroy
 * 后会抛错，从而真正回收该读取 Promise。
 */
const readBodyWithTimeout = (body: unknown, label: string): Promise<Buffer | null> =>
  new Promise<Buffer | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      ;(body as { destroy?: (err?: unknown) => void } | null)?.destroy?.(
        new Error(`${label} 超时（${S3_OP_TIMEOUT_MS}ms）`),
      )
      reject(new Error(`${label} 超时（${S3_OP_TIMEOUT_MS}ms）`))
    }, S3_OP_TIMEOUT_MS)
    readAllBytes(body).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })

export const createNotebookSessionObjectStorage = (
  client = createNotebookSessionStorageClient(),
  bucket = readNotebookSessionStorageConfigFromEnv().bucket,
): NotebookSessionObjectStorage => ({
  async putObject(key, body) {
    await withTimeout(
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/x-ndjson; charset=utf-8',
        }),
      ),
      `S3 putObject ${key}`,
    )
  },
  async getObject(key) {
    const response = await withTimeout(
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
      `S3 getObject ${key}`,
    )
    const buf = await readBodyWithTimeout(response.Body, `S3 getObject:body ${key}`)
    return buf ? buf.toString('utf-8') : null
  },
  async putObjectBytes(key, body, contentType) {
    await withTimeout(
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? 'application/octet-stream',
        }),
      ),
      `S3 putObjectBytes ${key}`,
    )
  },
  async getObjectBytes(key) {
    const response = await withTimeout(
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
      `S3 getObjectBytes ${key}`,
    )
    return readBodyWithTimeout(response.Body, `S3 getObjectBytes:body ${key}`)
  },
  async deleteObject(key) {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    )
  },
  async listObjectKeys(prefix) {
    const keys: string[] = []
    let continuationToken: string | undefined
    do {
      const response = await withTimeout(
        client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        ),
        `S3 listObjectKeys ${prefix}`,
      )
      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key)
      }
      continuationToken = response.NextContinuationToken
    } while (continuationToken)
    return keys
  },
})
