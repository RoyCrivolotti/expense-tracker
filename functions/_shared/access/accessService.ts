import type { AccessRepository } from '../../domain/ports/accessRepository'
import type { Env } from '../env'
import { HttpError } from '../http'
import { isEmailAllowed, requireOwnerEmail } from './accessAuthorizer'
import { createApproveToken, hashToken, parseApproveToken } from './accessTokens'

export type AccessStatus = 'allowed' | 'pending' | 'none'

export interface AccessNotifier {
  notifyOwnerNewRequest(requesterEmail: string, approveUrl: string): Promise<void>
  notifyRequesterGranted(requesterEmail: string): Promise<void>
}

export interface AccessServiceDeps {
  repo: AccessRepository
  env: Env
  notifier: AccessNotifier
  appOrigin: string
}

function approveSecret(env: Env): string {
  const secret = env.ACCESS_APPROVE_SECRET?.trim()
  if (!secret) throw new HttpError(503, 'Approve secret not configured')
  return secret
}

export async function getAccessStatus(
  deps: AccessServiceDeps,
  email: string,
): Promise<{ status: AccessStatus; email: string }> {
  if (await isEmailAllowed(deps.repo, deps.env, email)) {
    return { status: 'allowed', email }
  }
  const pending = await deps.repo.findPendingRequest(email)
  return { status: pending ? 'pending' : 'none', email }
}

export async function submitAccessRequest(
  deps: AccessServiceDeps,
  email: string,
): Promise<{ status: 'pending' }> {
  if (await isEmailAllowed(deps.repo, deps.env, email)) {
    throw new HttpError(409, 'Already authorised')
  }
  const existing = await deps.repo.findPendingRequest(email)
  if (existing) return { status: 'pending' }

  const requestId = crypto.randomUUID()
  const secret = approveSecret(deps.env)
  const { token, expiresAt } = await createApproveToken(requestId, secret)
  const tokenHash = await hashToken(token)
  await deps.repo.createRequest({ id: requestId, email, tokenHash, expiresAt })

  const approveUrl = `${deps.appOrigin}/access/approve?token=${encodeURIComponent(token)}`
  await deps.notifier.notifyOwnerNewRequest(email, approveUrl)
  return { status: 'pending' }
}

export async function previewAccessApproval(
  deps: AccessServiceDeps,
  token: string,
  approverEmail: string,
): Promise<{ email: string; requestId: string }> {
  requireOwnerEmail(deps.env, approverEmail)
  const parsed = await parseApproveToken(token, approveSecret(deps.env))
  if (!parsed) throw new HttpError(400, 'Invalid or expired link')
  const tokenHash = await hashToken(token)
  const request = await deps.repo.findRequestByTokenHash(tokenHash)
  if (!request || request.status !== 'pending') {
    throw new HttpError(400, 'Invalid or expired link')
  }
  if (request.id !== parsed.requestId) throw new HttpError(400, 'Invalid or expired link')
  if (new Date(request.expiresAt).getTime() < Date.now()) {
    throw new HttpError(400, 'Invalid or expired link')
  }
  return { email: request.email, requestId: request.id }
}

export async function confirmAccessApproval(
  deps: AccessServiceDeps,
  token: string,
  approverEmail: string,
): Promise<{ email: string }> {
  const preview = await previewAccessApproval(deps, token, approverEmail)
  await deps.repo.grantAccess(preview.email, approverEmail)
  await deps.repo.markRequestApproved(preview.requestId)
  await deps.notifier.notifyRequesterGranted(preview.email)
  return { email: preview.email }
}

export async function touchLastSeenIfNeeded(
  deps: AccessServiceDeps,
  email: string,
): Promise<void> {
  if (!(await isEmailAllowed(deps.repo, deps.env, email))) return
  const user = await deps.repo.getAllowedUser(email)
  if (!user) return
  const today = new Date().toISOString().slice(0, 10)
  if (user.lastSeenAt?.startsWith(today)) return
  await deps.repo.touchLastSeen(email, new Date().toISOString())
}
