import type { Env, ExpensesData } from '../../../_shared/env'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { dismissRecommendation } from '../../../domain/application/recommendationService'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { recommendationId, refuse } from '../../../_shared/recommendationRoute'

/** Takes the recommendation off the list. It creates nothing. It takes no body. */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = recommendationId(context.params.id)
  try {
    const result = await dismissRecommendation(createD1CaptureRepository(context.env), context.data.owner, id, new Date())
    if (!result.ok) refuse(result)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
