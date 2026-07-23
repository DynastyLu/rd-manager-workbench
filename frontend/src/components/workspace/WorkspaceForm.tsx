import { Button } from '@douyinfe/semi-ui'

interface WorkspaceFormActionsProps {
  cancelText?: string
  disabled?: boolean
  onCancel: () => void
  submitText: string
  submitting?: boolean
}

export function WorkspaceFormActions({
  cancelText = '取消',
  disabled = false,
  onCancel,
  submitText,
  submitting = false,
}: WorkspaceFormActionsProps) {
  return (
    <div className="workspace-modal-footer" role="group" aria-label="表单操作">
      <Button type="tertiary" onClick={onCancel} disabled={disabled}>
        {cancelText}
      </Button>
      <Button
        htmlType="submit"
        theme="solid"
        type="primary"
        loading={submitting}
        disabled={disabled || submitting}
      >
        {submitText}
      </Button>
    </div>
  )
}
