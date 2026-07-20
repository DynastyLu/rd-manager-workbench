export const PROVIDER_TIMEOUT_MS = 20_000
export const PROVIDER_MAX_ATTEMPTS = 3

export function isRetryableHttp(status: number): boolean {
  return status === 429 || status >= 500
}

export async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** Math.max(0, attempt - 1))))
}

export async function responseBytesLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('EXTENSION_RESPONSE_TOO_LARGE')
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) throw new Error('EXTENSION_RESPONSE_TOO_LARGE')
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('EXTENSION_RESPONSE_TOO_LARGE')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

export async function responseTextLimited(response: Response, maxBytes: number): Promise<string> {
  const bytes = await responseBytesLimited(response, maxBytes)
  return new TextDecoder().decode(bytes)
}

export function basicAuthorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

export function assertSameOriginRedirect(requestUrl: string, response: Response): void {
  if (response.status < 300 || response.status >= 400) return
  const location = response.headers.get('location')
  if (!location) throw new Error('EXTERNAL_REDIRECT_INVALID')
  if (new URL(location, requestUrl).origin !== new URL(requestUrl).origin) {
    throw new Error('EXTERNAL_CROSS_HOST_REDIRECT')
  }
}
