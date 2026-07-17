import { useEffect } from 'react'
import { checkForUpdate } from '@/lib/version'
import { useToastStore } from '@/stores/toast'

const CHECK_INTERVAL = 1000 * 60 * 5 // 5 minutes

/**
 * Silently polls for new deployments and shows a persistent toast when found.
 * Mount once at app root — renders nothing.
 */
export function UpdateNotifier() {
  useEffect(() => {
    const id = setInterval(() => {
      void checkForUpdate().then((hasUpdate) => {
        if (hasUpdate) {
          clearInterval(id)
          useToastStore.getState().showInfo(
            '检测到新版本，请刷新页面以获取最新功能',
            0 // duration=0: does not auto-dismiss
          )
        }
      })
    }, CHECK_INTERVAL)

    return () => clearInterval(id)
  }, [])

  return null
}
