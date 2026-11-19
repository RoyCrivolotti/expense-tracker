import type { Env, ExpensesData } from '../_shared/env'
import { createD1PushRepository } from '../_shared/adapters/d1PushRepository'
import { savePushSettings } from '../domain/application/pushService'
import { json, readJson } from '../_shared/http'
import { mapAppError } from '../_shared/mapAppError'

const MAX_BODY_BYTES = 1024

/** How the signed-in person wants to be told: `{ mode: "each" | "daily" | "weekly", timeZone }`. Read back with the devices. */
export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  try {
    await savePushSettings(createD1PushRepository(context.env), context.data.owner, body)
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
