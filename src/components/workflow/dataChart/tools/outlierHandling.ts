import type { ChartRow } from '../types'
import { filterRowsByRenderableKeys } from './filtering'

export const filterInvalidLineRows = (rows: ChartRow[], keys: string[]) =>
  filterRowsByRenderableKeys(rows, keys)
