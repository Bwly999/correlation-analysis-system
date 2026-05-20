import { onBeforeUnmount, ref } from 'vue'

type ResizeHandlers = {
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: () => void
}

type ResizeBounds = {
  min: number
  max: number
}

type ResizeBoundsInput = ResizeBounds | (() => ResizeBounds)

export const useHorizontalResize = (
  initialWidth: number,
  boundsInput: ResizeBoundsInput,
  deltaSign = 1,
) => {
  const paneWidth = ref(initialWidth)
  const isResizing = ref(false)
  let activeHandlers: ResizeHandlers | null = null

  const resolveBounds = () =>
    typeof boundsInput === 'function' ? boundsInput() : boundsInput

  const clampWidth = (nextWidth: number) => {
    const bounds = resolveBounds()
    paneWidth.value = Math.max(bounds.min, Math.min(bounds.max, nextWidth))
  }

  const cleanup = () => {
    if (!activeHandlers) return
    document.removeEventListener('mousemove', activeHandlers.onMouseMove)
    document.removeEventListener('mouseup', activeHandlers.onMouseUp)
    activeHandlers = null
    isResizing.value = false
  }

  const startResizing = (event: MouseEvent) => {
    cleanup()
    isResizing.value = true
    event.preventDefault()
    const startX = event.clientX
    const startWidth = paneWidth.value

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.value) return
      const deltaX = (moveEvent.clientX - startX) * deltaSign
      clampWidth(startWidth + deltaX)
    }

    const onMouseUp = () => {
      cleanup()
    }

    activeHandlers = { onMouseMove, onMouseUp }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  onBeforeUnmount(() => {
    cleanup()
  })

  return {
    paneWidth,
    isResizing,
    clampWidth,
    startResizing,
  }
}
