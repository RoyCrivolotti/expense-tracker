import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import {
  countPendingRequestRows,
  countActiveUsers,
  findLatestRequestByEmailRow,
  findPendingRequestRow,
  findRequestByIdRow,
  getAllowedUserRow,
  insertAccessRequest,
  isAllowedUser,
  listActiveUserRows,
  listPendingRequestRows,
  markRequestApprovedRow,
  markRequestRejectedRow,
  revokeAllowedUserRow,
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
    listPendingRequests: () => listPendingRequestRows(db),
    countPendingRequests: () => countPendingRequestRows(db),
    findRequestById: (id) => findRequestByIdRow(db, id),
    createRequest: async (input) => {
      await insertAccessRequest(db, input)
      const row = await findRequestByIdRow(db, input.id)
      if (!row) throw new Error('access request insert failed')
      return row
    },
    findLatestRequest: (email) => findLatestRequestByEmailRow(db, email),
    markRequestApproved: (id) => markRequestApprovedRow(db, id),
    markRequestRejected: (id) => markRequestRejectedRow(db, id),
    revokeAccess: (email) => revokeAllowedUserRow(db, email),
    touchLastSeen: (email, seenAt) => touchLastSeenRow(db, email, seenAt),
  }
}
