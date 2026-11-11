import { describe, expect, it } from 'vitest'
import { findIbans, hasValidIbanChecksum } from './iban.mjs'

/** An IBAN with correct check digits for an invented account, built here so no real-looking number sits in the repo. */
function ibanFor(country: string, bban: string): string {
  const digits = (s: string) => [...s].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('')
  let remainder = 0
  for (const d of digits(bban + country + '00')) remainder = (remainder * 10 + Number(d)) % 97
  return `${country}${String(98 - remainder).padStart(2, '0')}${bban}`
}

const VALID = ibanFor('ES', '00000000000000000001')

describe('findIbans', () => {
  it('finds a valid IBAN written together or in groups of four', () => {
    const grouped = VALID.replace(/(.{4})/g, '$1 ').trim()
    expect(findIbans(`pay to ${VALID} today`).map((f) => f.iban)).toEqual([VALID])
    expect(findIbans(`pay to ${grouped}.`).map((f) => f.iban)).toEqual([grouped])
  })

  it('reports where it is', () => {
    expect(findIbans(`abc ${VALID}`)[0]?.index).toBe(4)
  })

  it('ignores something shaped like an IBAN with the wrong check digits', () => {
    const wrong = VALID.slice(0, 2) + (VALID.slice(2, 4) === '99' ? '98' : String(Number(VALID.slice(2, 4)) + 1).padStart(2, '0')) + VALID.slice(4)
    expect(hasValidIbanChecksum(wrong)).toBe(false)
    expect(findIbans(`id ${wrong}`)).toEqual([])
  })

  it('ignores ordinary identifiers, hashes and words', () => {
    expect(findIbans('const SHA256 = "e3b0c44298fc1c149afbf4c8996fb924"; DEPLOY2026 build')).toEqual([])
    expect(findIbans('')).toEqual([])
  })
})
