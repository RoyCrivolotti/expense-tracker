import type { Env, ExpensesData } from '../../_shared/env'
import { createD1PushRepository } from '../../_shared/adapters/d1PushRepository'
import { removePushDevice } from '../../domain/application/pushService'
import { HttpError, json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'
import { routeParam } from '../../_shared/params'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Forgets a device. Another person's device and an unknown id both answer 404, so ids cannot be probed. */
export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const id = routeParam(context.params.id)
  if (!ID_PATTERN.test(id)) throw new HttpError(404, 'Device not found')
  try {
    if (!(await removePushDevice(createD1PushRepository(context.env), context.data.owner, id)))
      throw new HttpError(404, 'Device not found')
    return json({ ok: true })
  } catch (error) {
    mapAppError(error)
  }
}
