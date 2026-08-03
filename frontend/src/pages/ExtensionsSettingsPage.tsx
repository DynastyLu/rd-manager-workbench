import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Switch,
  TabPane,
  Tabs,
  Tag,
} from '@douyinfe/semi-ui'
import { IconHistory, IconPlus, IconRefresh } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import {
  archiveExtensionProfile,
  completeExtensionRun,
  createExtensionProfile,
  listExtensionProfiles,
  listExtensionRuns,
  prepareExtensionRun,
  startExtensionRun,
  updateExtensionProfile,
  type ExtensionKind,
  type ExtensionOperation,
  type ExtensionProfile,
  type ExtensionProvider,
  type PreparedExtensionRun,
} from '@/modules/workbench/api/extensions'
import { SmsRecipientManager } from '@/modules/workbench/components/extensions/SmsRecipientManager'

import './ExtensionsSettingsPage.less'

const LOCAL_PROVIDERS = new Set<ExtensionProvider>(['LOCAL_PREVIEW', 'LOCAL_MANUAL'])

const KIND_COPY: Record<ExtensionKind, { tab: string; eyebrow: string; title: string; description: string }> = {
  SMS: { tab: '短信通知', eyebrow: 'IMPORTANT REMINDERS', title: '短信通知', description: '只为明确标记为重要的提醒发送短信；页面和桌面通知不等待短信。' },
  AI: { tab: 'AI 助手', eyebrow: 'USER-CONSENTED AI', title: 'AI 助手', description: '摘要与知识问答每次都先展示将离开本机的数据范围，结果默认只作为建议。' },
  CALENDAR: { tab: '外部日历', eyebrow: 'CALDAV SYNC', title: '外部日历', description: '默认只拉取普通日程；双向同步需要再次确认并先处理冲突。' },
  CLOUD_DRIVE: { tab: '云盘', eyebrow: 'WEBDAV TRANSFER', title: 'WebDAV 云盘', description: '只上传明确选择的附件、导出或备份，不做全盘自动镜像。' },
}

const PROVIDERS: Record<ExtensionKind, Array<{ value: ExtensionProvider; label: string }>> = {
  SMS: [{ value: 'LOCAL_PREVIEW', label: '本地预览（不发送）' }, { value: 'ALIYUN_SMS', label: '阿里云短信' }],
  AI: [{ value: 'LOCAL_MANUAL', label: '本地手动模式' }, { value: 'OPENAI_RESPONSES', label: 'OpenAI Responses API' }],
  CALENDAR: [{ value: 'CALDAV', label: 'CalDAV' }],
  CLOUD_DRIVE: [{ value: 'WEBDAV', label: 'WebDAV' }],
}

const PERMISSIONS: Record<ExtensionProvider, ExtensionOperation[]> = {
  LOCAL_PREVIEW: ['TEST_CONNECTION', 'SMS_PREVIEW'],
  ALIYUN_SMS: ['TEST_CONNECTION', 'SMS_SEND'],
  LOCAL_MANUAL: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
  OPENAI_RESPONSES: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
  CALDAV: ['TEST_CONNECTION', 'CALENDAR_SYNC_PREFLIGHT', 'CALENDAR_SYNC_COMMIT'],
  WEBDAV: ['TEST_CONNECTION', 'CLOUD_UPLOAD_PREFLIGHT', 'CLOUD_UPLOAD_COMMIT', 'CLOUD_DOWNLOAD_PREFLIGHT', 'CLOUD_DOWNLOAD_COMMIT'],
}

interface EditorDraft {
  kind: ExtensionKind
  provider: ExtensionProvider
  name: string
  enabled: boolean
  model: string
  baseUrl: string
  path: string
  signName: string
  regionId: string
  username: string
  password: string
  apiKey: string
  accessKeyId: string
  accessKeySecret: string
}

interface PendingTest {
  profile: ExtensionProfile
  prepared: PreparedExtensionRun
}

function defaultDraft(kind: ExtensionKind): EditorDraft {
  const provider = PROVIDERS[kind][0]!.value
  return {
    kind,
    provider,
    name: PROVIDERS[kind][0]!.label,
    enabled: false,
    model: 'gpt-5-mini',
    baseUrl: '',
    path: kind === 'CLOUD_DRIVE' ? '/rd-workbench' : '/',
    signName: '',
    regionId: 'cn-hangzhou',
    username: '',
    password: '',
    apiKey: '',
    accessKeyId: '',
    accessKeySecret: '',
  }
}

function publicConfig(draft: EditorDraft): Record<string, unknown> {
  switch (draft.provider) {
    case 'LOCAL_PREVIEW': return { templateMapping: {}, costEstimateCny: 0 }
    case 'ALIYUN_SMS': return { regionId: draft.regionId, signName: draft.signName, templateMapping: {} }
    case 'LOCAL_MANUAL': return { model: 'manual' }
    case 'OPENAI_RESPONSES': return { model: draft.model }
    case 'CALDAV': return { baseUrl: draft.baseUrl, calendarPath: draft.path, syncDirection: 'PULL_ONLY' }
    case 'WEBDAV': return { baseUrl: draft.baseUrl, remoteRoot: draft.path }
  }
}

function credentialValue(draft: EditorDraft): Record<string, unknown> | null {
  switch (draft.provider) {
    case 'ALIYUN_SMS': return draft.accessKeyId && draft.accessKeySecret ? { accessKeyId: draft.accessKeyId, accessKeySecret: draft.accessKeySecret } : null
    case 'OPENAI_RESPONSES': return draft.apiKey ? { apiKey: draft.apiKey } : null
    case 'CALDAV':
    case 'WEBDAV': return draft.username && draft.password ? { username: draft.username, password: draft.password } : null
    default: return null
  }
}

function statusTag(profile: ExtensionProfile, credentialAvailable: boolean) {
  if (!profile.enabled) return <Tag color="grey">未启用</Tag>
  if (!LOCAL_PROVIDERS.has(profile.provider) && !credentialAvailable) return <Tag color="red">凭据不可用</Tag>
  return <Tag color="green">运行中</Tag>
}

export default function ExtensionsSettingsPage() {
  const client = useQueryClient()
  const [kind, setKind] = useState<ExtensionKind>('SMS')
  const [editor, setEditor] = useState<EditorDraft | null>(null)
  const [historyProfile, setHistoryProfile] = useState<ExtensionProfile | null>(null)
  const [pendingTest, setPendingTest] = useState<PendingTest | null>(null)
  const [testing, setTesting] = useState(false)
  const desktopCredentials = window.rdWorkbenchDesktop?.credentials
  const profilesQuery = useQuery({ queryKey: ['extensions', 'profiles'], queryFn: () => listExtensionProfiles() })
  const runsQuery = useQuery({ queryKey: ['extensions', 'runs'], queryFn: () => listExtensionRuns() })
  const storeQuery = useQuery({
    queryKey: ['extensions', 'credential-store'],
    queryFn: () => desktopCredentials?.isAvailable() ?? Promise.resolve(false),
  })
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data])
  const activeProfiles = profiles.filter((profile) => profile.kind === kind)
  const runs = (runsQuery.data ?? []).filter((run) => !historyProfile || run.profileId === historyProfile.id)

  const credentialAvailability = useQuery<Record<string, boolean>>({
    queryKey: ['extensions', 'credential-availability', profiles.map((profile) => profile.id).join(',')],
    enabled: Boolean(desktopCredentials && storeQuery.data),
    queryFn: async () => {
      const credentials = desktopCredentials
      if (!credentials) return {}
      const entries = await Promise.all(profiles.map(async (profile): Promise<[string, boolean]> => [
        profile.id,
        !profile.credentialRef || LOCAL_PROVIDERS.has(profile.provider)
          ? true
          : await credentials.has(profile.credentialRef),
      ]))
      return Object.fromEntries(entries) as Record<string, boolean>
    },
  })

  const saveProfile = useMutation({
    mutationFn: async (draft: EditorDraft) => {
      const local = LOCAL_PROVIDERS.has(draft.provider)
      const secret = credentialValue(draft)
      const credentials = desktopCredentials
      if (!local && (!storeQuery.data || !credentials)) throw new Error('CREDENTIAL_STORE_UNAVAILABLE')
      if (!local && !secret) throw new Error('CREDENTIAL_NOT_FOUND')
      const credentialRef = local ? undefined : `credential:${draft.kind.toLowerCase()}:${crypto.randomUUID()}`
      const created = await createExtensionProfile({
        kind: draft.kind,
        provider: draft.provider,
        name: draft.name,
        enabled: local ? draft.enabled : false,
        publicConfig: publicConfig(draft),
        credentialRef,
        permissions: PERMISSIONS[draft.provider],
      })
      if (!local && credentialRef && secret) {
        try {
          await credentials!.put(credentialRef, secret)
          if (draft.enabled) return await updateExtensionProfile(created.id, { enabled: true })
        } catch (error) {
          await credentials!.delete(credentialRef).catch(() => undefined)
          await archiveExtensionProfile(created.id).catch(() => undefined)
          throw error
        }
      }
      return created
    },
    onSuccess: async () => {
      setEditor(null)
      toast.success('外部服务配置已保存')
      await client.invalidateQueries({ queryKey: ['extensions'] })
    },
    onError: (error) => toast.error(error instanceof Error && error.message === 'CREDENTIAL_STORE_UNAVAILABLE' ? '当前环境不能安全保存凭据，请使用 Electron 桌面端。' : '配置保存失败，请检查必填项。'),
  })

  const toggleProfile = useMutation({
    mutationFn: ({ profile, enabled }: { profile: ExtensionProfile; enabled: boolean }) => updateExtensionProfile(profile.id, { enabled }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['extensions', 'profiles'] }),
    onError: () => toast.error('服务状态更新失败，请检查凭据和配置。'),
  })
  const archiveProfile = useMutation({
    mutationFn: async (profile: ExtensionProfile) => {
      if (!LOCAL_PROVIDERS.has(profile.provider)) {
        await updateExtensionProfile(profile.id, { enabled: false })
        if (!desktopCredentials || !profile.credentialRef) throw new Error('CREDENTIAL_STORE_UNAVAILABLE')
        await desktopCredentials.delete(profile.credentialRef)
      }
      await archiveExtensionProfile(profile.id)
    },
    onSuccess: async () => client.invalidateQueries({ queryKey: ['extensions'] }),
    onError: () => toast.error('归档失败；外部服务已停用，凭据未被静默遗留。'),
  })

  const beginConnectionTest = async (profile: ExtensionProfile) => {
    if (!LOCAL_PROVIDERS.has(profile.provider) && (!storeQuery.data || !credentialAvailability.data?.[profile.id])) {
      toast.error('安全凭据不可用，无法发起真实连接测试。')
      return
    }
    try {
      const prepared = await prepareExtensionRun(profile.id, { operation: 'TEST_CONNECTION', payload: {} })
      setPendingTest({ profile, prepared })
    } catch {
      toast.error('连接测试预检失败，请确认服务已启用并允许 TEST_CONNECTION。')
    }
  }

  const executeConnectionTest = async () => {
    if (!pendingTest) return
    setTesting(true)
    const { profile, prepared } = pendingTest
    try {
      const started = await startExtensionRun(profile.id, {
        operation: 'TEST_CONNECTION',
        payload: {},
        confirmationHash: prepared.confirmationHash,
      })
      if (started.status === 'REJECTED') {
        toast.info('本地预览不会真实外呼，也不会标记为发送成功。')
      } else {
        const extensions = window.rdWorkbenchDesktop?.extensions
        if (!extensions || !started.completionToken) throw new Error('CREDENTIAL_STORE_UNAVAILABLE')
        const result = await extensions.execute({
          runId: started.id,
          profile,
          operation: 'TEST_CONNECTION',
          payload: {},
        })
        await completeExtensionRun(started.id, {
          completionToken: started.completionToken,
          status: result.status,
          output: result.output,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          metadata: result.metadata,
        })
        if (result.status === 'SUCCEEDED') toast.success('连接测试成功')
        else toast.error(`连接测试未通过${result.errorCode ? `：${result.errorCode}` : ''}`)
      }
      setPendingTest(null)
      await client.invalidateQueries({ queryKey: ['extensions', 'runs'] })
    } catch {
      toast.error('连接测试失败；没有修改任何本地业务对象。')
    } finally {
      setTesting(false)
    }
  }

  const copy = KIND_COPY[kind]
  const enabledCount = useMemo(() => profiles.filter((profile) => profile.enabled).length, [profiles])

  return (
    <div className="extensions-page workspace-page">
      <div className="workspace-page__inner">
        <div className="workspace-module-toolbar">
          <div className="extensions-page__hero-status workspace-module-toolbar__actions">
            <Tag color="blue">{enabledCount} 个服务已启用</Tag>
            <Tag color={storeQuery.data ? 'green' : 'grey'}>{storeQuery.data ? '凭据保险箱可用' : '仅本地模式'}</Tag>
          </div>
        </div>

        {!storeQuery.data ? (
          <Banner
            className="extensions-page__fallback"
            type="warning"
            fullMode={false}
            closeIcon={null}
            title="浏览器模式不能安全保存或使用外部服务凭据"
            description="短信本地预览与本地手动 AI 仍可配置；真实短信、AI、CalDAV 和 WebDAV 请在 Electron 桌面端使用。"
          />
        ) : null}

        <Tabs type="line" activeKey={kind} onChange={(value) => setKind(value as ExtensionKind)} className="extensions-page__tabs">
          {(Object.keys(KIND_COPY) as ExtensionKind[]).map((item) => <TabPane key={item} itemKey={item} tab={KIND_COPY[item].tab} />)}
        </Tabs>

        <section className="extensions-workspace workspace-card">
          <header className="extensions-workspace__header">
            <div><p>{copy.eyebrow}</p><h2>{copy.title}</h2><span>{copy.description}</span></div>
            <Button theme="solid" type="primary" icon={<IconPlus />} onClick={() => setEditor(defaultDraft(kind))}>添加服务</Button>
          </header>

          <Banner
            type="warning"
            fullMode={false}
            closeIcon={null}
            title="连接测试会真实外呼"
            description="除“本地预览/本地手动”外，点击测试后会先展示目标服务商和数据范围；只有再次确认才发起网络请求，可能产生费用。"
          />

          {profilesQuery.isError ? <Banner type="danger" fullMode={false} closeIcon={null} title="无法读取外部服务配置" description="请确认本地服务已启动。" /> : null}
          <div className="extension-profile-grid">
            {activeProfiles.map((profile) => {
              const credentialAvailable = LOCAL_PROVIDERS.has(profile.provider) || Boolean(credentialAvailability.data?.[profile.id])
              return (
                <article key={profile.id} className="extension-profile-card">
                  <div className="extension-profile-card__top">
                    <div className={`extension-profile-card__mark extension-profile-card__mark--${profile.kind.toLowerCase()}`}>{profile.kind === 'CLOUD_DRIVE' ? 'DRIVE' : profile.kind}</div>
                    <div className="extension-profile-card__tags">{statusTag(profile, credentialAvailable)}<Tag>{profile.provider}</Tag></div>
                  </div>
                  <h3>{profile.name}</h3>
                  <p>{LOCAL_PROVIDERS.has(profile.provider) ? '数据不离开本机，不会伪造真实发送或 AI 执行结果。' : `凭据：${credentialAvailable ? '已在本机保险箱中确认' : '本机不可用'}`}</p>
                  <dl>
                    <div><dt>权限</dt><dd>{profile.permissions.length} 项</dd></div>
                    <div><dt>更新</dt><dd>{new Date(profile.updatedAt).toLocaleDateString('zh-CN')}</dd></div>
                  </dl>
                  <div className="extension-profile-card__actions">
                    <Button
                      icon={<IconRefresh />}
                      disabled={!profile.enabled || (!LOCAL_PROVIDERS.has(profile.provider) && !credentialAvailable)}
                      onClick={() => { void beginConnectionTest(profile) }}
                      aria-label={`测试 ${profile.name} 连接`}
                    >测试连接</Button>
                    <Button icon={<IconHistory />} aria-label="查看运行历史" onClick={() => setHistoryProfile(profile)}>查看运行历史</Button>
                    <Switch aria-label={`${profile.name} 启用状态`} checked={profile.enabled} loading={toggleProfile.isPending} onChange={(enabled) => toggleProfile.mutate({ profile, enabled })} />
                    <Button type="danger" onClick={() => archiveProfile.mutate(profile)}>停用并归档</Button>
                  </div>
                </article>
              )
            })}
          </div>
          {!profilesQuery.isLoading && activeProfiles.length === 0 ? <Empty title={`尚未配置${copy.title}`} description="添加后默认保持关闭；凭据保存完成才能启用真实服务。" /> : null}
          {kind === 'SMS' ? <SmsRecipientManager /> : null}
        </section>
      </div>

      <ProfileEditor
        draft={editor}
        credentialStoreAvailable={Boolean(storeQuery.data)}
        saving={saveProfile.isPending}
        onChange={setEditor}
        onCancel={() => setEditor(null)}
        onSave={() => { if (editor) saveProfile.mutate(editor) }}
      />

      <Modal
        visible={Boolean(pendingTest)}
        title="确认真实外呼"
        onCancel={() => setPendingTest(null)}
        footer={<><Button onClick={() => setPendingTest(null)}>取消</Button><Button theme="solid" type="primary" loading={testing} onClick={() => { void executeConnectionTest() }}>确认并测试</Button></>}
      >
        <Banner
          type="warning"
          fullMode={false}
          closeIcon={null}
          title={pendingTest?.prepared.dataLeavesDevice ? '测试会真实外呼' : '本地能力测试'}
          description={pendingTest?.prepared.dataLeavesDevice ? `将连接 ${pendingTest.profile.provider}；请求可能产生流量或服务商费用。本次只发送连接测试所需的最小配置，不发送项目、文档或会议正文。` : '本次不会发送网络请求；本地预览不会伪造成发送成功。'}
        />
      </Modal>

      <Modal visible={Boolean(historyProfile)} title="运行历史" onCancel={() => setHistoryProfile(null)} footer={null} width={840}>
        {historyProfile ? <strong className="extension-run-profile">{historyProfile.name}</strong> : null}
        <p className="extension-run-note">运行日志不保存短信正文、手机号或 AI 输入输出正文，只保留哈希、字节数、状态和允许列出的服务商元数据。</p>
        <div className="extension-run-table-wrap">
          <table aria-label="运行历史">
            <thead><tr><th>时间</th><th>操作</th><th>状态</th><th>输入</th><th>失败原因</th><th>安全元数据</th></tr></thead>
            <tbody>
              {runs.map((run) => {
                const safeMetadata = Object.fromEntries(Object.entries(run.metadata ?? {}).filter(([key]) => ['providerMessageId', 'costEstimateCny', 'retryable', 'remoteVersion'].includes(key)))
                return <tr key={run.id}><td>{new Date(run.createdAt).toLocaleString('zh-CN')}</td><td>{run.operation}</td><td><Tag color={run.status === 'SUCCEEDED' ? 'green' : run.status === 'FAILED' ? 'red' : 'grey'}>{run.status}</Tag></td><td>{run.inputBytes} B</td><td>{run.errorCode ?? '—'}</td><td>{Object.keys(safeMetadata).length ? JSON.stringify(safeMetadata) : '—'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  )
}

function ProfileEditor({
  draft,
  credentialStoreAvailable,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: EditorDraft | null
  credentialStoreAvailable: boolean
  saving: boolean
  onChange: (value: EditorDraft | null) => void
  onCancel: () => void
  onSave: () => void
}) {
  if (!draft) return null
  const local = LOCAL_PROVIDERS.has(draft.provider)
  const change = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => onChange({ ...draft, [key]: value })
  return (
    <Modal visible title={`添加${KIND_COPY[draft.kind].title}服务`} onCancel={onCancel} footer={<><Button onClick={onCancel}>取消</Button><Button theme="solid" type="primary" loading={saving} onClick={onSave}>保存配置</Button></>} width={620}>
      <div className="extension-profile-form">
        <div className="extension-profile-form__field"><span>服务名称</span><Input aria-label="服务名称" value={draft.name} onChange={(value) => change('name', value)} /></div>
        <div className="extension-profile-form__field"><span>服务商</span><Select aria-label="服务商" value={draft.provider} optionList={PROVIDERS[draft.kind]} onChange={(value) => { const provider = value as ExtensionProvider; onChange({ ...draft, provider, name: PROVIDERS[draft.kind].find((item) => item.value === provider)?.label ?? draft.name }) }} /></div>
        {draft.provider === 'ALIYUN_SMS' ? <>
          <div className="extension-profile-form__field"><span>区域</span><Input aria-label="区域" value={draft.regionId} onChange={(value) => change('regionId', value)} /></div>
          <div className="extension-profile-form__field"><span>短信签名</span><Input aria-label="短信签名" value={draft.signName} onChange={(value) => change('signName', value)} /></div>
          <div className="extension-profile-form__field"><span>AccessKey ID</span><Input aria-label="AccessKey ID" value={draft.accessKeyId} onChange={(value) => change('accessKeyId', value)} /></div>
          <div className="extension-profile-form__field"><span>AccessKey Secret</span><Input aria-label="AccessKey Secret" mode="password" value={draft.accessKeySecret} onChange={(value) => change('accessKeySecret', value)} /></div>
        </> : null}
        {draft.provider === 'OPENAI_RESPONSES' ? <>
          <div className="extension-profile-form__field"><span>模型</span><Input aria-label="模型" value={draft.model} onChange={(value) => change('model', value)} /></div>
          <div className="extension-profile-form__field"><span>API Key</span><Input aria-label="API Key" mode="password" value={draft.apiKey} onChange={(value) => change('apiKey', value)} /></div>
        </> : null}
        {draft.provider === 'CALDAV' || draft.provider === 'WEBDAV' ? <>
          <div className="extension-profile-form__field"><span>服务地址</span><Input aria-label="服务地址" value={draft.baseUrl} placeholder="https://…" onChange={(value) => change('baseUrl', value)} /></div>
          <div className="extension-profile-form__field"><span>{draft.provider === 'CALDAV' ? '日历路径' : '远端根目录'}</span><Input aria-label={draft.provider === 'CALDAV' ? '日历路径' : '远端根目录'} value={draft.path} onChange={(value) => change('path', value)} /></div>
          <div className="extension-profile-form__field"><span>用户名</span><Input aria-label="用户名" value={draft.username} onChange={(value) => change('username', value)} /></div>
          <div className="extension-profile-form__field"><span>密码 / App Password</span><Input aria-label="密码 / App Password" mode="password" value={draft.password} onChange={(value) => change('password', value)} /></div>
        </> : null}
        {!local && !credentialStoreAvailable ? <Banner type="warning" fullMode={false} closeIcon={null} title="请在 Electron 桌面端保存凭据" description="页面不会把密钥写入 PostgreSQL、localStorage 或日志。" /> : null}
        <div className="extension-profile-form__switch"><div><strong>保存后启用</strong><small>{local ? '本地能力不会产生外部费用。' : '启用后仍需逐次确认外部调用。'}</small></div><Switch checked={draft.enabled} disabled={!local && !credentialStoreAvailable} onChange={(value) => change('enabled', value)} /></div>
      </div>
    </Modal>
  )
}
