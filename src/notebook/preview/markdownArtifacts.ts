/**
 * Markdown 内 artifact 图片的相对路径 → OPFS blob URL 替换。
 *
 * 背景：artifacts 存在浏览器 OPFS 里，不是 Web 静态资源；markdown 里
 * `<img src="../artifacts/xxx.png">` 这类相对路径在网页 URL 上下文下加载不到。
 * 这里在渲染后把命中 workspace 白名单（inputs/scripts/artifacts/reports）的图片
 * 从 OPFS 读出字节、创建 blob URL、回填 src。
 *
 * 仅替换 src 字符串，sanitize 由调用方先经 renderMarkdownSafe 完成。
 *
 * 该模块被 FilePreview（文件预览面板）与 AssistantTextBlock（对话流助手文本块）共用：
 *   - FilePreview：basePath 传「当前预览文件路径」，按所在目录解析 ../
 *   - 对话流：basePath 传 ''，相对 workspace 根解析（../artifacts/x.png → artifacts/x.png）
 */

import { readBytes, resolveSafePath, type OpfsDirectoryHandle } from '../shared/opfsAccess'

export const inferImageMime = (path: string): string => {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

/**
 * 把 markdown 里的相对图片 src 解析为 workspace 内的安全路径。
 *
 * @param basePath FilePreview 传「当前文件路径」（如 reports/x.md），对话流传 ''。
 * @param rawSrc   原始 src，如 ../artifacts/a.png、artifacts/a.png
 * @returns 规整后的 workspace 相对路径（如 artifacts/a.png）；不在白名单返回 null
 */
export const resolveArtifactPath = (basePath: string, rawSrc: string): string | null => {
  const baseSegs = basePath.split('/').slice(0, -1)
  const targetSegs = rawSrc.split('/')
  for (const seg of targetSegs) {
    if (seg === '..') {
      baseSegs.pop()
      continue
    }
    if (seg === '.' || seg === '') continue
    baseSegs.push(seg)
  }
  const resolvedPath = baseSegs.join('/')
  if (!resolvedPath) return null
  try {
    resolveSafePath(resolvedPath)
    return resolvedPath
  } catch {
    return null
  }
}

export interface ArtifactImageReplacer {
  /** 把渲染后的 html 里命中的 artifact 图片 src 替换成 blob URL；每次调用前会撤销上一批 URL */
  rewrite: (html: string) => Promise<string>
  /** 撤销当前持有的所有 blob URL */
  dispose: () => void
}

interface CreateReplacerOptions {
  opfsRoot?: OpfsDirectoryHandle
  /** 解析 ../ 时所基于的路径；文件预览传文件路径，对话流传 '' */
  basePath: string | (() => string)
}

/**
 * 创建一个 artifact 图片替换管理器，自动管理 blob URL 生命周期。
 *
 * 调用方在组件卸载时需调用 dispose()；每次 rewrite() 前会先撤销上一批 URL，
 * 以适配流式增量更新场景。
 */
export const createArtifactImageReplacer = (
  opts: CreateReplacerOptions,
): ArtifactImageReplacer => {
  let blobUrls: string[] = []

  const revokeAll = () => {
    for (const url of blobUrls) {
      URL.revokeObjectURL(url)
    }
    blobUrls = []
  }

  const getBasePath = () => (typeof opts.basePath === 'function' ? opts.basePath() : opts.basePath)

  return {
    async rewrite(html) {
      if (!opts.opfsRoot) return html
      const imageMatches = [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"[^>]*>/gi)]
      if (imageMatches.length === 0) return html

      let nextHtml = html
      revokeAll()

      for (const match of imageMatches) {
        const rawSrc = match[1]
        if (!rawSrc) continue
        const resolvedPath = resolveArtifactPath(getBasePath(), rawSrc)
        if (!resolvedPath) continue
        try {
          const bytes = await readBytes(opts.opfsRoot, resolvedPath)
          const blobUrl = URL.createObjectURL(
            new Blob([bytes as unknown as ArrayBuffer], {
              type: inferImageMime(resolvedPath),
            }),
          )
          blobUrls.push(blobUrl)
          nextHtml = nextHtml.replace(`src="${rawSrc}"`, `src="${blobUrl}"`)
        } catch {
          // 文件不存在等异常：保持原 src（浏览器会显示加载失败图，但不崩）
        }
      }

      return nextHtml
    },
    dispose: revokeAll,
  }
}
