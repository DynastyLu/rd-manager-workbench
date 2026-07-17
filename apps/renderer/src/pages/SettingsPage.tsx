import { useQuery } from '@tanstack/react-query'
import DatabaseIcon from 'lucide-react/dist/esm/icons/database.js'
import RefreshCwIcon from 'lucide-react/dist/esm/icons/refresh-cw.js'
import ServerCogIcon from 'lucide-react/dist/esm/icons/server-cog.js'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createApiClient } from '@/lib/api-client'
import { getRuntimeConfig } from '@/lib/runtime'

const PLATFORM_LABELS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

async function loadDiagnostics() {
  const runtime = await getRuntimeConfig()
  const readiness = await createApiClient(runtime).getReadiness()

  return {
    apiBaseUrl: runtime.apiBaseUrl,
    appVersion: runtime.appVersion,
    platform: runtime.platform,
    readiness,
  }
}

export function SettingsPage() {
  const diagnostics = useQuery({
    queryKey: ['desktop-diagnostics'],
    queryFn: loadDiagnostics,
    staleTime: 10_000,
  })

  return (
    <div className="page-stack">
      <section className="page-intro page-intro--compact">
        <div>
          <p className="archive-kicker">SYSTEM / 008</p>
          <h1>系统诊断</h1>
          <p>核对 Electron 注入的本地运行配置，以及后端与 PostgreSQL 就绪状态。</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void diagnostics.refetch()}
          disabled={diagnostics.isFetching}
        >
          <RefreshCwIcon data-icon="inline-start" />
          重新检查
        </Button>
      </section>

      {diagnostics.isPending ? (
        <Card>
          <CardHeader>
            <CardTitle>正在读取本地运行状态</CardTitle>
            <CardDescription>等待桌面外壳提供受控运行时配置。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="diagnostic-pulse" role="status">
              <span aria-hidden="true" />
              正在检查后端与数据库连接
            </div>
          </CardContent>
        </Card>
      ) : null}

      {diagnostics.isError ? (
        <Card>
          <CardHeader>
            <CardAction>
              <Badge variant="destructive">未就绪</Badge>
            </CardAction>
            <CardTitle>本地服务尚未就绪</CardTitle>
            <CardDescription>
              无法完成安全诊断。请确认桌面后端已启动，并在稍后重新检查。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="safe-error-note">诊断页不会显示令牌、数据库连接串或后端原始错误。</p>
          </CardContent>
        </Card>
      ) : null}

      {diagnostics.isSuccess ? (
        <>
          <section className="diagnostic-grid" aria-label="服务就绪状态">
            <Card size="sm">
              <CardHeader>
                <div className="module-icon" aria-hidden="true">
                  <ServerCogIcon />
                </div>
                <CardAction>
                  <Badge>就绪</Badge>
                </CardAction>
                <CardTitle>后端服务运行正常</CardTitle>
                <CardDescription>随机高位端口上的本地 API 已通过鉴权检查。</CardDescription>
              </CardHeader>
            </Card>
            <Card size="sm">
              <CardHeader>
                <div className="module-icon" aria-hidden="true">
                  <DatabaseIcon />
                </div>
                <CardAction>
                  <Badge>就绪</Badge>
                </CardAction>
                <CardTitle>数据库连接正常</CardTitle>
                <CardDescription>PostgreSQL 已响应后端的只读就绪探针。</CardDescription>
              </CardHeader>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>运行时摘要</CardTitle>
              <CardDescription>仅展示非敏感诊断信息；会话令牌不会进入界面。</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="runtime-summary">
                <div>
                  <dt>API 地址</dt>
                  <dd>
                    <code>{diagnostics.data.apiBaseUrl}</code>
                  </dd>
                </div>
                <div>
                  <dt>应用版本</dt>
                  <dd>{diagnostics.data.appVersion}</dd>
                </div>
                <div>
                  <dt>运行平台</dt>
                  <dd>
                    {PLATFORM_LABELS[diagnostics.data.platform] ?? diagnostics.data.platform}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
