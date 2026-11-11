import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { revokeCaptureKey } from '../../domain/application/captureKeyService'
import { CAPTURE_KEY_ID_PATTERN } from '../../domain/capture/captureKey'
import { HttpError, json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'
import { routeParam } from '../../_shared/params'

/** Takes effect on the next request the key makes. Another person's key, a revoked one and an unknown one all answer 404. */
export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const keyId = routeParam(context.params.id)
  if (!CAPTURE_KEY_ID_PATTERN.test(keyId)) throw new HttpError(404, 'Key not found')
  try {
    const revoked = await revokeCaptureKey(createD1CaptureRepository(context.env), context.data.owner, keyId, new Date())
    if (!revoked) throw new HttpError(404, 'Key not found')
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
