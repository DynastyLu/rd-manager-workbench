import { z } from 'zod'
import { ROLES } from '@/constants/roles'

const roleValues = Object.values(ROLES) as [string, ...string[]]

export const CreateUserSchema = z.object({
  username: z.string().min(3, '用户名至少 3 位').max(50),
  password: z.string().min(6, '密码至少 6 位'),
  role: z.enum(roleValues),
})

export type CreateUserFormData = z.infer<typeof CreateUserSchema>

export const UpdateRoleSchema = z.object({
  role: z.enum(roleValues),
})

export type UpdateRoleFormData = z.infer<typeof UpdateRoleSchema>
