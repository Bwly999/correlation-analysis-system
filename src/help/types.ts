export interface NodeHelpDoc {
  summary: string
  whenToUse: string[]
  inputGuide: string[]
  parameterGuide?: Array<{
    property: string
    title: string
    content: string
  }>
  outputGuide: string[]
  nextSteps?: string[]
  commonIssues?: Array<{
    title: string
    resolution: string
  }>
}

export interface NodeAssistantHints {
  useCases: string[]
  keywords: string[]
  workflowRoles: string[]
  inputKinds?: string[]
  outputKinds?: string[]
  requiredConfig?: string[]
  recommendedConfigPatterns?: string[]
  commonMistakes?: string[]
  recommendedPrevNodes?: string[]
  recommendedNextNodes?: string[]
}

export interface HelpCenterCategory {
  id: 'trigger' | 'action' | 'terminal'
  title: string
  description: string
}

export interface HelpCenterContent {
  quickStart: Array<{
    step: number
    title: string
    goal: string
    recommendedNodes: string[]
    pitfalls: string[]
  }>
  faqs: Array<{
    question: string
    answer: string
  }>
  advancedTips: Array<{
    title: string
    content: string
    tag?: string
  }>
  categories: HelpCenterCategory[]
}
