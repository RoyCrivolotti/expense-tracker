export type AllowedUserStatus = 'active' | 'revoked'

export interface AllowedUser {
  email: string
  status: AllowedUserStatus
  grantedAt: string
  grantedBy: string | null
  lastSeenAt: string | null
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface AccessRequest {
  id: string
  email: string
  requestedAt: string
  status: AccessRequestStatus
  tokenHash: string
  expiresAt: string
}

/** Persistence for app-level allowlist and access requests. */
export interface AccessRepository {
  countActiveUsers(): Promise<number>
  isAllowed(email: string): Promise<boolean>
  getAllowedUser(email: string): Promise<AllowedUser | null>
  listActiveUsers(): Promise<AllowedUser[]>
  grantAccess(email: string, grantedBy: string): Promise<void>
  findPendingRequest(email: string): Promise<AccessRequest | null>
  findRequestByTokenHash(tokenHash: string): Promise<AccessRequest | null>
  createRequest(input: {
    id: string
    email: string
    tokenHash: string
    expiresAt: string
  }): Promise<AccessRequest>
  markRequestApproved(id: string): Promise<void>
  touchLastSeen(email: string, seenAt: string): Promise<void>
}
