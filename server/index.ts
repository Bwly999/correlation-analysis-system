import { createServerApp } from '../src/server/app.js'

const port = Number(process.env.WORKFLOW_AI_SERVER_PORT || '8787')
const host = process.env.WORKFLOW_AI_SERVER_HOST || '127.0.0.1'
const defaultStorageUserId = process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID?.trim()
const defaultStorageUserName = process.env.WORKFLOW_STORAGE_DEFAULT_USER_NAME?.trim() || '默认用户'

const app = createServerApp(
  defaultStorageUserId
    ? {
        defaultStorageUser: {
          id: defaultStorageUserId,
          name: defaultStorageUserName,
        },
      }
    : {},
)

try {
  await app.listen({ port, host })
  console.log(`[workflow-ai-server] listening on http://${host}:${port}`)
} catch (error) {
  console.error('[workflow-ai-server] failed to start', error)
  process.exit(1)
}
