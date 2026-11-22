import type { Env, ExpensesData } from '../../../_shared/env'
import { createD1CaptureRepository } from '../../../_shared/adapters/d1CaptureRepository'
import { unignoreCaptureTemplate } from '../../../domain/application/captureTemplateService'
import { HttpError, json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'
import { routeParam } from '../../../_shared/params'

/** The template's pushes make recommendations again. Another person's template, or no template, is a 404. No body. */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const found = await unignoreCaptureTemplate(
      createD1CaptureRepository(context.env),
      context.data.owner,
      routeParam(context.params.id),
    )
    if (!found) throw new HttpError(404, 'Template not found')
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
