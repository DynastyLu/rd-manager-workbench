interface PageMeta {
  page: number
  pageSize: number
  total: number
}

interface PageResult<T> {
  data: T[]
  meta: PageMeta
}

export async function loadAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>,
  requestedPageSize = 100,
): Promise<PageResult<T>> {
  const firstPage = await fetchPage(1, requestedPageSize)
  const effectivePageSize = Math.max(1, firstPage.meta.pageSize || requestedPageSize)
  const pageCount = Math.ceil(firstPage.meta.total / effectivePageSize)

  if (pageCount <= 1) return firstPage

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      fetchPage(index + 2, requestedPageSize),
    ),
  )
  const data = [firstPage, ...remainingPages].flatMap((page) => page.data)

  return {
    data,
    meta: {
      page: 1,
      pageSize: data.length,
      total: firstPage.meta.total,
    },
  }
}
