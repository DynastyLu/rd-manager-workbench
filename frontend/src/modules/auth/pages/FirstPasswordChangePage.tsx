import { useState } from 'react'
import { Banner, Button, Form } from '@douyinfe/semi-ui'
import { useNavigate } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { changePassword } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import { AuthFrame } from '@/modules/auth/pages/AuthFrame'

interface PasswordValues {
  currentPassword: string
  newPassword: string
  confirmation: string
}

export default function FirstPasswordChangePage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (values: PasswordValues) => {
    if (values.newPassword !== values.confirmation) {
      setError('两次输入的新密码不一致')
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      useAuthStore.getState().clearSession()
      void navigate(ROUTES.LOGIN, {
        replace: true,
        state: { passwordChanged: true },
      })
    } catch {
      setError('密码更新失败，请检查当前密码和新密码强度。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="账号安全"
      title="更新首次登录密码"
      description="临时密码只能使用一次。更新后其他设备会退出，请使用新密码重新登录。"
    >
      {error ? <Banner className="auth-card__banner" type="danger" description={error} /> : null}
      <Form<PasswordValues>
        className="auth-form"
        layout="vertical"
        labelPosition="top"
        onSubmit={(values) => void submit(values)}
      >
        <Form.Input
          field="currentPassword"
          label="当前密码"
          mode="password"
          autoComplete="current-password"
          rules={[{ required: true, message: '请输入当前密码' }]}
        />
        <Form.Input
          field="newPassword"
          label="新密码"
          mode="password"
          autoComplete="new-password"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 12, message: '新密码至少需要 12 个字符' },
          ]}
        />
        <Form.Input
          field="confirmation"
          label="确认新密码"
          mode="password"
          autoComplete="new-password"
          rules={[{ required: true, message: '请再次输入新密码' }]}
        />
        <Button block htmlType="submit" loading={submitting} theme="solid" type="primary">
          更新密码
        </Button>
      </Form>
    </AuthFrame>
  )
}

