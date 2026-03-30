import html2pdf from 'html2pdf.js'

const waitForNextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

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
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      } as any)
      .from(element)
      .save()
  } finally {
    restoreIgnoredElements()
  }
}
