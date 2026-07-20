import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Empty, Input, Modal, Switch, Tag } from '@douyinfe/semi-ui'
import { IconEdit, IconPlus } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  archiveSmsRecipient,
  createSmsRecipient,
  listSmsRecipients,
  updateSmsRecipient,
  type SmsRecipient,
} from '@/modules/workbench/api/extensions'

interface RecipientDraft {
  recipient?: SmsRecipient
  label: string
  phoneNumber: string
}

function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, '')
}

function maskedPhone(value: string) {
  const phone = normalizePhone(value)
  if (phone.startsWith('+')) return `${phone.slice(0, 5)}********${phone.slice(-4)}`
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function isPhoneValid(value: string) {
  return /^\+?[1-9]\d{6,14}$/.test(normalizePhone(value))
}

export function SmsRecipientManager() {
  const client = useQueryClient()
  const [draft, setDraft] = useState<RecipientDraft | null>(null)
  const credentials = window.rdWorkbenchDesktop?.credentials
  const recipientsQuery = useQuery({
    queryKey: ['extensions', 'sms-recipients'],
    queryFn: listSmsRecipients,
  })
  const vaultQuery = useQuery({
    queryKey: ['extensions', 'credential-store'],
    queryFn: () => credentials?.isAvailable() ?? Promise.resolve(false),
  })

  const saveMutation = useMutation({
    mutationFn: async (value: RecipientDraft) => {
      if (!credentials || !vaultQuery.data) throw new Error('CREDENTIAL_STORE_UNAVAILABLE')
      const label = value.label.trim()
      if (!label) throw new Error('RECIPIENT_LABEL_REQUIRED')
      const nextPhone = normalizePhone(value.phoneNumber)
      if (!value.recipient) {
        if (!isPhoneValid(nextPhone)) throw new Error('PHONE_INVALID')
        const credentialRef = `credential:sms-recipient:${crypto.randomUUID()}`
        await credentials.put(credentialRef, { phoneNumber: nextPhone })
        try {
          return await createSmsRecipient({
            label,
            maskedPhone: maskedPhone(nextPhone),
            credentialRef,
            enabled: true,
          })
        } catch (error) {
          await credentials.delete(credentialRef).catch(() => undefined)
          throw error
        }
      }
      if (!nextPhone) return updateSmsRecipient(value.recipient.id, { label })
      if (!isPhoneValid(nextPhone)) throw new Error('PHONE_INVALID')
      const credentialRef = `credential:sms-recipient:${crypto.randomUUID()}`
      await credentials.put(credentialRef, { phoneNumber: nextPhone })
      try {
        const updated = await updateSmsRecipient(value.recipient.id, {
          label,
          maskedPhone: maskedPhone(nextPhone),
          credentialRef,
        })
        try {
          await credentials.delete(value.recipient.credentialRef)
        } catch {
          try {
            await updateSmsRecipient(value.recipient.id, {
              label: value.recipient.label,
              maskedPhone: value.recipient.maskedPhone,
              credentialRef: value.recipient.credentialRef,
              enabled: value.recipient.enabled,
            })
          } catch {
            // The database still points at the newly written credential; keep it usable.
            throw new Error('RECIPIENT_ROTATION_ROLLBACK_FAILED')
          }
          await credentials.delete(credentialRef)
          throw new Error('RECIPIENT_ROTATION_CLEANUP_FAILED')
        }
        return updated
      } catch (error) {
        await credentials.delete(credentialRef).catch(() => undefined)
        throw error
      }
    },
    onSuccess: async () => {
      setDraft(null)
      await client.invalidateQueries({ queryKey: ['extensions', 'sms-recipients'] })
      toast.success('短信收件人已保存')
    },
    onError: (error) => toast.error(error instanceof Error && error.message === 'PHONE_INVALID' ? '请输入有效的国际或国内手机号码。' : '收件人保存失败，完整手机号没有写入数据库。'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ recipient, enabled }: { recipient: SmsRecipient; enabled: boolean }) =>
      updateSmsRecipient(recipient.id, { enabled }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['extensions', 'sms-recipients'] }),
    onError: () => toast.error('收件人状态更新失败。'),
  })

  const archiveMutation = useMutation({
    mutationFn: async (recipient: SmsRecipient) => {
      if (!credentials) throw new Error('CREDENTIAL_STORE_UNAVAILABLE')
      await updateSmsRecipient(recipient.id, { enabled: false })
      await credentials.delete(recipient.credentialRef)
      await archiveSmsRecipient(recipient.id)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['extensions', 'sms-recipients'] })
      toast.success('收件人已归档')
    },
    onError: () => toast.error('收件人归档失败。'),
  })

  const vaultAvailable = Boolean(credentials && vaultQuery.data)

  return (
    <section className="sms-recipient-manager" aria-label="短信收件人">
      <header>
        <div>
          <p>RECIPIENT VAULT</p>
          <h3>短信收件人</h3>
          <span>数据库只保存名称、脱敏号码和凭据引用；完整手机号保存在本机加密保险箱。</span>
        </div>
        <Button
          icon={<IconPlus />}
          aria-label="添加短信收件人"
          disabled={!vaultAvailable}
          onClick={() => setDraft({ label: '', phoneNumber: '' })}
        >
          添加收件人
        </Button>
      </header>

      {!vaultAvailable ? (
        <Banner
          type="warning"
          fullMode={false}
          closeIcon={null}
          title="真实手机号只能在 Electron 加密保险箱中保存"
          description="浏览器页面不会把手机号写入数据库、localStorage、日志或 URL。请打开桌面端后再添加收件人。"
        />
      ) : null}

      <div className="sms-recipient-manager__list">
        {(recipientsQuery.data ?? []).map((recipient) => (
          <article key={recipient.id}>
            <div>
              <strong>{recipient.label}</strong>
              <span>{recipient.maskedPhone}</span>
            </div>
            <Tag color={recipient.enabled ? 'green' : 'grey'}>{recipient.enabled ? '接收提醒' : '已停用'}</Tag>
            <Button
              icon={<IconEdit />}
              aria-label={`编辑收件人：${recipient.label}`}
              onClick={() => setDraft({ recipient, label: recipient.label, phoneNumber: '' })}
            >编辑</Button>
            <Button
              aria-label={`${recipient.enabled ? '停用' : '启用'}收件人：${recipient.label}`}
              onClick={() => toggleMutation.mutate({ recipient, enabled: !recipient.enabled })}
            >{recipient.enabled ? '停用' : '启用'}</Button>
            <Switch
              aria-label={`${recipient.label} 接收短信`}
              checked={recipient.enabled}
              onChange={(enabled) => toggleMutation.mutate({ recipient, enabled })}
            />
            <Button type="danger" aria-label={`归档收件人：${recipient.label}`} onClick={() => archiveMutation.mutate(recipient)}>归档</Button>
          </article>
        ))}
      </div>
      {!recipientsQuery.isPending && !recipientsQuery.data?.length ? <Empty title="尚未添加短信收件人" description="添加后，提醒规则才可选择真实短信通道。" /> : null}

      <Modal
        visible={Boolean(draft)}
        title={draft?.recipient ? '编辑短信收件人' : '添加短信收件人'}
        onCancel={() => setDraft(null)}
        footer={(
          <>
            <Button onClick={() => setDraft(null)}>取消</Button>
            <Button
              theme="solid"
              type="primary"
              loading={saveMutation.isPending}
              disabled={!draft?.label.trim() || (!draft.recipient && !isPhoneValid(draft?.phoneNumber ?? ''))}
              onClick={() => { if (draft) saveMutation.mutate(draft) }}
            >
              {draft?.recipient ? '保存修改' : '保存收件人'}
            </Button>
          </>
        )}
      >
        <div className="extension-profile-form">
          <div className="extension-profile-form__field">
            <span>名称</span>
            <Input aria-label="收件人名称" value={draft?.label ?? ''} onChange={(label) => draft && setDraft({ ...draft, label })} placeholder="例如：本人 / 值班手机" />
          </div>
          <div className="extension-profile-form__field">
            <span>{draft?.recipient ? '替换手机号（可选）' : '手机号码'}</span>
            <Input
              aria-label="手机号码"
              mode="password"
              value={draft?.phoneNumber ?? ''}
              onChange={(phoneNumber) => draft && setDraft({ ...draft, phoneNumber })}
              placeholder={draft?.recipient ? `保持 ${draft.recipient.maskedPhone} 不变` : '请输入手机号（可含国际区号）'}
            />
            <small>输入过程仅保存在当前页面内存；保存后立即写入 Electron 加密保险箱。</small>
          </div>
        </div>
      </Modal>
    </section>
  )
}
