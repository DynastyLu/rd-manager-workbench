import { useId, useMemo, useState } from 'react'
import { Checkbox, Select } from '@douyinfe/semi-ui'
import type { DataScope } from '@/modules/auth/types'
import type { PermissionCatalogEntry, PermissionGrantInput } from './types'

interface RolePermissionMatrixProps {
  permissions: PermissionCatalogEntry[]
  value: Array<{
    code: string
    dataScope: DataScope
    scopeConfig?: Record<string, unknown> | null
  }>
  departments?: string[]
  projects?: Array<{ id: string; name: string }>
  onChange: (grants: PermissionGrantInput[]) => void
}

const DATA_SCOPE_OPTIONS: Array<{ value: DataScope; label: string }> = [
  { value: 'SELF', label: '仅本人' },
  { value: 'INVOLVED', label: '参与相关' },
  { value: 'DEPARTMENT', label: '指定部门' },
  { value: 'PROJECT', label: '指定项目' },
  { value: 'ALL', label: '全部' },
]

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

function LabeledSelect({
  label,
  ...props
}: React.ComponentProps<typeof Select> & { label: string }) {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const selectId = `${baseId}-select`
  return (
    <>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <Select id={selectId} aria-labelledby={labelId} {...props} />
    </>
  )
}

function normalizeScopeConfig(
  scope: DataScope,
  config: Record<string, unknown> | undefined,
  departments: string[],
  projects: Array<{ id: string; name: string }>
): Record<string, unknown> | null {
  if (scope === 'DEPARTMENT') {
    const names = Array.isArray(config?.departmentNames)
      ? (config.departmentNames as string[])
      : departments.length
        ? [departments[0]]
        : []
    return { departmentNames: names }
  }
  if (scope === 'PROJECT') {
    const ids = Array.isArray(config?.projectIds)
      ? (config.projectIds as string[])
      : projects.length && projects[0]
        ? [projects[0].id]
        : []
    return { projectIds: ids }
  }
  return null
}

export default function RolePermissionMatrix({
  permissions,
  value,
  departments = [],
  projects = [],
  onChange,
}: RolePermissionMatrixProps) {
  const [draft, setDraft] = useState<Record<string, PermissionGrantInput>>(() => {
    const map: Record<string, PermissionGrantInput> = {}
    for (const grant of value) {
      map[grant.code] = {
        permissionCode: grant.code,
        dataScope: grant.dataScope,
        scopeConfig: grant.scopeConfig ?? null,
      }
    }
    return map
  })

  const resources = useMemo(() => {
    const map = new Map<string, PermissionCatalogEntry[]>()
    for (const permission of permissions) {
      const list = map.get(permission.resource) ?? []
      list.push(permission)
      map.set(permission.resource, list)
    }
    return Array.from(map.entries()).map(([resource, items]) => ({
      resource,
      label: items[0]?.module ? `${items[0].module}.${resource}` : resource,
      permissions: items,
    }))
  }, [permissions])

  const actions = useMemo(() => {
    const set = new Set<string>()
    for (const permission of permissions) {
      set.add(permission.action)
    }
    return Array.from(set).sort()
  }, [permissions])

  const actionColumns = useMemo(
    () =>
      actions.map((action) => ({
        action,
        label: ACTION_LABELS[action] ?? action,
      })),
    [actions]
  )

  function updateGrant(code: string, grant: PermissionGrantInput | undefined) {
    setDraft((prev) => {
      const next = { ...prev }
      if (grant) {
        next[code] = grant
      } else {
        delete next[code]
      }
      onChange(Object.values(next))
      return next
    })
  }

  function togglePermission(permission: PermissionCatalogEntry, checked: boolean) {
    if (checked) {
      const existing = draft[permission.code]
      updateGrant(permission.code, {
        permissionCode: permission.code,
        dataScope: existing?.dataScope ?? 'ALL',
        scopeConfig: existing?.scopeConfig ?? null,
      })
    } else {
      updateGrant(permission.code, undefined)
    }
  }

  function setDataScope(permission: PermissionCatalogEntry, scope: DataScope) {
    const existing = draft[permission.code]
    const scopeConfig = normalizeScopeConfig(scope, existing?.scopeConfig ?? undefined, departments, projects)
    updateGrant(permission.code, {
      permissionCode: permission.code,
      dataScope: scope,
      scopeConfig,
    })
  }

  function setScopeConfig(
    permission: PermissionCatalogEntry,
    config: Record<string, unknown>
  ) {
    const existing = draft[permission.code]
    if (!existing) return
    updateGrant(permission.code, {
      ...existing,
      scopeConfig: config,
    })
  }

  return (
    <div className="role-permission-matrix">
      <div className="role-permission-matrix__scroll">
        <table className="role-permission-matrix__table">
          <thead>
            <tr>
              <th scope="col">权限</th>
              {actionColumns.map((column) => (
                <th key={column.action} scope="col" role="columnheader">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map(({ resource, label, permissions: resourcePermissions }) => (
              <tr key={resource}>
                <th scope="row" className="role-permission-matrix__resource">
                  {label}
                </th>
                {actionColumns.map((column) => {
                  const permission = resourcePermissions.find(
                    (item) => item.action === column.action
                  )
                  if (!permission) {
                    return (
                      <td
                        key={column.action}
                        className="role-permission-matrix__cell--empty"
                      >
                        —
                      </td>
                    )
                  }
                  const grant = draft[permission.code]
                  return (
                    <td key={column.action} className="role-permission-matrix__cell">
                      <div className="role-permission-matrix__grant">
                        <Checkbox
                          checked={!!grant}
                          onChange={(event) =>
                            togglePermission(permission, !!event.target.checked)
                          }
                          aria-label={`授权 ${permission.code}`}
                        />
                        <span className="role-permission-matrix__permission-label">
                          {permission.description}
                        </span>
                        {grant ? (
                          <div className="role-permission-matrix__scope">
                            <LabeledSelect
                              label={`${permission.code} 的数据范围`}
                              value={grant.dataScope}
                              onChange={(value) =>
                                setDataScope(permission, value as DataScope)
                              }
                              optionList={DATA_SCOPE_OPTIONS}
                              size="small"
                            />
                            {grant.dataScope === 'DEPARTMENT' ? (
                              <LabeledSelect
                                label={`${permission.code} 的部门范围`}
                                value={
                                  Array.isArray(grant.scopeConfig?.departmentNames)
                                    ? (grant.scopeConfig.departmentNames as string[])
                                    : []
                                }
                                onChange={(value) =>
                                  setScopeConfig(permission, {
                                    departmentNames: value as string[],
                                  })
                                }
                                optionList={departments.map((department) => ({
                                  value: department,
                                  label: department,
                                }))}
                                multiple
                                size="small"
                              />
                            ) : null}
                            {grant.dataScope === 'PROJECT' ? (
                              <LabeledSelect
                                label={`${permission.code} 的项目范围`}
                                value={
                                  Array.isArray(grant.scopeConfig?.projectIds)
                                    ? (grant.scopeConfig.projectIds as string[])
                                    : []
                                }
                                onChange={(value) =>
                                  setScopeConfig(permission, {
                                    projectIds: value as string[],
                                  })
                                }
                                optionList={projects.map((project) => ({
                                  value: project.id,
                                  label: project.name,
                                }))}
                                multiple
                                size="small"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
