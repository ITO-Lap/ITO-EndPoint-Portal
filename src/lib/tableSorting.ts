export type SortDirection = 'asc' | 'desc'

export function toggleSortDirection(currentKey: string | null, currentDirection: SortDirection, nextKey: string): SortDirection {
  return currentKey === nextKey && currentDirection === 'asc' ? 'desc' : 'asc'
}

export function sortRows<T>(
  rows: readonly T[],
  valueFor: (row: T) => string | number | boolean | null | undefined,
  direction: SortDirection,
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: valueFor(row) }))
    .sort((left, right) => {
      if (left.value == null) return right.value == null ? left.index - right.index : 1
      if (right.value == null) return -1

      let comparison: number
      if (typeof left.value === 'number' && typeof right.value === 'number') {
        comparison = left.value - right.value
      } else if (typeof left.value === 'boolean' && typeof right.value === 'boolean') {
        comparison = Number(left.value) - Number(right.value)
      } else {
        comparison = String(left.value).localeCompare(String(right.value), undefined, { numeric: true, sensitivity: 'base' })
      }
      return comparison === 0 ? left.index - right.index : comparison * multiplier
    })
    .map(item => item.row)
}