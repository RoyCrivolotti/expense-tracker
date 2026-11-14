import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { captureStatus } from '../../domain/application/captureStatusService'
import { shortcutSize } from '../../_shared/captureShortcut'
import { json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * What the setup screen needs to say whether a phone is sending: the last capture and the week's counts per bank app,
 * and the address of the capture Worker for this environment. Reads only, for the signed-in person alone.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    return json(
      await captureStatus(
        createD1CaptureRepository(context.env),
        context.data.owner,
        context.env.CAPTURE_ENDPOINT,
        (await shortcutSize(context.env.RECEIPTS)) !== null,
        new Date(),
      ),
    )
  } catch (error) {
    mapAppError(error)
  }
}
