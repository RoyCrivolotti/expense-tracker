import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import {
  countActiveUsers,
  findPendingRequestRow,
  findRequestByTokenHashRow,
  getAllowedUserRow,
  insertAccessRequest,
  isAllowedUser,
  listActiveUserRows,
  markRequestApprovedRow,
  touchLastSeenRow,
  upsertAllowedUser,
} from '../access/accessDb'

export function createD1AccessRepository(env: Env): AccessRepository {
  const db = env.DB
  return {
    countActiveUsers: () => countActiveUsers(db),
    isAllowed: (email) => isAllowedUser(db, email),
    getAllowedUser: (email) => getAllowedUserRow(db, email),
    listActiveUsers: () => listActiveUserRows(db),
    grantAccess: (email, grantedBy) => upsertAllowedUser(db, email, grantedBy),
    findPendingRequest: (email) => findPendingRequestRow(db, email),
    findRequestByTokenHash: (hash) => findRequestByTokenHashRow(db, hash),
    createRequest: async (input) => {
      await insertAccessRequest(db, {
        id: input.id,
        email: input.email,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      const row = await findRequestByTokenHashRow(db, input.tokenHash)
      if (!row) throw new Error('access request insert failed')
      return row
    },
    markRequestApproved: (id) => markRequestApprovedRow(db, id),
    touchLastSeen: (email, seenAt) => touchLastSeenRow(db, email, seenAt),
  }
}
