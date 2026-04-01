import { FilterService } from '@primevue/core/api'

export const REGEX_FILTER_MODE = 'custom_regex'

const primeFilterService = FilterService as typeof FilterService & {
  filters: Record<string, unknown>
  register: (rule: string, fn: (value: unknown, filter: unknown) => boolean) => void
}

if (!(REGEX_FILTER_MODE in primeFilterService.filters)) {
  primeFilterService.register(REGEX_FILTER_MODE, (value: unknown, filter: unknown) => {
    if (filter === undefined || filter === null || filter === '') {
      return true
    }

    if (value === undefined || value === null) {
      return false
    }

    try {
      return new RegExp(String(filter), 'i').test(String(value))
    } catch {
      return false
    }
  })
}
