import { toast as sonnerToast } from 'sonner'

// duration=0 means "no auto-dismiss" → sonner uses Infinity
function toDuration(d?: number): number {
  if (d === undefined) return 3000
  return d === 0 ? Infinity : d
}

const _actions = {
  showSuccess: (msg: string, duration?: number) =>
    sonnerToast.success(msg, { duration: toDuration(duration) }),
  showError: (msg: string, duration?: number) =>
    sonnerToast.error(msg, { duration: toDuration(duration) }),
  showInfo: (msg: string, duration?: number) =>
    sonnerToast.info(msg, { duration: toDuration(duration) }),
  showWarning: (msg: string, duration?: number) =>
    sonnerToast.warning(msg, { duration: toDuration(duration) }),
}

/** Compat shim: useToastStore.getState().showX() pattern used in useOnlineStatus.ts and UpdateNotifier.tsx */
export const useToastStore = {
  getState: () => _actions,
}

/** Hook for components — exposes toast.success / toast.error / toast.info / toast.warning */
export function useToast() {
  return {
    success: (msg: string, duration?: number) => _actions.showSuccess(msg, duration),
    error: (msg: string, duration?: number) => _actions.showError(msg, duration),
    info: (msg: string, duration?: number) => _actions.showInfo(msg, duration),
    warning: (msg: string, duration?: number) => _actions.showWarning(msg, duration),
  }
}
