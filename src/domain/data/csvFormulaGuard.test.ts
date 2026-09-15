import { describe, expect, it } from 'vitest'
import { guardCsvValue, unguardCsvValue } from './csvFormulaGuard'

describe('guardCsvValue', () => {
  it.each(['=cmd', '+1+1', '-50% at Zara', '@SUM(A1)', '\tfoo', '\rfoo'])(
    'neutralises a leading %j',
    (value) => {
      expect(guardCsvValue(value)).toBe(`'${value}`)
    },
  )

  it('leaves an ordinary value alone', () => {
    expect(guardCsvValue('Mercadona')).toBe('Mercadona')
    expect(guardCsvValue('')).toBe('')
  })

  it('only inspects the first character', () => {
    // A trigger later in the string cannot start a formula on its own; a bare \r is
    // handled by quoting at the writer, not here.
    expect(guardCsvValue('total=5')).toBe('total=5')
  })
})

describe('unguardCsvValue', () => {
  it('reverses the guard', () => {
    for (const value of ['=cmd', '-50%', '@x', '+1']) {
      expect(unguardCsvValue(guardCsvValue(value))).toBe(value)
    }
  })

  it('leaves a value that genuinely starts with an apostrophe', () => {
    // Only an apostrophe followed by a trigger is ours.
    expect(unguardCsvValue("'tis")).toBe("'tis")
    expect(unguardCsvValue("'")).toBe("'")
  })

  it('round-trips an ordinary value unchanged', () => {
    expect(unguardCsvValue(guardCsvValue('Mercadona'))).toBe('Mercadona')
  })
})
