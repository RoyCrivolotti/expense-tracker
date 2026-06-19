import { describe, expect, it, vi } from 'vitest'
import type { AccessRepository } from '../../domain/ports/accessRepository'
import { isEmailAllowed } from './accessAuthorizer'
import type { Env } from './env'

function repo(activeCount: number, allowed = false): AccessRepository {
  return {
    countActiveUsers: vi.fn().mockResolvedValue(activeCount),
    isAllowed: vi.fn().mockResolvedValue(allowed),
    getAllowedUser: vi.fn(),
    listActiveUsers: vi.fn(),
    grantAccess: vi.fn(),
    findPendingRequest: vi.fn(),
    listPendingRequests: vi.fn(),
    countPendingRequests: vi.fn(),
    findRequestById: vi.fn(),
    findLatestRequest: vi.fn(),
    createRequest: vi.fn(),
    markRequestApproved: vi.fn(),
    markRequestRejected: vi.fn(),
    revokeAccess: vi.fn(),
    touchLastSeen: vi.fn(),
  }
}

describe('isEmailAllowed', () => {
  it('uses ALLOWED_EMAILS when D1 allowlist is empty', async () => {
    const env: Env = { DB: {} as D1Database, ALLOWED_EMAILS: 'roy@example.com' }
    await expect(isEmailAllowed(repo(0), env, 'roy@example.com')).resolves.toBe(true)
    await expect(isEmailAllowed(repo(0), env, 'other@example.com')).resolves.toBe(false)
  })

  it('denies everyone when D1 and env are empty', async () => {
    const env: Env = { DB: {} as D1Database }
    await expect(isEmailAllowed(repo(0), env, 'roy@example.com')).resolves.toBe(false)
  })

  it('uses D1 when active users exist', async () => {
    const env: Env = { DB: {} as D1Database, ALLOWED_EMAILS: 'roy@example.com' }
    const d1 = repo(2, true)
    await expect(isEmailAllowed(d1, env, 'partner@example.com')).resolves.toBe(true)
    expect(d1.isAllowed).toHaveBeenCalledWith('partner@example.com')
  })
})
