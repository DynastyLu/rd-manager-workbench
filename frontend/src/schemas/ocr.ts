import { z } from 'zod'

export const UploadSchema = z.object({
  files: z.array(z.instanceof(File)).min(1, '至少上传一个文件').max(20, '最多 20 个文件'),
  outputFormat: z.enum(['xlsx', 'csv']).default('xlsx'),
})

export type UploadFormData = z.infer<typeof UploadSchema>
