import { createServer } from 'node:http'
import { createServerHandler } from '../src/server/app.js'

const port = Number(process.env.WORKFLOW_AI_SERVER_PORT || '8787')
const host = process.env.WORKFLOW_AI_SERVER_HOST || '127.0.0.1'

createServer(createServerHandler()).listen(port, host, () => {
  console.log(`[workflow-ai-server] listening on http://${host}:${port}`)
})
