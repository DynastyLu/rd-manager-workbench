import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Banner, Button, Card, Modal, Skeleton, Table, Tag } from '@douyinfe/semi-ui'
import { IconDesktop, IconExit, IconLock } from '@douyinfe/semi-icons'
import { toast } from 'sonner'

import { listSessions, revokeAllSessions, revokeSession } from '@/modules/auth/api'
import type { AuthSession } from '@/modules/auth/types'
import { useAuthStore } from '@/modules/auth/store'
import './LoginPage.less'

function sessionName(session: AuthSession): string {
  return session.deviceName || session.userAgent || '未知设备'
}

export default function PersonalSecurityPage() {
  const queryClient = useQueryClient()
  const [revokingSessionId, setRevokingSessionId] = useState<string>()
  const currentUser = useAuthStore((state) => state.user)
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: listSessions,
  })
  const exitSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId)
    try {
      await revokeSession(sessionId)
      toast.success('设备已退出')
      queryClient.setQueryData<AuthSession[]>(['auth', 'sessions'], (current) =>
        current?.filter((session) => session.id !== sessionId)
      )
    } finally {
      setRevokingSessionId(undefined)
    }
  }
  const revokeEverywhere = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: () => {
      useAuthStore.getState().clearSession()
    },
  })

  const confirmRevokeAll = () => {
    Modal.confirm({
      title: '退出全部设备？',
      content: '所有已登录设备都需要重新输入账号和密码。',
      okText: '退出全部设备',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => revokeEverywhere.mutateAsync(),
    })
  }

  return (
    <div className="security-page workspace-page">
      <div className="security-page__inner workspace-page__inner workspace-page__inner--narrow">
      <div className="security-page__grid">
        <Card className="security-page__identity">
          <div className="security-page__avatar">{currentUser?.displayName.slice(0, 1)}</div>
          <div>
            <h2>{currentUser?.displayName}</h2>
            <p>{currentUser?.username}{currentUser?.employeeNo ? ` · ${currentUser.employeeNo}` : ''}</p>
            <Tag color="blue">{currentUser?.roleTitle || currentUser?.roleCodes[0]}</Tag>
          </div>
          <IconLock className="security-page__identity-icon" />
        </Card>
        <Card className="security-page__sessions">
          <div className="security-page__sessions-header">
            <h2>登录设备</h2>
            <Button
              type="danger"
              icon={<IconExit />}
              aria-label="退出全部设备"
              loading={revokeEverywhere.isPending}
              onClick={confirmRevokeAll}
            >
              退出全部设备
            </Button>
          </div>
          {sessions.isLoading ? (
            <Skeleton active placeholder={<Skeleton.Paragraph rows={4} />} />
          ) : sessions.isError ? (
            <Banner type="danger" description="登录设备读取失败，请稍后重试。" />
          ) : (
            <Table<AuthSession>
              pagination={false}
              dataSource={sessions.data ?? []}
              rowKey="id"
              columns={[
                {
                  title: '设备',
                  render: (_text, session) => (
                    <div className="security-page__device">
                      <span><IconDesktop /></span>
                      <div><strong>{sessionName(session)}</strong><small>{session.userAgent}</small></div>
                    </div>
                  ),
                },
                { title: 'IP 地址', dataIndex: 'ipAddress' },
                {
                  title: '最近活动',
                  render: (_text, session) => new Date(session.lastUsedAt).toLocaleString('zh-CN'),
                },
                {
                  title: '操作',
                  width: 160,
                  render: (_text, session) => (
                    <Button
                      type="danger"
                      theme="borderless"
                      disabled={revokingSessionId === session.id}
                      aria-label={`退出设备：${sessionName(session)}`}
                      onClick={() => void exitSession(session.id)}
                    >
                      {revokingSessionId === session.id ? '正在退出…' : '退出此设备'}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>
      </div>
    </div>
  )
}
