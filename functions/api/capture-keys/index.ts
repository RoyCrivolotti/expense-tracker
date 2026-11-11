import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { createCaptureKey, listCaptureKeys } from '../../domain/application/captureKeyService'
import { HttpError, json, readJson } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/** Only the label is read, so a key made here can never carry an owner, an id or a hash of the caller's choosing. */
const MAX_BODY_BYTES = 1024

/** The signed-in person's keys, without the secret or its hash. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    const keys = await listCaptureKeys(createD1CaptureRepository(context.env), context.data.owner)
    return json({ keys })
  } catch (error) {
    mapAppError(error)
  }
}

/**
 * Makes a key for the signed-in person. The whole key is in this answer and nowhere else, ever. The body must be a
 * JSON object, which also puts the call under the middleware's JSON-only rule for writes.
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
  try {
    const created = await createCaptureKey(
      createD1CaptureRepository(context.env),
      context.data.owner,
      (body as { label?: unknown }).label,
      new Date(),
    )
    if (!created) throw new HttpError(409, 'You already have the most keys allowed. Revoke one first.')
    return json(created, 201)
  } catch (error) {
    mapAppError(error)
  }
}
