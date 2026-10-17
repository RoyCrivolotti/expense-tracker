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
