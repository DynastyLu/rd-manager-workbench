import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { usersService } from '@/services/users'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateUserSchema, type CreateUserFormData } from '@/schemas/user'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { UserInfo, UserRole } from '@/types/user'

export default function AdminUsers() {
  const currentUser = useAuthStore((s) => s.user)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: users = [], isLoading } = useQuery<UserInfo[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => usersService.list(),
  })

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { username: '', password: '', role: 'user' },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateUserFormData) =>
      usersService.create({
        username: data.username,
        password: data.password,
        role: data.role as UserRole,
      }),
    onSuccess: () => {
      toast.success('用户创建成功')
      setShowModal(false)
      form.reset()
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err: Error) => {
      toast.error(err.message === 'USERNAME_TAKEN' ? '用户名已存在' : '创建失败，请重试')
    },
  })

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => usersService.updateRole(id, role),
    onMutate: async ({ id, role }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] })
      const previous = queryClient.getQueryData<UserInfo[]>(['admin', 'users'])
      queryClient.setQueryData<UserInfo[]>(['admin', 'users'], (old = []) =>
        old.map((u) => (u.id === id ? { ...u, role } : u))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      toast.error('修改角色失败')
      if (context?.previous) {
        queryClient.setQueryData(['admin', 'users'], context.previous)
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersService.remove(id),
    onSuccess: () => {
      toast.success('用户已删除')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: () => toast.error('删除失败'),
  })

  function handleRoleChange(id: string, role: string) {
    roleChangeMutation.mutate({ id, role: role as UserRole })
  }

  function handleDelete(id: string, username: string) {
    if (!window.confirm(`确认删除用户「${username}」？此操作不可撤销。`)) return
    deleteMutation.mutate(id)
  }

  const creating = createMutation.isPending

  return (
    <div className="app-page app-page--admin-users">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Control Bench</p>
            <h2 className="app-page__title">用户管理</h2>
            <p className="app-page__subtitle">管理账号、角色和后台访问权限。</p>
          </div>
          <div className="app-page__meta">
            <span className="app-page__chip">{users.length} 名用户</span>
            <span className="app-page__chip">
              {currentUser?.role === 'admin' ? '管理员在线' : '用户在线'}
            </span>
          </div>
        </div>

        <button
          className="action-button action-button--primary"
          style={{ marginBottom: 16 }}
          onClick={() => {
            setShowModal(true)
          }}
        >
          + 新建用户
        </button>

        {isLoading ? (
          <div style={s.loading}>加载中...</div>
        ) : (
          <div className="tool-panel" style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['ID', '用户名', '角色', '操作'].map((h) => (
                    <th key={h} style={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {users.map((u) => (
                    <motion.tr
                      key={u.id}
                      style={s.tr}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.2 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    >
                      <td style={s.td}>{u.id}</td>
                      <td style={s.td}>
                        <span style={s.username}>{u.username}</span>
                      </td>
                      <td style={s.td}>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          style={
                            u.role === 'admin'
                              ? { ...s.select, color: 'var(--accent-gold)' }
                              : s.select
                          }
                        >
                          <option value="user">USER</option>
                          <option value="admin">ADMIN</option>
                        </select>
                      </td>
                      <td style={s.td}>
                        <button
                          style={
                            u.id === currentUser?.id
                              ? { ...s.deleteBtn, opacity: 0.3, cursor: 'not-allowed' }
                              : s.deleteBtn
                          }
                          disabled={u.id === currentUser?.id}
                          title={u.id === currentUser?.id ? '不能删除自己' : '删除用户'}
                          onClick={() => handleDelete(u.id, u.username)}
                        >
                          删除
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            fontFamily: 'var(--font-main, sans-serif)',
            color: 'var(--text-primary)',
          }}
        >
          <DialogHeader>
            <DialogTitle style={s.modalTitle}>新建用户</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                void form.handleSubmit((data) => createMutation.mutate(data))(e)
              }}
              style={s.form}
            >
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      用户名
                    </FormLabel>
                    <FormControl>
                      <input {...field} style={s.input} placeholder="用户名" maxLength={50} />
                    </FormControl>
                    <FormMessage style={s.formError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      密码
                    </FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        style={s.input}
                        type="password"
                        placeholder="密码"
                        maxLength={72}
                      />
                    </FormControl>
                    <FormMessage style={s.formError} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      角色
                    </FormLabel>
                    <FormControl>
                      <select {...field} style={s.select}>
                        <option value="user">USER</option>
                        <option value="admin">ADMIN</option>
                      </select>
                    </FormControl>
                    <FormMessage style={s.formError} />
                  </FormItem>
                )}
              />
              <div style={s.modalActions}>
                <button
                  type="button"
                  style={s.cancelBtn}
                  onClick={() => {
                    setShowModal(false)
                    form.reset()
                  }}
                >
                  取消
                </button>
                <button type="submit" disabled={creating} style={s.submitBtn}>
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </Form>
          <style>{`
            input:focus, select:focus { outline: none; border: 1px solid var(--accent-gold) !important; box-shadow: var(--glow-gold) !important; }
          `}</style>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  loading: { color: 'var(--text-muted)', letterSpacing: 4, padding: 40, textAlign: 'center' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--accent-gold)',
    fontSize: 12,
    letterSpacing: 2,
    background: 'linear-gradient(90deg, rgba(246,208,93,0.1), transparent)',
  },
  tr: { borderBottom: '1px solid var(--border-color)' },
  td: { padding: '12px 16px', fontSize: 13 },
  username: { fontFamily: 'inherit', letterSpacing: 1 },
  select: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    padding: '4px 8px',
    fontFamily: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 8,
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid rgba(240,77,77,0.46)',
    color: 'var(--accent-pink)',
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 8,
  },
  modalTitle: {
    color: 'var(--accent-gold)',
    fontSize: 14,
    letterSpacing: 2,
    margin: '0 0 24px',
    textShadow: 'var(--glow-gold)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-color)',
    borderBottom: '1px solid var(--accent-gold)',
    color: 'var(--text-primary)',
    padding: '9px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 8,
  },
  formError: {
    color: 'var(--accent-pink)',
    fontSize: 12,
    margin: 0,
    textShadow: 'var(--glow-pink)',
  },
  modalActions: { display: 'flex', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    padding: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
  },
  submitBtn: {
    flex: 1,
    background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-green))',
    border: '1px solid transparent',
    color: 'var(--text-inverse)',
    padding: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    letterSpacing: 1,
  },
}
