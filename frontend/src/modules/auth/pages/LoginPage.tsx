import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Banner, Form, withField } from '@douyinfe/semi-ui'
import { IconEyeClosedStroked, IconEyeOpened } from '@douyinfe/semi-icons'
import { useLocation, useNavigate } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { ApiError } from '@/lib/http'
import { login } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import { WorkspaceButton } from '@/components/workspace/WorkspaceButton'
import { WorkspaceInput } from '@/components/workspace/WorkspaceInput'

import './LoginPage.less'

interface LoginValues {
  identifier: string
  password: string
  rememberMe?: boolean
}

interface ControlledInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void
}

const ControlledWorkspaceInput = forwardRef<HTMLInputElement, ControlledInputProps>(
  ({ value, onChange, ...props }, ref) => (
    <WorkspaceInput
      ref={ref}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.currentTarget.value, event)}
      {...props}
    />
  )
)
ControlledWorkspaceInput.displayName = 'ControlledWorkspaceInput'

const FormWorkspaceInput = withField(ControlledWorkspaceInput, { maintainCursor: true })

const ControlledPasswordInput = forwardRef<HTMLInputElement, ControlledInputProps>(
  ({ value, onChange, type: _type, className = '', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    return (
      <div className="relative">
        <WorkspaceInput
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.currentTarget.value, event)}
          className={`workspace-input pr-10 ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-[var(--workspace-text-muted)] hover:text-[var(--workspace-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-brand)] rounded-r-lg"
          onClick={() => setShowPassword((show) => !show)}
        >
          {showPassword ? <IconEyeOpened size="small" /> : <IconEyeClosedStroked size="small" />}
        </button>
      </div>
    )
  }
)
ControlledPasswordInput.displayName = 'ControlledPasswordInput'

const FormPasswordInput = withField(ControlledPasswordInput, { maintainCursor: true })

function safeReturnPath(value: unknown): string {
  if (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) {
    return value
  }
  return ROUTES.HOME
}

function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '登录服务暂时不可用，请稍后重试。'
  if (error.code === 'AUTH_ACCOUNT_DISABLED') return '账号已停用，请联系管理员。'
  if (error.code === 'AUTH_ACCOUNT_LOCKED') return '尝试次数过多，请稍后再试。'
  if (error.code === 'AUTH_PASSWORD_EXPIRED') return '密码已过期，请联系管理员重置。'
  if (error.status === 401 || error.code === 'AUTH_INVALID_CREDENTIALS') {
    return '账号或密码错误，请重新输入。'
  }
  return '登录服务暂时不可用，请稍后重试。'
}

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [shake, setShake] = useState(false)

  const submit = async (values: LoginValues) => {
    setSubmitting(true)
    setError(undefined)
    try {
      const session = await login({
        identifier: values.identifier.trim(),
        password: values.password,
        rememberMe: Boolean(values.rememberMe),
      })
      useAuthStore.getState().setSession(session)
      const from = safeReturnPath((location.state as { from?: unknown } | null)?.from)
      void navigate(session.mustChangePassword ? ROUTES.CHANGE_PASSWORD : from, { replace: true })
    } catch (requestError) {
      setError(loginErrorMessage(requestError))
      setShake(true)
      setTimeout(() => setShake(false), 300)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="aurora-login-page">
      <div className="aurora-login-page__blob aurora-login-page__blob--1" aria-hidden="true" />
      <div className="aurora-login-page__blob aurora-login-page__blob--2" aria-hidden="true" />
      <div className="aurora-login-page__blob aurora-login-page__blob--3" aria-hidden="true" />
      <main className={`aurora-login-page__card ${shake ? 'aurora-login-page__card--shake' : ''}`}>
        <div className="aurora-login-page__brand">
          <span className="aurora-login-page__logo" aria-hidden="true" />
          <span>研发主管工作台</span>
        </div>
        <h1 className="aurora-login-page__title">欢迎回来</h1>
        <p className="aurora-login-page__subtitle">使用账号或员工工号登录</p>
        {error ? (
          <Banner className="aurora-login-page__banner" type="danger" description={error} />
        ) : null}
        <Form<LoginValues>
          className="aurora-login-form"
          layout="vertical"
          labelPosition="top"
          onSubmit={(values) => void submit(values)}
        >
          <FormWorkspaceInput
            field="identifier"
            label="账号或工号"
            autoComplete="username"
            placeholder="请输入账号或员工工号"
            rules={[{ required: true, message: '请输入账号或工号' }]}
            className="aurora-login-form__field"
          />
          <FormPasswordInput
            field="password"
            label="密码"
            autoComplete="current-password"
            placeholder="请输入密码"
            rules={[{ required: true, message: '请输入密码' }]}
            className="aurora-login-form__field"
          />
          <div className="aurora-login-form__options">
            <Form.Checkbox field="rememberMe" noLabel>
              保持登录
            </Form.Checkbox>
            <span>忘记密码请联系管理员</span>
          </div>
          <WorkspaceButton type="submit" loading={submitting} className="aurora-login-form__submit">
            登录
          </WorkspaceButton>
        </Form>
      </main>
    </div>
  )
}
