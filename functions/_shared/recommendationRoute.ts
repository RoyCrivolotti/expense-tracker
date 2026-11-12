import type { Decision } from '../domain/application/recommendationService'
import { RECOMMENDATION_ID_PATTERN } from '../domain/application/recommendationService'
import { HttpError } from './http'
import { routeParam } from './params'

/** A made-up id is a 404 before any query, the same answer as another person's. */
export function recommendationId(value: string | string[] | undefined): string {
  const id = routeParam(value)
  if (!RECOMMENDATION_ID_PATTERN.test(id)) throw new HttpError(404, 'Recommendation not found')
  return id
}

/** Turns a refusal into the status the client acts on: 404 when it is not theirs or not there, 409 when it is settled. */
export function refuse(decision: Extract<Decision, { ok: false }> | { ok: false; reason: string }): never {
  switch (decision.reason) {
    case 'missing':
      throw new HttpError(404, 'Recommendation not found')
    case 'decided':
      throw new HttpError(409, 'This recommendation was already decided')
    case 'no-transaction':
      throw new HttpError(404, 'Transaction not found')
    default:
      throw new HttpError(409, 'That transaction already answers for another recommendation')
  }
}
