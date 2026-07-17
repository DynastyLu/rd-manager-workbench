import { z } from 'zod'

const API_BASE_URL_PATTERN = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/

const apiBaseUrlSchema = z.string().superRefine((value, context) => {
  const match = API_BASE_URL_PATTERN.exec(value)
  const port = match?.[1] === undefined ? Number.NaN : Number(match[1])

  if (match === null || !Number.isInteger(port) || port < 1_024 || port > 65_535) {
    context.addIssue({
      code: 'custom',
      message: 'API base URL must use an unprivileged 127.0.0.1 port',
    })
  }
})

export const runtimeConfigSchema = z
  .object({
    apiBaseUrl: apiBaseUrlSchema,
    sessionToken: z.string().min(32),
    appVersion: z.string().min(1),
    platform: z.enum(['darwin', 'win32', 'linux']),
  })
  .strict()

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
