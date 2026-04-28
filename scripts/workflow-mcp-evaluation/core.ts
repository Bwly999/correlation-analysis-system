export type WorkflowMcpEvaluationPair = {
  question: string
  answer: string
}

export type WorkflowMcpEvaluationResult = {
  question: string
  expected: string
  actual: string
  passed: boolean
}

export type WorkflowMcpEvaluationSummary = {
  total: number
  passed: number
  failed: number
  accuracy: number
}

const decodeXmlText = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

const readXmlTag = (block: string, tag: 'question' | 'answer') => {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? decodeXmlText(match[1] ?? '') : ''
}

export const parseWorkflowMcpEvaluationXml = (xml: string): WorkflowMcpEvaluationPair[] =>
  [...xml.matchAll(/<qa_pair>([\s\S]*?)<\/qa_pair>/gi)]
    .map((match) => match[1] ?? '')
    .map((block) => ({
      question: readXmlTag(block, 'question'),
      answer: readXmlTag(block, 'answer'),
    }))
    .filter((pair) => pair.question && pair.answer)

export const gradeWorkflowMcpEvaluation = (
  pairs: WorkflowMcpEvaluationPair[],
  answersByQuestion: Record<string, string>,
): WorkflowMcpEvaluationResult[] =>
  pairs.map((pair) => {
    const actual = answersByQuestion[pair.question]?.trim() ?? ''
    const expected = pair.answer.trim()
    return {
      question: pair.question,
      expected,
      actual,
      passed: actual === expected,
    }
  })

export const summarizeWorkflowMcpEvaluation = (
  results: WorkflowMcpEvaluationResult[],
): WorkflowMcpEvaluationSummary => {
  const passed = results.filter((result) => result.passed).length
  const total = results.length
  return {
    total,
    passed,
    failed: total - passed,
    accuracy: total === 0 ? 0 : passed / total,
  }
}
