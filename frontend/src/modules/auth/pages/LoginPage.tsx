import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react'
import { Banner, Form, withField } from '@douyinfe/semi-ui'
import { IconEyeClosedStroked, IconEyeOpened } from '@douyinfe/semi-icons'
import { useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { ApiError } from '@/lib/http'
import { login } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import { WorkspaceButton } from '@/components/workspace/WorkspaceButton'
import { WorkspaceInput } from '@/components/workspace/WorkspaceInput'
import { GalaxyBackground } from '@/components/visual/GalaxyBackground'
import { LOGIN_GALAXY_PRESET } from '@/modules/auth/pages/loginGalaxyPreset'

import './LoginPage.less'

interface LoginValues {
  identifier: string
  password: string
  rememberMe?: boolean
}

interface ControlledInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  floatingLabel: string
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void
  validateStatus?: string
}

const ControlledWorkspaceInput = forwardRef<HTMLInputElement, ControlledInputProps>(
  (
    {
      id,
      value,
      onChange,
      floatingLabel,
      validateStatus,
      className = '',
      'aria-labelledby': _ariaLabelledBy,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      <div
        className={`aurora-floating-field ${validateStatus === 'error' ? 'aurora-floating-field--error' : ''} ${className}`.trim()}
      >
        <WorkspaceInput
          ref={ref}
          id={inputId}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.currentTarget.value, event)}
          {...props}
        />
        <label className="aurora-floating-field__label" htmlFor={inputId}>
          {floatingLabel}
        </label>
      </div>
    )
  }
)
ControlledWorkspaceInput.displayName = 'ControlledWorkspaceInput'

const FormWorkspaceInput = withField(ControlledWorkspaceInput, { maintainCursor: true })

const ControlledPasswordInput = forwardRef<HTMLInputElement, ControlledInputProps>(
  (
    {
      id,
      value,
      onChange,
      type: _type,
      floatingLabel,
      validateStatus,
      className = '',
      'aria-labelledby': _ariaLabelledBy,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false)
    const generatedId = useId()
    const inputId = id ?? generatedId

    return (
      <div
        className={`aurora-floating-field aurora-floating-field--password ${validateStatus === 'error' ? 'aurora-floating-field--error' : ''} ${className}`.trim()}
      >
        <WorkspaceInput
          ref={ref}
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.currentTarget.value, event)}
          {...props}
        />
        <label className="aurora-floating-field__label" htmlFor={inputId}>
          {floatingLabel}
        </label>
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          aria-pressed={showPassword}
          className="aurora-floating-field__password-toggle"
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
  const prefersReducedMotion = useReducedMotion()
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
      <GalaxyBackground
        data-testid="login-galaxy"
        aria-hidden="true"
        {...LOGIN_GALAXY_PRESET}
        mouseInteraction={!prefersReducedMotion}
        disableAnimation={Boolean(prefersReducedMotion)}
        transparent
      />
      <main className="aurora-login-page__workspace">
        <section className="aurora-login-page__story" aria-label="研发工作台能力概览">
          <div className="aurora-login-page__story-glow" aria-hidden="true" />
          <div className="aurora-login-page__story-content">
            <div className="aurora-login-page__brand aurora-login-page__brand--inverse">
              <span className="aurora-login-page__logo" aria-hidden="true">
                RD
              </span>
              <span>研发主管工作台</span>
            </div>
            <div className="aurora-login-page__story-copy">
              <span className="aurora-login-page__eyebrow">LOCAL R&amp;D OPERATING SYSTEM</span>
              <h1>把研发计划变成清晰行动</h1>
              <p>从项目推进、员工周计划到本地知识检索，在一个安全工作空间里形成完整闭环。</p>
              <ul className="aurora-login-page__capabilities">
                <li>
                  <span aria-hidden="true" />
                  项目全周期可视
                </li>
                <li>
                  <span aria-hidden="true" />
                  周计划自动汇总
                </li>
                <li>
                  <span aria-hidden="true" />
                  本地知识安全检索
                </li>
              </ul>
            </div>
            <div className="aurora-login-page__story-footer">
              <span className="aurora-login-page__status-dot" aria-hidden="true" />
              本地数据服务已就绪
            </div>
          </div>
        </section>

        <section className="aurora-login-page__access" aria-label="账号登录">
          <div className="aurora-login-page__access-brand">
            <span className="aurora-login-page__logo" aria-hidden="true">
              RD
            </span>
            <span>研发主管工作台</span>
          </div>
          <div
            className={`aurora-login-page__card ${shake ? 'aurora-login-page__card--shake' : ''}`}
          >
            <span className="aurora-login-page__kicker">WELCOME BACK</span>
            <h2 className="aurora-login-page__title">登录工作空间</h2>
            <p className="aurora-login-page__subtitle">使用账号或员工工号继续处理今天的研发工作</p>
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
                noLabel
                floatingLabel="账号或工号"
                autoComplete="username"
                placeholder="请输入账号或员工工号"
                rules={[{ required: true, message: '请输入账号或工号' }]}
                className="aurora-login-form__field"
              />
              <FormPasswordInput
                field="password"
                noLabel
                floatingLabel="密码"
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
              <WorkspaceButton
                type="submit"
                loading={submitting}
                className="aurora-login-form__submit"
              >
                登录
              </WorkspaceButton>
            </Form>
          </div>
          <p className="aurora-login-page__security-note">
            <span aria-hidden="true">◆</span> 账号、权限和数据均由本地工作空间管理
          </p>
        </section>
      </main>
    </div>
  )
}
