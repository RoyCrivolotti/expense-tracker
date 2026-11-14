import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { captureStatus } from '../../domain/application/captureStatusService'
import { json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * What the setup screen needs to say whether a phone is sending: the last capture and the week's counts per bank app,
 * the address of the capture Worker for this environment, and the Shortcut's share link when one is set. Reads only, for the signed-in person alone.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    return json(
      await captureStatus(
        createD1CaptureRepository(context.env),
        context.data.owner,
        context.env.CAPTURE_ENDPOINT,
        context.env.CAPTURE_SHORTCUT_URL,
        new Date(),
      ),
    )
  } catch (error) {
    mapAppError(error)
  }
}
