import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCheckinDate } from './checkinDate'

describe('formatCheckinDate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes the date in English whatever language the browser is set to', () => {
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, _l, o) {
      return new Intl.DateTimeFormat('de-DE', o).format(this)
    })
    expect(formatCheckinDate('2026-09-11')).toMatch(/^11 Sept? 2026$/)
  })

  it('does not move the day with the machine time zone', () => {
    expect(formatCheckinDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatCheckinDate('2026-12-31')).toBe('31 Dec 2026')
  })
})
