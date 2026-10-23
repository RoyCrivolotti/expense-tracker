/**
 * Bump this whenever the JSON shape of GET /api/expenses changes. The ETag only says the data is
 * unchanged; a browser holding a body in the old shape would otherwise get a 304 for it after the
 * deploy and keep using it until the owner's next write. `datasetEtag.test.ts` fails when the shape
 * moves, so the bump cannot be forgotten.
 */
export const DATASET_FORMAT = 1

/** Weak, because the body can be re-encoded in transit (compression) without changing what it means. */
export function datasetEtag(token: string, budgetMonth: string): string {
  return `W/"${token}-${budgetMonth}-${DATASET_FORMAT}"`
}

/**
 * Bump this whenever the JSON shape of a ledger part (GET /api/expenses/reference, /transactions/months,
 * /cube, /series or /usage) or of the receipt list (GET /api/expenses/attachments) changes, for the same reason as {@link DATASET_FORMAT}. `ledgerPartsEtag.test.ts` fails when
 * a shape moves.
 */
export const PARTS_FORMAT = 1

export type PartName = 'reference' | 'months' | 'cube' | 'series' | 'usage' | 'attachments'

/**
 * The tag of one ledger part. It carries the part and the range asked for (`scope`), because a client
 * that keeps tags by hand could otherwise offer the tag of one range for another and be told nothing
 * changed. The token and budget month are the same as the dataset's, so a write or a new month moves
 * every part's tag together with the dataset's.
 */
export function partEtag(part: PartName, revision: { token: string; budgetMonth: string }, scope = ''): string {
  const suffix = scope === '' ? '' : `-${scope}`
  return `W/"${revision.token}-${revision.budgetMonth}-${part}${PARTS_FORMAT}${suffix}"`
}

function opaqueTag(value: string): string {
  return value.trim().replace(/^W\//, '')
}

/**
 * Weak comparison of an `If-None-Match` header against the current ETag. `*` never matches: a
 * browser's cache revalidation always names the tag it holds, and answering a wildcard with a body is
 * always correct.
 */
export function ifNoneMatchMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  const current = opaqueTag(etag)
  return header.split(',').some((candidate) => opaqueTag(candidate) === current)
}
