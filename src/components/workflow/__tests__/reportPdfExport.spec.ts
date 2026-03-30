import { describe, expect, it, vi } from 'vitest'
import {
  normalizeUnsupportedColorsForExport,
  replaceUnsupportedColorFunctions,
} from '../reportPdfExport'

vi.mock('html2pdf.js', () => ({
  default: vi.fn(),
}))

const createStyleDeclaration = (entries: Record<string, string>) => {
  const keys = Object.keys(entries)

  return {
    length: keys.length,
    getPropertyValue: (name: string) => entries[name] ?? '',
    getPropertyPriority: () => '',
    [Symbol.iterator]: function* () {
      yield* keys
    },
    ...Object.fromEntries(keys.map((key, index) => [index, key])),
  } as unknown as CSSStyleDeclaration
}

describe('reportPdfExport', () => {
  it('replaces oklch colors with rgb-compatible values', () => {
    const converted = replaceUnsupportedColorFunctions(
      '0 1px 2px oklch(0.5 0.1 240 / 0.2), inset 0 0 0 1px oklch(0.95 0.01 240)',
    )

    expect(converted).not.toContain('oklch(')
    expect(converted).toContain('rgba(')
    expect(converted).toContain('rgb(')
  })

  it('applies normalized color values onto cloned export nodes', () => {
    const sourceRoot = document.createElement('div')
    const sourceChild = document.createElement('span')
    sourceRoot.append(sourceChild)

    const cloneRoot = sourceRoot.cloneNode(true) as HTMLElement
    const cloneChild = cloneRoot.querySelector('span') as HTMLElement

    const getComputedStyleMock = vi
      .fn<typeof window.getComputedStyle>()
      .mockImplementation((element: Element) => {
        if (element === sourceRoot) {
          return createStyleDeclaration({
            color: 'oklch(0.45 0.02 250)',
            'background-color': 'rgb(255, 255, 255)',
          })
        }

        return createStyleDeclaration({
          'box-shadow': '0 1px 2px oklch(0.5 0.1 240 / 0.2)',
          'border-top-color': 'oklch(0.92 0.01 250)',
        })
      })

    normalizeUnsupportedColorsForExport(sourceRoot, cloneRoot, getComputedStyleMock)

    expect(cloneRoot.style.color).toMatch(/^rgb\(/)
    expect(cloneRoot.style.backgroundColor).toBe('')
    expect(cloneChild.style.boxShadow).toContain('rgba(')
    expect(cloneChild.style.borderTopColor).toMatch(/^rgb\(/)
  })
})
