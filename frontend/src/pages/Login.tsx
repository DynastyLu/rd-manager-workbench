import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import worldCupStarsPlay from '@/assets/login/world-cup-stars-play.webp'
import worldCupStarsWatch from '@/assets/login/world-cup-stars-watch.webp'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { LoginSchema, type LoginFormData } from '@/schemas/auth'
import { useAuthStore } from '@/stores/auth'

type FieldName = 'username' | 'password'
type PlayerState = 'playing' | 'watch-input'

export default function Login() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [focusedField, setFocusedField] = useState<FieldName | null>(null)
  const [hoveredField, setHoveredField] = useState<FieldName | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordLength, setPasswordLength] = useState(0)

  const form = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { username: '', password: '' },
  })

  async function onSubmit(values: LoginFormData) {
    try {
      await login(values.username, values.password)
      const returnUrl = searchParams.get('returnUrl') ?? '/'
      const safeUrl = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
      void navigate(safeUrl, { replace: true })
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : ''
      const message =
        error instanceof TypeError || errorCode === 'BACKEND_UNAVAILABLE'
          ? '后端服务未连接，请先启动 backend-core-platform'
          : 'ACCESS DENIED — 用户名或密码错误'
      form.setError('root', { message })
    }
  }

  const isSubmitting = form.formState.isSubmitting
  const rootError = form.formState.errors.root?.message
  const playerState: PlayerState = focusedField || hoveredField ? 'watch-input' : 'playing'

  function watchField(field: FieldName) {
    setHoveredField(field)
  }

  function leaveField(field: FieldName) {
    setHoveredField((value) => (value === field ? null : value))
  }

  function focusField(field: FieldName) {
    setFocusedField(field)
  }

  function blurField(field: FieldName) {
    setFocusedField((value) => (value === field ? null : value))
  }

  return (
    <div
      data-testid="login-root"
      data-theme="world-cup"
      data-layout="full-bleed-stadium"
      style={styles.root}
    >
      <FootballPlayers state={playerState} passwordLength={passwordLength} />
      <BackgroundDecor />

      <div className="login-split-layout" data-testid="login-split-layout" style={styles.shell}>
        <motion.div
          data-testid="login-panel"
          data-placement="right"
          data-edge="far-right"
          data-tone="stadium-login"
          style={styles.card}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          <p style={styles.eyebrow}>WORLD CUP TREASURE</p>
          <h1 style={styles.title}>百宝箱开球</h1>
          <p style={styles.subtitle}>登录后继续你的工具赛程。</p>

          <Form {...form}>
            <form
              onSubmit={(event) => {
                void form.handleSubmit(onSubmit)(event)
              }}
              style={styles.form}
            >
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem style={styles.inputWrap}>
                    <label htmlFor="login-username" style={styles.label}>
                      用户名
                    </label>
                    <FormControl>
                      <input
                        {...field}
                        id="login-username"
                        style={styles.input}
                        type="text"
                        placeholder="用户名"
                        autoComplete="username"
                        maxLength={50}
                        onMouseEnter={() => {
                          watchField('username')
                        }}
                        onMouseLeave={() => {
                          leaveField('username')
                        }}
                        onFocus={() => {
                          focusField('username')
                        }}
                        onBlur={() => {
                          field.onBlur()
                          blurField('username')
                        }}
                      />
                    </FormControl>
                    <FormMessage style={styles.error} />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem style={styles.inputWrap}>
                    <label htmlFor="login-password" style={styles.label}>
                      密码
                    </label>
                    <FormControl>
                      <div style={styles.passwordField}>
                        <input
                          {...field}
                          id="login-password"
                          style={{ ...styles.input, ...styles.passwordInput }}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="密码"
                          autoComplete="current-password"
                          maxLength={72}
                          onFocus={() => {
                            focusField('password')
                          }}
                          onMouseEnter={() => {
                            watchField('password')
                          }}
                          onMouseLeave={() => {
                            leaveField('password')
                          }}
                          onBlur={(event) => {
                            field.onBlur()
                            blurField('password')
                            if (event.currentTarget.value.length === 0) {
                              setPasswordLength(0)
                            }
                          }}
                          onChange={(event) => {
                            field.onChange(event)
                            setPasswordLength(event.currentTarget.value.length)
                          }}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? '隐藏密码' : '显示密码'}
                          title={showPassword ? '隐藏密码' : '显示密码'}
                          onClick={() => {
                            setShowPassword((value) => !value)
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault()
                          }}
                          style={styles.passwordToggle}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage style={styles.error} />
                  </FormItem>
                )}
              />

              {rootError && <p style={styles.errorPanel}>{rootError}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                style={
                  isSubmitting
                    ? { ...styles.submit, opacity: 0.65, cursor: 'not-allowed' }
                    : styles.submit
                }
              >
                {isSubmitting ? 'CONNECTING...' : '[ KICK OFF ]'}
              </button>
            </form>
          </Form>
        </motion.div>
      </div>

      <style>{`
        @keyframes stadiumFloat {
          0%, 100% { transform: translateY(0) rotate(-0.5deg); }
          50% { transform: translateY(-9px) rotate(0.5deg); }
        }
        @keyframes stadiumPeek {
          0%, 100% { transform: translateY(-4px) scale(1.012); }
          50% { transform: translateY(-15px) scale(1.026); }
        }
        @keyframes floodlightSweep {
          0%, 100% { transform: translateX(-16%) rotate(-8deg); opacity: .32; }
          50% { transform: translateX(12%) rotate(8deg); opacity: .54; }
        }
        .login-split-layout {
          min-height: 100vh;
        }
        .password-peekers {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .password-peekers::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 2;
          background:
            linear-gradient(90deg, rgba(4, 13, 34, 0.02) 0%, rgba(4, 13, 34, 0.08) 48%, rgba(4, 13, 34, 0.48) 70%, rgba(3, 8, 20, 0.84) 100%),
            linear-gradient(180deg, rgba(1, 6, 18, 0.1) 0%, rgba(1, 6, 18, 0.08) 55%, rgba(2, 22, 14, 0.34) 100%);
        }
        .football-arena {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .football-arena::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 3;
          background:
            radial-gradient(circle at 6% 10%, rgba(255,255,255,0.26), transparent 18%),
            radial-gradient(circle at 68% 22%, rgba(255, 213, 110, 0.16), transparent 22%);
          pointer-events: none;
        }
        .football-star-art {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: left center;
          z-index: 1;
          transform-origin: 45% 74%;
          transition: filter 260ms ease, opacity 260ms ease, transform 260ms ease;
          user-select: none;
        }
        .football-star-art-play {
          opacity: 1;
        }
        .football-star-art-watch {
          opacity: 0;
        }
        .password-peekers[data-player-state='watch-input'] .football-star-art-play {
          opacity: 0;
        }
        .password-peekers[data-player-state='watch-input'] .football-star-art-watch {
          opacity: 1;
        }
        .password-peekers[data-player-state='watch-input'] .football-star-art {
          filter: saturate(1.08) contrast(1.03);
        }
        input:focus {
          outline: none;
          border-color: #f6d05d !important;
          box-shadow: 0 0 0 4px rgba(246, 208, 93, 0.18) !important;
        }
        button[type=submit]:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 36px rgba(246, 208, 93, 0.24) !important;
        }
        @media (max-width: 900px) {
          .login-split-layout {
            justify-content: center;
            padding: 28px;
          }
          .password-peekers::before {
            background:
              linear-gradient(180deg, rgba(4, 13, 34, 0.1) 0%, rgba(4, 13, 34, 0.28) 42%, rgba(3, 8, 20, 0.78) 100%),
              linear-gradient(90deg, rgba(4, 13, 34, 0.04), rgba(4, 13, 34, 0.24));
          }
          .football-star-art {
            object-position: 24% center;
          }
        }
      `}</style>
    </div>
  )
}

function BackgroundDecor() {
  return (
    <>
      <div style={styles.backdropGlow} aria-hidden="true" />
      <div style={styles.backdropBlue} aria-hidden="true" />
      <div style={styles.backdropBand} aria-hidden="true" />
    </>
  )
}

function FootballPlayers({
  state,
  passwordLength,
}: {
  state: PlayerState
  passwordLength: number
}) {
  return (
    <div
      className="password-peekers"
      data-testid="password-peekers"
      data-placement="left-stage"
      data-character-style="cartoon-football-stars"
      data-roster="messi-ronaldo-neymar-mbappe-haaland"
      data-asset-style="raster-illustration"
      data-composition-mode="same-frame-head-gaze"
      data-player-state={state}
      data-password-length={String(passwordLength)}
      aria-hidden="true"
    >
      <div className="football-arena">
        <img
          className="football-star-art football-star-art-play"
          data-testid="football-star-art-play"
          src={worldCupStarsPlay}
          alt=""
          draggable={false}
        />
        <img
          className="football-star-art football-star-art-watch"
          data-testid="football-star-art-watch"
          src={worldCupStarsWatch}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    minHeight: '100vh',
    padding: 0,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily:
      '"Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#f7fbff',
    background:
      'linear-gradient(180deg, rgba(4, 13, 34, 0.1) 0%, rgba(4, 13, 34, 0.78) 54%, rgba(2, 31, 22, 0.96) 100%), radial-gradient(circle at 22% 12%, rgba(108, 193, 255, 0.34), transparent 24%), radial-gradient(circle at 76% 18%, rgba(255, 205, 94, 0.24), transparent 22%), linear-gradient(135deg, #061326 0%, #061a32 44%, #073221 100%)',
  },
  shell: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: '32px clamp(18px, 4.8vw, 72px) 32px 32px',
    boxSizing: 'border-box',
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    overflow: 'visible',
    backdropFilter: 'none',
  },
  stage: {
    position: 'relative',
    alignSelf: 'stretch',
    minHeight: 656,
    overflow: 'hidden',
    borderRadius: 26,
    background:
      'linear-gradient(180deg, rgba(8, 28, 59, 0.82) 0%, rgba(8, 24, 48, 0.54) 52%, rgba(4, 55, 35, 0.86) 100%)',
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.13)',
  },
  stageCopy: {
    position: 'relative',
    zIndex: 4,
    width: 'min(380px, 86%)',
    padding: '42px 0 0 46px',
  },
  stageBadge: {
    display: 'inline-flex',
    padding: '7px 13px',
    borderRadius: 999,
    background: 'rgba(246, 208, 93, 0.16)',
    color: '#f8d66d',
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.4,
    border: '1px solid rgba(246, 208, 93, 0.38)',
    boxShadow: '0 0 22px rgba(246, 208, 93, 0.12)',
  },
  stageTitle: {
    margin: '18px 0 10px',
    color: '#fffdf4',
    fontSize: 'clamp(32px, 4.1vw, 58px)',
    lineHeight: 0.92,
    letterSpacing: 0,
    fontWeight: 1000,
    textShadow: '0 12px 30px rgba(0, 0, 0, 0.42)',
  },
  stageText: {
    margin: 0,
    color: 'rgba(238, 247, 255, 0.78)',
    fontSize: 15,
    lineHeight: 1.65,
    fontWeight: 700,
  },
  floor: {
    position: 'absolute',
    left: '-10%',
    right: '-10%',
    bottom: -72,
    height: 206,
    borderRadius: '50% 50% 0 0',
    background:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 96px), linear-gradient(180deg, #168046, #075d33)',
    boxShadow: 'inset 0 24px 0 rgba(255,255,255,0.08)',
  },
  card: {
    position: 'relative',
    zIndex: 2,
    width: 392,
    maxWidth: '100%',
    padding: '36px 42px 38px',
    boxSizing: 'border-box',
    borderRadius: 24,
    background: 'linear-gradient(180deg, rgba(7, 18, 38, 0.78), rgba(3, 9, 22, 0.68))',
    border: 'none',
    boxShadow: '0 28px 78px rgba(0, 0, 0, 0.42)',
    backdropFilter: 'blur(16px)',
  },
  cardTopBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 22,
  },
  cardDot: {
    width: 13,
    height: 13,
    borderRadius: 999,
    background: '#ffd33d',
    border: '2px solid #243047',
  },
  eyebrow: {
    margin: 0,
    color: '#f6d05d',
    fontSize: 12,
    fontWeight: 1000,
    letterSpacing: 1.8,
  },
  title: {
    margin: '10px 0 8px',
    color: '#ffffff',
    fontSize: 36,
    lineHeight: 1.05,
    fontWeight: 1000,
    letterSpacing: 0,
  },
  subtitle: {
    margin: '0 0 28px',
    color: 'rgba(231, 240, 255, 0.66)',
    fontSize: 14,
    lineHeight: 1.6,
    fontWeight: 650,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  inputWrap: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    color: 'rgba(244, 249, 255, 0.88)',
    fontSize: 13,
    fontWeight: 900,
  },
  input: {
    width: '100%',
    minHeight: 50,
    boxSizing: 'border-box',
    borderRadius: 18,
    border: '1px solid rgba(255, 255, 255, 0.16)',
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#f8fbff',
    padding: '0 16px',
    fontSize: 15,
    fontWeight: 760,
    fontFamily: 'inherit',
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.14)',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
  },
  passwordField: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 54,
  },
  passwordToggle: {
    position: 'absolute',
    right: 9,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    border: '1px solid rgba(246, 208, 93, 0.34)',
    color: '#f8d66d',
    background: 'rgba(246, 208, 93, 0.13)',
    cursor: 'pointer',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
  },
  error: {
    margin: 0,
    color: '#b42318',
    fontSize: 12,
    fontWeight: 800,
  },
  errorPanel: {
    margin: 0,
    padding: '10px 12px',
    color: '#ffd9d9',
    background: 'rgba(180, 35, 24, 0.22)',
    border: '1px solid rgba(255, 129, 99, 0.38)',
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 900,
  },
  submit: {
    minHeight: 52,
    marginTop: 8,
    borderRadius: 18,
    border: '1px solid rgba(255, 255, 255, 0.16)',
    background: 'linear-gradient(135deg, #f4c84e, #d99311 52%, #1c8f54)',
    color: '#061326',
    fontSize: 15,
    fontWeight: 1000,
    fontFamily: 'inherit',
    letterSpacing: 1.5,
    cursor: 'pointer',
    boxShadow: '0 18px 34px rgba(0, 0, 0, 0.28)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease',
  },
  backdropGlow: {
    position: 'absolute',
    zIndex: 0,
    width: 620,
    height: 620,
    left: -180,
    top: -190,
    background:
      'linear-gradient(115deg, rgba(255,255,255,0.42), rgba(255,255,255,0.04) 45%, transparent 70%)',
    clipPath: 'polygon(0 0, 78% 0, 56% 100%, 0 100%)',
    filter: 'blur(1px)',
    pointerEvents: 'none',
  },
  backdropBlue: {
    position: 'absolute',
    zIndex: 0,
    width: 380,
    height: 380,
    right: -120,
    bottom: -130,
    background:
      'linear-gradient(35deg, rgba(28, 143, 84, 0.46), rgba(28, 143, 84, 0.12) 48%, transparent 72%)',
    transform: 'skewX(-16deg)',
    filter: 'blur(1px)',
    pointerEvents: 'none',
  },
  backdropBand: {
    position: 'absolute',
    zIndex: 0,
    left: '8%',
    right: '10%',
    bottom: '12%',
    height: 132,
    background:
      'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 82px), linear-gradient(180deg, transparent, rgba(21, 130, 72, 0.24))',
    transform: 'perspective(360px) rotateX(62deg)',
    transformOrigin: 'bottom center',
    pointerEvents: 'none',
  },
}
