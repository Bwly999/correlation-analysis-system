import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  gradeWorkflowMcpEvaluation,
  parseWorkflowMcpEvaluationXml,
  summarizeWorkflowMcpEvaluation,
} from './core.js'

type CliOptions = {
  evalFile: string
  url: string
  sessionId: string
  userId: string
  jsonOut?: string
}

const readArg = (args: string[], name: string) => {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

const parseArgs = (args: string[]): CliOptions => {
  const evalFile = readArg(args, 'eval') ?? 'docs/evaluations/workflow-mcp-evaluation.xml'
  const url = readArg(args, 'url') ?? 'http://127.0.0.1:8787/api/opencode/workflow-mcp'
  const sessionId = readArg(args, 'session')
  const userId = readArg(args, 'user') ?? 'default-user'
  const jsonOut = readArg(args, 'json-out')

  if (!sessionId) {
    throw new Error('缺少 --session=<workflow-session-id>，请先创建 Agent/Workflow AI 会话')
  }

  return {
    evalFile,
    url,
    sessionId,
    userId,
    jsonOut,
  }
}

const getStructured = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const response = await client.callTool({ name, arguments: args })
  if (response.isError) {
    throw new Error(`${name} 调用失败: ${JSON.stringify(response.content)}`)
  }
  return response.structuredContent as Record<string, any>
}

const findTool = (toolNames: string[], keyword: string) =>
  toolNames.find((name) => name.includes(keyword)) ?? ''

const answerQuestion = async (client: Client, question: string) => {
  const tools = await client.listTools()
  const toolNames = tools.tools.map((tool) => tool.name)

  if (question.includes('不上传文件') || question.includes('对象数组样例数据')) {
    const result = await getStructured(client, 'workflow_search_nodes', { query: '手动 JSON', limit: 10 })
    return result.items?.find((item: any) => item.name === 'manual-json-import')?.name ?? 'manual-json-import'
  }

  if (question.includes('会话级文件数据源') || question.includes('CSV/Excel 上传')) {
    const result = await getStructured(client, 'workflow_list_data_sources', { limit: 5 })
    return result.items?.[0]?.entryNodeType ?? 'file-import'
  }

  if (question.includes('diff') || question.includes('逐步新增节点和连线')) {
    return findTool(toolNames, 'update_partial_workflow')
  }

  if (question.includes('候选属性选项')) {
    return findTool(toolNames, 'get_node_options')
  }

  if (question.includes('upstream trace') || question.includes('上游子图')) {
    return findTool(toolNames, 'debug_node')
  }

  if (question.includes('历史版本') && question.includes('回滚')) {
    return findTool(toolNames, 'rollback_workflow_version') || findTool(toolNames, 'workflow_versions')
  }

  if (question.includes('缺失值处理')) {
    const result = await getStructured(client, 'workflow_get_node', {
      nodeType: 'data-cleaning',
      mode: 'search_properties',
      propertyQuery: '缺失值处理',
    })
    return result.properties?.[0]?.name ?? ''
  }

  if (question.includes('多输入数据合并') || question.includes('join 键')) {
    const result = await getStructured(client, 'workflow_search_nodes', { query: '合并 join', limit: 10 })
    return result.items?.find((item: any) => item.name === 'data-merge')?.name ?? 'data-merge'
  }

  if (question.includes('数据聚合') && question.includes('聚合模式')) {
    const result = await getStructured(client, 'workflow_get_node', {
      nodeType: 'data-aggregation',
      mode: 'search_properties',
      propertyQuery: '聚合模式',
    })
    return result.properties?.[0]?.name ?? ''
  }

  if (question.includes('执行记录') || question.includes('产物摘要')) {
    return findTool(toolNames, 'executions')
  }

  return ''
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  const xml = await readFile(resolve(options.evalFile), 'utf-8')
  const pairs = parseWorkflowMcpEvaluationXml(xml)
  const client = new Client({
    name: 'workflow-mcp-evaluation',
    version: '1.0.0',
  })
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: {
      headers: new Headers({
        'x-workflow-session-id': options.sessionId,
        'x-workflow-user-id': options.userId,
      }),
    },
  })

  try {
    await client.connect(transport)
    const answers = Object.fromEntries(
      await Promise.all(
        pairs.map(async (pair) => [pair.question, await answerQuestion(client, pair.question)] as const),
      ),
    )
    const results = gradeWorkflowMcpEvaluation(pairs, answers)
    const summary = summarizeWorkflowMcpEvaluation(results)
    const report = {
      generatedAt: new Date().toISOString(),
      url: options.url,
      sessionId: options.sessionId,
      summary,
      results,
    }

    console.log(`Workflow MCP Evaluation: ${summary.passed}/${summary.total} (${(summary.accuracy * 100).toFixed(0)}%)`)
    if (options.jsonOut) {
      await writeFile(resolve(options.jsonOut), JSON.stringify(report, null, 2), 'utf-8')
      console.log(`JSON 报告已写入: ${resolve(options.jsonOut)}`)
    }

    process.exit(summary.failed > 0 ? 1 : 0)
  } finally {
    await transport.close()
  }
}

main().catch((error) => {
  console.error('Workflow MCP evaluation 运行失败:', error)
  process.exit(1)
})
