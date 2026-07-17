import { useState, useEffect } from 'react'
import { useToastStore } from '@/stores/toast'

/**
 * Tracks browser online/offline status.
 * Shows a toast notification on status change.
 *
 * Usage:
 *   const isOnline = useOnlineStatus()
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      useToastStore.getState().showSuccess('网络已恢复')
    }
    const onOffline = () => {
      setIsOnline(false)
      useToastStore.getState().showWarning('网络已断开，部分功能不可用')
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return isOnline
}
