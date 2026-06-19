import { describe, expect, it, vi } from 'vitest'
import type { AccessRepository } from '../../domain/ports/accessRepository'
import {
  approveAccessRequestById,
  getAccessStatus,
  listActiveAccessUsers,
  rejectAccessRequestById,
  revokeAccessByEmail,
  submitAccessRequest,
} from './accessService'
import type { AccessServiceDeps } from './accessService'
import { HttpError } from '../http'

function deps(overrides: Partial<AccessRepository> = {}): AccessServiceDeps {
  const repo: AccessRepository = {
    countActiveUsers: vi.fn().mockResolvedValue(1),
    isAllowed: vi.fn().mockResolvedValue(false),
    getAllowedUser: vi.fn(),
    listActiveUsers: vi.fn().mockResolvedValue([]),
    grantAccess: vi.fn(),
    findPendingRequest: vi.fn().mockResolvedValue(null),
    listPendingRequests: vi.fn().mockResolvedValue([]),
    countPendingRequests: vi.fn().mockResolvedValue(0),
    findRequestById: vi.fn(),
    findLatestRequest: vi.fn().mockResolvedValue(null),
    createRequest: vi.fn().mockResolvedValue({
      id: 'req-1',
      email: 'new@example.com',
      requestedAt: '2026-01-01',
      status: 'pending',
      tokenHash: 'req-1',
      expiresAt: '2027-01-01',
    }),
    markRequestApproved: vi.fn(),
    markRequestRejected: vi.fn(),
    revokeAccess: vi.fn(),
    touchLastSeen: vi.fn(),
    ...overrides,
  }
  return {
    repo,
    env: { DB: {} as D1Database, OWNER_EMAIL: 'owner@example.com' },
  }
}

const pendingRequest = {
  id: 'req-1',
  email: 'new@example.com',
  requestedAt: '2026-01-01',
  status: 'pending' as const,
  tokenHash: 'req-1',
  expiresAt: '2027-01-01',
}

describe('accessService', () => {
  it('returns owner pending count when allowed owner checks status', async () => {
    const serviceDeps = deps({
      isAllowed: vi.fn().mockResolvedValue(true),
      countPendingRequests: vi.fn().mockResolvedValue(2),
    })
    const status = await getAccessStatus(serviceDeps, 'owner@example.com')
    expect(status).toEqual({
      status: 'allowed',
      email: 'owner@example.com',
      isOwner: true,
      pendingCount: 2,
    })
  })

  it('returns pending with requestedAt when a request is open', async () => {
    const serviceDeps = deps({
      findPendingRequest: vi.fn().mockResolvedValue(pendingRequest),
    })
    const status = await getAccessStatus(serviceDeps, 'new@example.com')
    expect(status).toEqual({
      status: 'pending',
      email: 'new@example.com',
      requestedAt: '2026-01-01',
    })
  })

  it('returns rejected when the latest request was denied', async () => {
    const serviceDeps = deps({
      findLatestRequest: vi.fn().mockResolvedValue({
        ...pendingRequest,
        status: 'rejected',
      }),
    })
    const status = await getAccessStatus(serviceDeps, 'new@example.com')
    expect(status.status).toBe('rejected')
    expect(status.requestedAt).toBe('2026-01-01')
  })

  it('creates a pending request without email tokens', async () => {
    const serviceDeps = deps()
    const result = await submitAccessRequest(serviceDeps, 'new@example.com')
    expect(result).toEqual({ status: 'pending' })
    expect(serviceDeps.repo.createRequest).toHaveBeenCalledWith({
      id: expect.any(String),
      email: 'new@example.com',
    })
  })

  it('approves a pending request by id for the owner', async () => {
    const serviceDeps = deps({
      findRequestById: vi.fn().mockResolvedValue(pendingRequest),
    })
    const result = await approveAccessRequestById(serviceDeps, 'req-1', 'owner@example.com')
    expect(result.email).toBe('new@example.com')
    expect(serviceDeps.repo.grantAccess).toHaveBeenCalledWith('new@example.com', 'owner@example.com')
    expect(serviceDeps.repo.markRequestApproved).toHaveBeenCalledWith('req-1')
  })

  it('rejects a pending request by id for the owner', async () => {
    const serviceDeps = deps({
      findRequestById: vi.fn().mockResolvedValue(pendingRequest),
    })
    const result = await rejectAccessRequestById(serviceDeps, 'req-1', 'owner@example.com')
    expect(result.email).toBe('new@example.com')
    expect(serviceDeps.repo.markRequestRejected).toHaveBeenCalledWith('req-1')
  })

  it('lists active users with owner flag', async () => {
    const serviceDeps = deps({
      listActiveUsers: vi.fn().mockResolvedValue([
        {
          email: 'owner@example.com',
          status: 'active',
          grantedAt: '2026-01-01',
          grantedBy: null,
          lastSeenAt: '2026-06-01',
        },
        {
          email: 'guest@example.com',
          status: 'active',
          grantedAt: '2026-02-01',
          grantedBy: 'owner@example.com',
          lastSeenAt: null,
        },
      ]),
    })
    const users = await listActiveAccessUsers(serviceDeps, 'owner@example.com')
    expect(users).toEqual([
      {
        email: 'owner@example.com',
        grantedAt: '2026-01-01',
        grantedBy: null,
        lastSeenAt: '2026-06-01',
        isOwner: true,
      },
      {
        email: 'guest@example.com',
        grantedAt: '2026-02-01',
        grantedBy: 'owner@example.com',
        lastSeenAt: null,
        isOwner: false,
      },
    ])
  })

  it('revokes an active user but not the owner', async () => {
    const serviceDeps = deps({
      revokeAccess: vi.fn().mockResolvedValue(true),
    })
    await expect(
      revokeAccessByEmail(serviceDeps, 'owner@example.com', 'owner@example.com'),
    ).rejects.toBeInstanceOf(HttpError)
    const result = await revokeAccessByEmail(serviceDeps, 'guest@example.com', 'owner@example.com')
    expect(result.email).toBe('guest@example.com')
    expect(serviceDeps.repo.revokeAccess).toHaveBeenCalledWith('guest@example.com')
  })
})
