import { useState } from 'react'

export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Reset to page 1 when filtering/sorting shrinks the list past the current page
  if (page > totalPages) setPage(1)

  const paginated = items.slice((page - 1) * pageSize, page * pageSize)

  return { page, setPage, totalPages, paginated }
}
