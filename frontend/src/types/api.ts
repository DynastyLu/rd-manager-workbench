/** 分页数据结构（服务端约定格式） */
export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
