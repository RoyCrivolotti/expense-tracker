import type { Env, ExpensesData } from '../../_shared/env'
import { MAX_SHORTCUT_BYTES, SHORTCUT_OBJECT_KEY, shortcutSize } from '../../_shared/captureShortcut'
import { error } from '../../_shared/http'

/**
 * The generic Shortcut file, for anyone signed in: the same bytes for everyone, so nothing here depends on the owner.
 * `application/octet-stream` with an attachment disposition, since no registered media type for a Shortcut file is
 * known, and `nosniff` so the browser does not guess one. Reads only; a missing or oversized object answers 404.
 *
 * It reads the bucket directly rather than through the receipt store: this is one fixed shared object, not an owner's
 * receipt, so there is no owner, key from the database or attachment row to go through.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const bucket = context.env.RECEIPTS
  if ((await shortcutSize(bucket)) === null) return error(404, 'The shortcut is not available')
  const object = await bucket!.get(SHORTCUT_OBJECT_KEY)
  // The file can be replaced between the check and the read, so the length and the cap come from what is streamed.
  if (!object || object.size > MAX_SHORTCUT_BYTES) return error(404, 'The shortcut is not available')
  return new Response(object.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="Expense capture.shortcut"',
      'content-length': String(object.size),
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
