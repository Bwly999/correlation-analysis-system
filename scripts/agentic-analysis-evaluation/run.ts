import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type EvalOptions = {
  help: boolean
  evalFile: string
  sessionId: string
  userId: string
  jsonOut: string
}

const DEFAULT_EVAL_FILE = 'docs/evaluations/agentic-analysis-evaluation.xml'

const parseArgs = (argv: string[]): EvalOptions => {
  const options: EvalOptions = {
    help: false,
    evalFile: DEFAULT_EVAL_FILE,
    sessionId: '',
    userId: '',
    jsonOut: '',
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg.startsWith('--eval-file=')) {
      options.evalFile = arg.slice('--eval-file='.length)
    } else if (arg.startsWith('--session=')) {
      options.sessionId = arg.slice('--session='.length)
    } else if (arg.startsWith('--user=')) {
      options.userId = arg.slice('--user='.length)
    } else if (arg.startsWith('--json-out=')) {
      options.jsonOut = arg.slice('--json-out='.length)
    }
  }

  return options
}

const printHelp = () => {
  console.log([
    'Agentic 数据分析评测',
    '',
    '用法：',
    '  pnpm eval:agentic-analysis -- --session=<sessionId> --user=<userId>',
    '',
    '参数：',
    '  --session=<sessionId>      已启动的 Agent 会话 ID',
    '  --user=<userId>            当前用户 ID',
    `  --eval-file=<path>         评测题集路径，默认 ${DEFAULT_EVAL_FILE}`,
    '  --json-out=<path>          可选，将评测计划输出为 JSON',
    '  --help                     显示中文帮助',
    '',
    '当前 MVP 会读取题集并输出评测计划，用于检查工具调用、工作流执行、证据引用和中文报告等最低要求。',
  ].join('\n'))
}

const extractCases = (xml: string) => {
  const matches = [...xml.matchAll(/<case\s+id="([^"]+)"\s+category="([^"]+)">([\s\S]*?)<\/case>/g)]
  return matches.map((match) => {
    const body = match[3] ?? ''
    const goal = body.match(/<goal>([\s\S]*?)<\/goal>/)?.[1]?.trim() ?? ''
    const acceptance = body.match(/<acceptance>([\s\S]*?)<\/acceptance>/)?.[1]?.trim() ?? ''
    const tools = [...body.matchAll(/<tool>(.*?)<\/tool>/g)].map((toolMatch) => toolMatch[1] ?? '')

    return {
      id: match[1],
      category: match[2],
      goal,
      requiredTools: tools,
      acceptance,
    }
  })
}

const run = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  if (!options.sessionId || !options.userId) {
    printHelp()
    process.exitCode = 1
    return
  }

  const xml = await readFile(resolve(options.evalFile), 'utf-8')
  const cases = extractCases(xml)
  const report = {
    sessionId: options.sessionId,
    userId: options.userId,
    evalFile: options.evalFile,
    caseCount: cases.length,
    minimumChecks: [
      '是否调用数据画像或上下文读取工具',
      '是否生成可验证工作流',
      '是否执行成功或进入可解释修复流程',
      '是否抽取 evidenceId 并绑定核心结论',
      '是否输出中文报告摘要',
    ],
    cases,
  }

  if (options.jsonOut) {
    await writeFile(resolve(options.jsonOut), JSON.stringify(report, null, 2), 'utf-8')
  }

  console.log(`已加载 Agentic 数据分析评测题集：${cases.length} 个用例`)
  for (const item of cases) {
    console.log(`- ${item.category}（${item.id}）：${item.goal}`)
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Agentic 数据分析评测失败')
  process.exitCode = 1
})
