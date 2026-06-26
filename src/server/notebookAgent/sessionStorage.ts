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

export const createNotebookSessionObjectStorage = (
  client = createNotebookSessionStorageClient(),
  bucket = readNotebookSessionStorageConfigFromEnv().bucket,
): NotebookSessionObjectStorage => ({
  async putObject(key, body) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/x-ndjson; charset=utf-8',
      }),
    )
  },
  async getObject(key) {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    const buf = await readAllBytes(response.Body)
    return buf ? buf.toString('utf-8') : null
  },
  async putObjectBytes(key, body, contentType) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType ?? 'application/octet-stream',
      }),
    )
  },
  async getObjectBytes(key) {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    return readAllBytes(response.Body)
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
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      )
      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key)
      }
      continuationToken = response.NextContinuationToken
    } while (continuationToken)
    return keys
  },
})
