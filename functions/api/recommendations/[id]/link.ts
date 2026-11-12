import type { Env, ExpensesData } from '../../../_shared/env'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { linkRecommendation } from '../../../domain/application/recommendationService'
import { HttpError, json, readJson } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { recommendationId, refuse } from '../../../_shared/recommendationRoute'

const MAX_BODY_BYTES = 1024

/** Marks the recommendation as already entered by hand, pointing at that row. Creates nothing. */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = recommendationId(context.params.id)
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
  try {
    const result = await linkRecommendation(
      createD1CaptureRepository(context.env),
      context.data.repo,
      context.data.owner,
      id,
      (body as { transactionId?: unknown }).transactionId,
      new Date(),
    )
    if (!result.ok) refuse(result)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
