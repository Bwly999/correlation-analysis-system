import html2pdf from 'html2pdf.js'

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const TEMP_EXPORT_ID_ATTR = 'data-pdf-export-id'
const UNSUPPORTED_COLOR_PATTERN = /oklch\(([^()]+)\)/gi

const normalizePercentage = (value: string) =>
  value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value)

const normalizeHue = (value: string) => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.endsWith('deg')) return Number.parseFloat(trimmed)
  if (trimmed.endsWith('grad')) return (Number.parseFloat(trimmed) * 180) / 200
  if (trimmed.endsWith('rad')) return (Number.parseFloat(trimmed) * 180) / Math.PI
  if (trimmed.endsWith('turn')) return Number.parseFloat(trimmed) * 360
  return Number.parseFloat(trimmed)
}

const srgbEncode = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value))
  if (clamped <= 0.0031308) return clamped * 12.92
  return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

const formatRgbChannel = (value: number) => Math.round(srgbEncode(value) * 255)

const convertOklchToRgb = (rawColor: string) => {
  const [rawChannels = '', rawAlpha] = rawColor.split('/').map((item) => item.trim())
  const channels = rawChannels.split(/\s+/).filter(Boolean)
  if (channels.length < 3) {
    return `oklch(${rawColor})`
  }

  const lightness = normalizePercentage(channels[0]!)
  const chroma = Number.parseFloat(channels[1]!)
  const hue = normalizeHue(channels[2]!)

  if (
    !Number.isFinite(lightness) ||
    !Number.isFinite(chroma) ||
    !Number.isFinite(hue)
  ) {
    return `oklch(${rawColor})`
  }

  const hueInRadians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(hueInRadians)
  const b = chroma * Math.sin(hueInRadians)

  const lComponent = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mComponent = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sComponent = lightness - 0.0894841775 * a - 1.291485548 * b

  const l = lComponent ** 3
  const m = mComponent ** 3
  const s = sComponent ** 3

  const red = formatRgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = formatRgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = formatRgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)

  if (!rawAlpha) {
    return `rgb(${red}, ${green}, ${blue})`
  }

  const alpha = normalizePercentage(rawAlpha)
  if (!Number.isFinite(alpha)) {
    return `rgb(${red}, ${green}, ${blue})`
  }

  const normalizedAlpha = Math.min(1, Math.max(0, alpha))
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`
}

export const replaceUnsupportedColorFunctions = (value: string) =>
  value.replace(UNSUPPORTED_COLOR_PATTERN, (_, rawColor: string) => convertOklchToRgb(rawColor))

export const normalizeUnsupportedColorsForExport = (
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
  getStyle: (element: Element) => CSSStyleDeclaration = window.getComputedStyle,
) => {
  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>('*'))]
  const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>('*'))]

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index]
    if (!cloneElement) return

    const computedStyle = getStyle(sourceElement)
    for (const propertyName of Array.from(computedStyle)) {
      const propertyValue = computedStyle.getPropertyValue(propertyName)
      if (!propertyValue || !propertyValue.includes('oklch(')) continue

      cloneElement.style.setProperty(
        propertyName,
        replaceUnsupportedColorFunctions(propertyValue),
        typeof computedStyle.getPropertyPriority === 'function'
          ? computedStyle.getPropertyPriority(propertyName)
          : '',
      )
    }
  })
}

const waitForChartsToStabilize = async () => {
  await waitForNextFrame()
  await waitForNextFrame()
  await new Promise((resolve) => setTimeout(resolve, 120))
}

const hideExportIgnoredElements = (root: HTMLElement) => {
  const ignoredElements = Array.from(root.querySelectorAll<HTMLElement>('[data-export-hidden="true"]'))
  const previousDisplayValues = ignoredElements.map((element) => element.style.display)
  ignoredElements.forEach((element) => {
    element.style.display = 'none'
  })

  return () => {
    ignoredElements.forEach((element, index) => {
      element.style.display = previousDisplayValues[index] ?? ''
    })
  }
}

export const exportReportElementToPdf = async (
  element: HTMLElement,
  options: {
    filename: string
  },
) => {
  const restoreIgnoredElements = hideExportIgnoredElements(element)
  const exportId = `pdf-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  element.setAttribute(TEMP_EXPORT_ID_ATTR, exportId)

  try {
    await waitForChartsToStabilize()

    await html2pdf()
      .set({
        margin: 10,
        filename: options.filename,
        image: { type: 'jpeg', quality: 0.9 },
        html2canvas: {
          scale: Math.min(window.devicePixelRatio || 1, 1.5),
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
          onclone: (clonedDocument: Document) => {
            const clonedRoot = clonedDocument.querySelector<HTMLElement>(
              `[${TEMP_EXPORT_ID_ATTR}="${exportId}"]`,
            )
            if (!clonedRoot) return

            normalizeUnsupportedColorsForExport(element, clonedRoot)
            clonedRoot.removeAttribute(TEMP_EXPORT_ID_ATTR)
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      } as any)
      .from(element)
      .save()
  } finally {
    element.removeAttribute(TEMP_EXPORT_ID_ATTR)
    restoreIgnoredElements()
  }
}
