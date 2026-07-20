import { Banner, Button, Modal } from '@douyinfe/semi-ui'

interface AiConsentDialogProps {
  visible: boolean
  provider: string
  objectLabel: string
  characterCount: number
  submitting?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function AiConsentDialog({
  visible,
  provider,
  objectLabel,
  characterCount,
  submitting,
  onCancel,
  onConfirm,
}: AiConsentDialogProps) {
  return (
    <Modal
      visible={visible}
      title="确认发送给 AI"
      onCancel={onCancel}
      footer={(
        <div className="extension-dialog__actions">
          <Button onClick={onCancel}>取消</Button>
          <Button theme="solid" type="primary" loading={submitting} onClick={onConfirm}>确认发送</Button>
        </div>
      )}
    >
      <Banner
        type="warning"
        fullMode={false}
        closeIcon={null}
        title="以下数据将离开本机"
        description={`${objectLabel} · ${characterCount.toLocaleString('zh-CN')} 个字符 · ${provider}`}
      />
      <p>AI 返回内容只会作为建议展示；在你点击“采纳”前，不会覆盖纪要、文档或创建任务。</p>
    </Modal>
  )
}
