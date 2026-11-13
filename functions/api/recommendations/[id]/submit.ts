import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { submitRecommendation } from '../../../domain/application/recommendationService'
import { HttpError, json, readJson } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { recommendationId, refuse } from '../../../_shared/recommendationRoute'

/**
 * Creates the expense the person edited, exactly as `POST /api/expenses/transactions` would, and marks the
 * recommendation submitted. The body is the new transaction; nothing in the recommendation is copied into it.
 * A typed row that already looks like the payment answers 409 `possible-duplicate` with that row and creates nothing,
 * unless the body carries `allowDuplicate: true` (a strict boolean, never stored on the row).
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = recommendationId(context.params.id)
  const { allowDuplicate, ...input } = await readJson<NewTransaction & { allowDuplicate?: unknown }>(context.request)
  if (allowDuplicate !== undefined && typeof allowDuplicate !== 'boolean') {
    throw new HttpError(400, 'allowDuplicate must be true or false')
  }
  try {
    const result = await submitRecommendation(
      createD1CaptureRepository(context.env),
      context.data.repo,
      context.data.owner,
      id,
      input,
      new Date(),
      allowDuplicate === true,
    )
    if (!result.ok && result.reason === 'possible-duplicate') {
      return json({ error: 'A typed row already looks like this payment', code: result.reason, possibleMatch: result.possibleMatch }, 409)
    }
    if (!result.ok) refuse(result)
    return json(result.transaction, 201)
  } catch (error) {
    mapAppError(error)
  }
}
