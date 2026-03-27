import { onBeforeUnmount, ref } from 'vue'

type ResizeHandlers = {
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: () => void
}

export const useHorizontalResize = (
  initialWidth: number,
  bounds: { min: number; max: number },
  deltaSign = 1,
) => {
  const paneWidth = ref(initialWidth)
  const isResizing = ref(false)
  let activeHandlers: ResizeHandlers | null = null

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
    const startX = event.clientX
    const startWidth = paneWidth.value

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.value) return
      const deltaX = (moveEvent.clientX - startX) * deltaSign
      paneWidth.value = Math.max(bounds.min, Math.min(bounds.max, startWidth + deltaX))
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
    startResizing,
  }
}
