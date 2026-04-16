import { computed, ref } from 'vue'
import { REGEX_FILTER_MODE } from './filterModes'

interface UseRegexFilterOptions {
  inputTestId: string
  onEnter?: (event?: KeyboardEvent) => void
  defaultEnabled?: boolean
}

export const useRegexFilter = ({
  inputTestId,
  onEnter,
  defaultEnabled = false,
}: UseRegexFilterOptions) => {
  const query = ref('')
  const enabled = ref(defaultEnabled)
  const errorMessage = ref('')

  const updateRegexError = (nextQuery: string, nextEnabled = enabled.value) => {
    if (!nextEnabled || !nextQuery.trim()) {
      errorMessage.value = ''
      return
    }

    try {
      void new RegExp(nextQuery, 'i')
      errorMessage.value = ''
    } catch {
      errorMessage.value = '正则表达式无效，请检查输入格式'
    }
  }

  const handleInput = (event: Event) => {
    query.value = (event.target as HTMLInputElement | null)?.value ?? ''
    updateRegexError(query.value)
  }

  const toggleRegexMode = (event?: Event) => {
    event?.preventDefault()
    event?.stopPropagation()
    enabled.value = !enabled.value
    updateRegexError(query.value, enabled.value)
  }

  const clearQuery = () => {
    query.value = ''
    errorMessage.value = ''
  }

  const setQuery = (nextQuery: string) => {
    query.value = nextQuery
    updateRegexError(query.value)
  }

  const filterMatchMode = computed(() =>
    enabled.value ? REGEX_FILTER_MODE : 'contains',
  )

  const filterInputProps = computed(() => ({
    onInput: handleInput,
    'data-testid': inputTestId,
  }))

  const passThrough = computed(() => ({
    pcFilter: {
      root: {
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            onEnter?.(event)
          }
        },
      },
    },
  }))

  const getToggleClass = (active: boolean) => [
    'flex',
    'h-6',
    'w-6',
    'items-center',
    'justify-center',
    'rounded-md',
    'border',
    'text-[10px]',
    'font-bold',
    'transition-all',
    active
      ? '!border-blue-300 !bg-blue-50 !text-blue-600 shadow-sm'
      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50',
  ]

  return {
    query,
    enabled,
    errorMessage,
    filterMatchMode,
    filterInputProps,
    passThrough,
    clearQuery,
    setQuery,
    toggleRegexMode,
    getToggleClass,
  }
}
