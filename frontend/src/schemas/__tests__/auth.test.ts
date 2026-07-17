import { describe, it, expect } from 'vitest'
import { LoginSchema } from '../auth'

describe('LoginSchema', () => {
  it('validates correct credentials', () => {
    expect(() => LoginSchema.parse({ username: 'testuser', password: 'pass123' })).not.toThrow()
  })

  it('rejects username shorter than 3 chars', () => {
    const result = LoginSchema.safeParse({ username: 'ab', password: 'pass123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('3')
    }
  })

  it('rejects password shorter than 6 chars', () => {
    const result = LoginSchema.safeParse({ username: 'testuser', password: '123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('6')
    }
  })

  it('rejects missing fields', () => {
    expect(LoginSchema.safeParse({}).success).toBe(false)
  })

  it('infers correct TypeScript type', () => {
    const data = LoginSchema.parse({ username: 'testuser', password: 'pass123' })
    const _username: string = data.username
    const _password: string = data.password
    expect(_username).toBe('testuser')
    expect(_password).toBe('pass123')
  })
})
