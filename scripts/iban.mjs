/**
 * Finds IBANs in text. This repo is public, so a real account number in a fixture, a comment or a doc must fail the
 * build. A candidate has the shape of an IBAN and also passes the ISO 7064 mod-97 check, which every real IBAN does
 * and a made-up string almost never does, so invented test values do not trip it. A test value that should be
 * accepted must therefore fail the checksum.
 */
const CANDIDATE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g

/** @param {string} candidate @returns {boolean} */
export function hasValidIbanChecksum(candidate) {
  const compact = candidate.replace(/ /g, '')
  if (compact.length < 15 || compact.length > 34) return false
  const moved = compact.slice(4) + compact.slice(0, 4)
  let remainder = 0
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder === 1
}

/**
 * Every IBAN in the text, with its index.
 * @param {string} text
 * @returns {Array<{ iban: string, index: number }>}
 */
export function findIbans(text) {
  /** @type {Array<{ iban: string, index: number }>} */
  const found = []
  for (const match of text.matchAll(CANDIDATE)) {
    if (hasValidIbanChecksum(match[0])) found.push({ iban: match[0], index: match.index })
  }
  return found
}
