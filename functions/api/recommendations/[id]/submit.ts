import type { Env, ExpensesData } from '../../../_shared/env'
import type { NewTransaction } from '../../../domain/data/dataSource'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { submitRecommendation } from '../../../domain/application/recommendationService'
import { json, readJson } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { recommendationId, refuse } from '../../../_shared/recommendationRoute'

/**
 * Creates the expense the person edited, exactly as `POST /api/expenses/transactions` would, and marks the
 * recommendation submitted. The body is the new transaction; nothing in the recommendation is copied into it.
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = recommendationId(context.params.id)
  const input = await readJson<NewTransaction>(context.request)
  try {
    const result = await submitRecommendation(
      createD1CaptureRepository(context.env),
      context.data.repo,
      context.data.owner,
      id,
      input,
      new Date(),
    )
    if (!result.ok) refuse(result)
    return json(result.transaction, 201)
  } catch (error) {
    mapAppError(error)
  }
}
