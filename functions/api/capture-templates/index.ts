import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { listCaptureTemplates } from '../../domain/application/captureTemplateService'
import { json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/** `?ignored=1`: the templates the person's dismissals muted, by their masked words. Reads only. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const ignored = new URL(context.request.url).searchParams.get('ignored')
    return json(await listCaptureTemplates(createD1CaptureRepository(context.env), context.data.owner, ignored))
  } catch (error) {
    mapAppError(error)
  }
}
