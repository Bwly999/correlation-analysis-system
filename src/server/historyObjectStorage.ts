import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const DEFAULT_HISTORY_BUCKET = 'workflow-history'

export type HistoryRecordObjectKeyInput = {
  userId: string
  workflowId: string
  executionId: string
  snapshotTag?: string
}

export const buildHistoryRecordObjectKey = (input: HistoryRecordObjectKeyInput) => {
  const snapshotTag = input.snapshotTag?.trim() || 'record'
  return `analysis-workflow/history/${encodeURIComponent(input.userId)}/${encodeURIComponent(input.workflowId)}/${encodeURIComponent(input.executionId)}/${encodeURIComponent(snapshotTag)}.json`
}

export const createHistoryRecordObjectKeyFactory = (createSnapshotTag: () => string) =>
  (input: Omit<HistoryRecordObjectKeyInput, 'snapshotTag'>) =>
    buildHistoryRecordObjectKey({
      ...input,
      snapshotTag: createSnapshotTag(),
    })

export interface HistoryObjectStorageConfig {
  endpoint?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  forcePathStyle?: boolean
}

export const readHistoryObjectStorageConfigFromEnv = (): Required<HistoryObjectStorageConfig> => ({
  endpoint: process.env.WORKFLOW_HISTORY_S3_ENDPOINT?.trim() || 'http://127.0.0.1:9000',
  bucket: process.env.WORKFLOW_HISTORY_S3_BUCKET?.trim() || DEFAULT_HISTORY_BUCKET,
  accessKeyId: process.env.WORKFLOW_HISTORY_S3_ACCESS_KEY?.trim() || 'minioadmin',
  secretAccessKey: process.env.WORKFLOW_HISTORY_S3_SECRET_KEY?.trim() || 'minioadmin',
  region: process.env.WORKFLOW_HISTORY_S3_REGION?.trim() || 'us-east-1',
  forcePathStyle: true,
})

export const createHistoryObjectStorageClient = (config = readHistoryObjectStorageConfigFromEnv()) =>
  new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

export interface HistoryRecordObjectStorage {
  putObject(key: string, body: string): Promise<void>
  getObject(key: string): Promise<string | null>
  deleteObject(key: string): Promise<void>
}

export const createHistoryRecordObjectStorage = (
  client = createHistoryObjectStorageClient(),
  bucket = readHistoryObjectStorageConfigFromEnv().bucket,
): HistoryRecordObjectStorage => ({
  async putObject(key, body) {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
    }))
  },
  async getObject(key) {
    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }))

    const body = response.Body
    if (!body) return null

    const chunks: Buffer[] = []
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }

    return Buffer.concat(chunks).toString('utf-8')
  },
  async deleteObject(key) {
    await client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }))
  },
})
