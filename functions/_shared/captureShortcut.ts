/**
 * The generic Shortcut file the setup screen hands out. It is specific to one deployment (the Worker's address is inside
 * it) and signed by Apple, so it cannot be edited per person and is never in the repo: an operator uploads it once to the
 * receipts bucket, under this key, and the app serves it behind the sign-in.
 *
 * The receipts bucket is used because the app already binds it and nothing in it is ever listed: receipt bytes are read
 * and deleted only by keys taken from the database, and no job treats an unknown key as an orphan.
 */
export const SHORTCUT_OBJECT_KEY = 'shortcuts/capture.shortcut'

/** The real file is about 23 KB. Anything much larger is not it, and is neither offered nor served. */
export const MAX_SHORTCUT_BYTES = 256 * 1024

/** What the route and the status flag read, so both agree on what counts as available. */
export async function shortcutSize(bucket: R2Bucket | undefined): Promise<number | null> {
  if (!bucket) return null
  const head = await bucket.head(SHORTCUT_OBJECT_KEY)
  return head && head.size <= MAX_SHORTCUT_BYTES ? head.size : null
}
