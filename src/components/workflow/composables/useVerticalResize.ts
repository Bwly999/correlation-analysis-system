import { onBeforeUnmount, ref } from 'vue'

type ResizeHandlers = {
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: () => void
}

export const useVerticalResize = (
  initialHeight: number,
  bounds: { min: number; max: number },
) => {
  const paneHeight = ref(initialHeight)
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
    const startY = event.clientY
    const startHeight = paneHeight.value

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.value) return
      const deltaY = moveEvent.clientY - startY
      paneHeight.value = Math.max(bounds.min, Math.min(bounds.max, startHeight + deltaY))
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
    paneHeight,
    isResizing,
    startResizing,
  }
}
