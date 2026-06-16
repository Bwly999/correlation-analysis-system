/**
 * E2E 测试运行环境 helper。
 *
 * 设计目标：
 *   - 独立于 vitest，放在 e2e/ 目录（已被 vitest.config exclude）。
 *   - 不污染项目包管理：优先用本地 @playwright/test，找不到时 fallback 到全局
 *     @playwright/cli 自带的 playwright（通过 PLAYWRIGHT_CLI_GLOBAL_PATH 指定，
 *     默认探测常见 nvm 全局路径）。
 *   - 浏览器用 channel=chrome，复用系统 Chrome，避免额外下载 headless shell。
 *
 * 运行方式：
 *   前置：dev server 已起在 http://localhost:5173（pnpm dev）
 *   node e2e/notebook-bootstrap-race.spec.mjs
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** 全局 node_modules 根候选（nvm for windows / *nix / 手动指定） */
const globalRootCandidates = () => {
  const execDir = dirname(process.execPath)
  return [
    process.env.PLAYWRIGHT_CLI_GLOBAL_PATH,
    // nvm for windows：node.exe 同级有 node_modules
    join(execDir, 'node_modules'),
    // *nix：node_modules 在上级
    join(execDir, '..', 'lib', 'node_modules'),
  ].filter(Boolean)
}

/** 尝试加载 playwright，返回 { chromium } */
export const resolvePlaywright = () => {
  // 1) 本地 @playwright/test / playwright（用户 pnpm install 修复后可用）
  const localCandidates = ['@playwright/test', 'playwright']
  for (const name of localCandidates) {
    try {
      const mod = require(name)
      return { chromium: mod.chromium, source: name }
    } catch {
      // continue
    }
  }

  // 2) 全局 @playwright/cli 自带 playwright
  for (const root of globalRootCandidates()) {
    const candidate = join(root, '@playwright/cli/node_modules/playwright')
    if (existsSync(candidate)) {
      const mod = require(candidate)
      return { chromium: mod.chromium, source: `global:${candidate}` }
    }
  }

  throw new Error(
    '未找到 playwright。请安装 @playwright/test（本地），或设置环境变量 PLAYWRIGHT_CLI_GLOBAL_PATH 指向全局 node_modules。',
  )
}

/** 启动 chromium 浏览器（复用系统 Chrome channel） */
export const launchBrowser = async ({ headless = true } = {}) => {
  const { chromium, source } = resolvePlaywright()
  const browser = await chromium.launch({ headless, channel: 'chrome' })
  return { browser, source }
}
