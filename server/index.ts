import { createServer } from 'node:http'
import { createServerHandler } from '../src/server/app.js'

const port = Number(process.env.WORKFLOW_AI_SERVER_PORT || '8787')
const host = process.env.WORKFLOW_AI_SERVER_HOST || '127.0.0.1'
const defaultStorageUserId = process.env.WORKFLOW_STORAGE_DEFAULT_USER_ID?.trim()
const defaultStorageUserName = process.env.WORKFLOW_STORAGE_DEFAULT_USER_NAME?.trim() || '默认用户'

createServer(
  createServerHandler(
    defaultStorageUserId
      ? {
          defaultStorageUser: {
            id: defaultStorageUserId,
            name: defaultStorageUserName,
          },
        }
      : {},
  ),
).listen(port, host, () => {
  console.log(`[workflow-ai-server] listening on http://${host}:${port}`)
})
