import { computed, inject, provide, toValue, type ComputedRef, type InjectionKey, type MaybeRefOrGetter } from 'vue'

export type WorkflowOverlayTarget = HTMLElement | 'body'

type WorkflowOverlayHostContext = {
  overlayAppendTo: ComputedRef<WorkflowOverlayTarget>
  teleportTarget: ComputedRef<WorkflowOverlayTarget>
}

const workflowOverlayHostKey: InjectionKey<WorkflowOverlayHostContext> = Symbol('workflow-overlay-host')

const resolveTarget = (target: WorkflowOverlayTarget | undefined): WorkflowOverlayTarget => target ?? 'body'

export const provideWorkflowOverlayHost = (options: {
  overlayAppendTo?: MaybeRefOrGetter<WorkflowOverlayTarget | undefined>
  teleportTarget?: MaybeRefOrGetter<WorkflowOverlayTarget | undefined>
}) => {
  const overlayAppendTo = computed(() => resolveTarget(toValue(options.overlayAppendTo)))
  const teleportTarget = computed(() => resolveTarget(toValue(options.teleportTarget) ?? overlayAppendTo.value))

  const context: WorkflowOverlayHostContext = {
    overlayAppendTo,
    teleportTarget,
  }

  provide(workflowOverlayHostKey, context)
  return context
}

export const useWorkflowOverlayHost = (): WorkflowOverlayHostContext => {
  const injected = inject(workflowOverlayHostKey, null)
  if (injected) return injected

  const fallback = computed<WorkflowOverlayTarget>(() => 'body')
  return {
    overlayAppendTo: fallback,
    teleportTarget: fallback,
  }
}
