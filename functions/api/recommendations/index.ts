import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import {
  formatCursor,
  listRecommendations,
  parseCursor,
  parsePageLimit,
} from '../../domain/application/recommendationService'
import { json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/** The signed-in person's open recommendations, newest day first, a page at a time. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const url = new URL(context.request.url)
    const page = await listRecommendations(
      createD1CaptureRepository(context.env),
      context.data.owner,
      parsePageLimit(url.searchParams.get('limit')),
      parseCursor(url.searchParams.get('after')),
    )
    return json({
      recommendations: page.recommendations,
      next: page.next ? formatCursor(page.next) : null,
      openCount: page.openCount,
    })
  } catch (error) {
    mapAppError(error)
  }
}
