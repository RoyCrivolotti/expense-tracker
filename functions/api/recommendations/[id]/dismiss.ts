import type { Env, ExpensesData } from '../../../_shared/env'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { dismissRecommendation } from '../../../domain/application/recommendationService'
import { json, readJson } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { recommendationId, refuse } from '../../../_shared/recommendationRoute'

const MAX_BODY_BYTES = 1024

/** Takes the recommendation off the list. It creates nothing. The body must be a JSON object, which the middleware requires of every write. */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = recommendationId(context.params.id)
  await readJson<unknown>(context.request, MAX_BODY_BYTES)
  try {
    const result = await dismissRecommendation(createD1CaptureRepository(context.env), context.data.owner, id, new Date())
    if (!result.ok) refuse(result)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
