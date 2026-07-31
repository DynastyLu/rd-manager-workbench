import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { useThemeStore } from '../theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'aurora' })
    document.documentElement.setAttribute('data-theme', 'aurora')
  })

  it('sets data-theme on setTheme', () => {
    const { result } = renderHook(() => useThemeStore())
    act(() => result.current.setTheme('eye-care'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('eye-care')
  })
})
