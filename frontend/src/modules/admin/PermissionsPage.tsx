import { Suspense } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Banner, Spin, Table, Tag } from '@douyinfe/semi-ui'
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table/interface'
import { tableScrollWidth } from '@/lib/tableScrollWidth'
import { listPermissions } from './api'
import type { PermissionCatalogEntry } from './types'
import './AdminPages.less'

const ACTION_LABELS: Record<string, string> = {
  read: '查看',
  create: '新建',
  update: '编辑',
  delete: '删除',
  disable: '停用',
  manage: '管理',
  assign: '分配',
  publish: '发布',
  export: '导出',
}

function PermissionsContent() {
  const permissionsQuery = useSuspenseQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: listPermissions,
  })

  const columns: ColumnProps<PermissionCatalogEntry>[] = [
    {
      title: '权限编码',
      dataIndex: 'code',
      width: 160,
    },
    {
      title: '模块',
      dataIndex: 'module',
      width: 100,
    },
    {
      title: '资源',
      dataIndex: 'resource',
      width: 100,
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 100,
      render: (value: string) => ACTION_LABELS[value] ?? value,
    },
    {
      title: '说明',
      dataIndex: 'description',
      width: 300,
    },
    {
      title: '敏感',
      dataIndex: 'isSensitive',
      width: 100,
      render: (value: boolean) =>
        value ? (
          <Tag color="red" type="light">
            敏感权限
          </Tag>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <>
      <h2 className="admin-page__heading" aria-level={1}>
        权限目录
      </h2>

      <Table
        className="admin-permissions__table"
        columns={columns}
        dataSource={permissionsQuery.data ?? []}
        loading={permissionsQuery.isLoading}
        pagination={false}
        scroll={{ x: tableScrollWidth(columns) }}
        rowKey="id"
      />
    </>
  )
}

export default function PermissionsPage() {
  return (
    <section className="admin-page admin-permissions">
      <Banner
        type="info"
        description="权限编码由系统维护，不允许在此创建或删除"
        className="admin-page__banner"
      />

      <Suspense fallback={<Spin />}>
        <PermissionsContent />
      </Suspense>
    </section>
  )
}
