import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

type QueryValue = string | number | boolean | null | undefined

interface UpdateOptions {
  defaults?: Record<string, QueryValue>
  replace?: boolean
}

export function useWorkspaceSearchParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const latestSearchParams = useRef(searchParams)

  useEffect(() => {
    latestSearchParams.current = searchParams
  }, [searchParams])

  const getString = useCallback(
    (key: string, fallback = '') => searchParams.get(key)?.trim() || fallback,
    [searchParams],
  )

  const getEnum = useCallback(
    <T extends string>(key: string, values: readonly T[], fallback: T): T => {
      const value = searchParams.get(key)
      return value && values.includes(value as T) ? (value as T) : fallback
    },
    [searchParams],
  )

  const getPositiveInt = useCallback(
    (key: string, fallback = 1) => {
      const value = Number(searchParams.get(key))
      return Number.isInteger(value) && value > 0 ? value : fallback
    },
    [searchParams],
  )

  const update = useCallback(
    (changes: Record<string, QueryValue>, options: UpdateOptions = {}) => {
      const next = new URLSearchParams(latestSearchParams.current)
      Object.entries(changes).forEach(([key, value]) => {
        const defaultValue = options.defaults?.[key]
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (defaultValue !== undefined && String(value) === String(defaultValue))
        ) {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      })
      latestSearchParams.current = next
      setSearchParams(next, { replace: options.replace ?? true })
    },
    [setSearchParams],
  )

  return { getEnum, getPositiveInt, getString, searchParams, setSearchParams, update }
}
