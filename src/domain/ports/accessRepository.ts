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
  listPendingRequests(): Promise<AccessRequest[]>
  countPendingRequests(): Promise<number>
  findRequestById(id: string): Promise<AccessRequest | null>
  createRequest(input: { id: string; email: string }): Promise<AccessRequest>
  findLatestRequest(email: string): Promise<AccessRequest | null>
  markRequestApproved(id: string): Promise<void>
  markRequestRejected(id: string): Promise<void>
  revokeAccess(email: string): Promise<boolean>
  touchLastSeen(email: string, seenAt: string): Promise<void>
}
