import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const PREVIEW_SCALE_STEP = 0.2
const MIN_PREVIEW_SCALE = 0.1
const MAX_PREVIEW_SCALE = 10

export const useReportPreview = (getImageUrl: () => string | undefined) => {
  const isFullReportPreviewOpen = ref(false)
  const previewScale = ref(1)
  const previewTranslate = ref({ x: 0, y: 0 })
  const isPreviewDragging = ref(false)
  const previewDragStart = ref({ x: 0, y: 0 })

  const previewImageTransform = computed(
    () => `translate(${previewTranslate.value.x}px, ${previewTranslate.value.y}px) scale(${previewScale.value})`,
  )

  const resetFullReportPreview = () => {
    previewScale.value = 1
    previewTranslate.value = { x: 0, y: 0 }
    isPreviewDragging.value = false
  }

  const openFullReportPreview = () => {
    if (!getImageUrl()) return
    resetFullReportPreview()
    isFullReportPreviewOpen.value = true
  }

  const closeFullReportPreview = () => {
    isFullReportPreviewOpen.value = false
    resetFullReportPreview()
  }

  const nudgePreviewScale = (delta: number) => {
    previewScale.value = Math.min(
      MAX_PREVIEW_SCALE,
      Math.max(MIN_PREVIEW_SCALE, Number((previewScale.value + delta).toFixed(2))),
    )
  }

  const zoomInPreview = () => {
    nudgePreviewScale(PREVIEW_SCALE_STEP)
  }

  const zoomOutPreview = () => {
    nudgePreviewScale(-PREVIEW_SCALE_STEP)
  }

  const handlePreviewWheel = (event: WheelEvent) => {
    event.preventDefault()
    nudgePreviewScale(event.deltaY < 0 ? PREVIEW_SCALE_STEP : -PREVIEW_SCALE_STEP)
  }

  const handlePreviewMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    isPreviewDragging.value = true
    previewDragStart.value = {
      x: event.clientX - previewTranslate.value.x,
      y: event.clientY - previewTranslate.value.y,
    }
  }

  const handleWindowMouseMove = (event: MouseEvent) => {
    if (!isPreviewDragging.value) return
    previewTranslate.value = {
      x: event.clientX - previewDragStart.value.x,
      y: event.clientY - previewDragStart.value.y,
    }
  }

  const stopPreviewDragging = () => {
    isPreviewDragging.value = false
  }

  const handleWindowKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isFullReportPreviewOpen.value) {
      closeFullReportPreview()
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', stopPreviewDragging)
    window.addEventListener('keydown', handleWindowKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', handleWindowMouseMove)
    window.removeEventListener('mouseup', stopPreviewDragging)
    window.removeEventListener('keydown', handleWindowKeydown)
  })

  return {
    isFullReportPreviewOpen,
    previewScale,
    isPreviewDragging,
    previewImageTransform,
    resetFullReportPreview,
    openFullReportPreview,
    closeFullReportPreview,
    zoomInPreview,
    zoomOutPreview,
    handlePreviewWheel,
    handlePreviewMouseDown,
  }
}
