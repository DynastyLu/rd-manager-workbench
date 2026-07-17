import { z } from 'zod'

export const backendReadySchema = z
  .object({
    type: z.literal('backend-ready'),
    protocolVersion: z.literal(1),
    nonce: z.string().min(8),
    port: z.number().int().min(1_024).max(65_535),
    pid: z.number().int().positive(),
    serviceVersion: z.string().min(1),
    databaseStatus: z.literal('ready'),
  })
  .strict()

export const backendFailedSchema = z
  .object({
    type: z.literal('backend-failed'),
    protocolVersion: z.literal(1),
    nonce: z.string().min(8),
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict()

export const backendMessageSchema = z.discriminatedUnion('type', [
  backendReadySchema,
  backendFailedSchema,
])

export type BackendReady = z.infer<typeof backendReadySchema>
export type BackendFailed = z.infer<typeof backendFailedSchema>
export type BackendMessage = z.infer<typeof backendMessageSchema>
