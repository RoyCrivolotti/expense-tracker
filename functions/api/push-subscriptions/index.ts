import type { Env, ExpensesData } from '../../_shared/env'
import { createD1PushRepository } from '../../_shared/adapters/d1PushRepository'
import { listPushDevices, savePushDevice } from '../../domain/application/pushService'
import { HttpError, json, readJson } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/** An endpoint, two keys, a label and a zone name. */
const MAX_BODY_BYTES = 2048

/** The signed-in person's devices, without endpoints or keys, and how they chose to be told. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    return json(await listPushDevices(createD1PushRepository(context.env), context.data.owner))
  } catch (error) {
    mapAppError(error)
  }
}

/**
 * Saves this device's subscription for the signed-in person. Body: `{ endpoint, keys: { p256dh, auth }, label, timeZone }`,
 * what `PushSubscription.toJSON()` gives plus the device's name and zone. A device saved again keeps its id. The endpoint
 * must be on a known push service, so the server can never be pointed at another address.
 */
export const onRequestPut: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  try {
    const saved = await savePushDevice(createD1PushRepository(context.env), context.data.owner, body, new Date(), () =>
      crypto.randomUUID(),
    )
    if (saved === 'limit') throw new HttpError(409, 'You already have the most devices allowed. Remove one first.')
    return json(saved)
  } catch (error) {
    mapAppError(error)
  }
}
