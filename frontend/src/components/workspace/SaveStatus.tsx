import { IconAlertTriangle, IconEdit, IconTickCircle, IconLoading } from '@douyinfe/semi-icons'

export type SaveState = 'dirty' | 'error' | 'saved' | 'saving'

interface SaveStatusProps {
  message?: string
  state: SaveState
}

const DEFAULT_MESSAGES: Record<SaveState, string> = {
  dirty: '等待自动保存',
  error: '保存失败，请重试',
  saved: '已保存',
  saving: '正在保存…',
}

export function SaveStatus({ message, state }: SaveStatusProps) {
  const Icon = state === 'error'
    ? IconAlertTriangle
    : state === 'saving'
      ? IconLoading
      : state === 'dirty'
        ? IconEdit
        : IconTickCircle
  return (
    <span
      className={`workspace-save-status workspace-save-status--${state}`}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={state === 'error' ? 'assertive' : 'polite'}
    >
      <Icon spin={state === 'saving'} />
      {message ?? DEFAULT_MESSAGES[state]}
    </span>
  )
}
