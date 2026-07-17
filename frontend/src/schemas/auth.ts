import { z } from 'zod'

export const LoginSchema = z.object({
  username: z.string().min(3, '用户名至少 3 位').max(50, '用户名最多 50 位'),
  password: z.string().min(6, '密码至少 6 位'),
})

export type LoginFormData = z.infer<typeof LoginSchema>
