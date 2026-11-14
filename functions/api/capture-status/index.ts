import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { captureStatus } from '../../domain/application/captureStatusService'
import { shortcutSize } from '../../_shared/captureShortcut'
import { json } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * A bucket that cannot be read only means the button is not offered: the manual steps and the capture counts still
 * have to load. The log line is fixed text, never the error, which can carry a bucket or key name.
 */
async function shortcutAvailable(bucket: Env['RECEIPTS']): Promise<boolean> {
  try {
    return (await shortcutSize(bucket)) !== null
  } catch {
    console.warn('capture status: the shortcut file could not be checked')
    return false
  }
}

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
        await shortcutAvailable(context.env.RECEIPTS),
        new Date(),
      ),
    )
  } catch (error) {
    mapAppError(error)
  }
}
