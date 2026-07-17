import { useState, useCallback, useEffect, useRef } from 'react'

interface UseRequestOptions<TParams extends unknown[]> {
  /** 挂载时自动执行 */
  immediate?: boolean
  /** immediate=true 时传入的参数 */
  params?: TParams
}

interface UseRequestResult<TData, TParams extends unknown[]> {
  data: TData | null
  loading: boolean
  error: Error | null
  execute: (...args: TParams) => Promise<TData>
  reset: () => void
}

/**
 * Generic async-request hook.
 *
 * Example:
 *   const { data: users, loading, execute: fetchUsers } =
 *     useRequest(usersService.list, { immediate: true })
 */
export function useRequest<TData, TParams extends unknown[] = []>(
  requestFn: (...args: TParams) => Promise<TData>,
  opts: UseRequestOptions<TParams> = {}
): UseRequestResult<TData, TParams> {
  const { immediate = false, params = [] as unknown as TParams } = opts

  const [data, setData] = useState<TData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fnRef = useRef(requestFn)
  useEffect(() => {
    fnRef.current = requestFn
  }, [requestFn])

  const execute = useCallback(async (...args: TParams): Promise<TData> => {
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current(...args)
      setData(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  const mountedRef = useRef(false)
  useEffect(() => {
    if (immediate && !mountedRef.current) {
      mountedRef.current = true
      void execute(...params)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate])

  return { data, loading, error, execute, reset }
}
