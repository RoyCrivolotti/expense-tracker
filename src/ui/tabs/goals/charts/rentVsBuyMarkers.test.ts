import { describe, expect, it } from 'vitest'
import { rentVsBuyMarkers } from './rentVsBuyMarkers'

describe('rentVsBuyMarkers', () => {
  it('marks when owning gets cheaper than renting, and says so when it stays so', () => {
    const stays = rentVsBuyMarkers({ ownCheaper: { fromYear: 12, stays: true }, loanPaidOffYear: null }, 40)
    expect(stays).toHaveLength(1)
    expect(stays[0]).toMatchObject({ index: 12, label: 'Owning cheaper from here' })
    expect(stays[0]!.title).toContain('for the rest of the chart')
    const comes = rentVsBuyMarkers({ ownCheaper: { fromYear: 12, stays: false }, loanPaidOffYear: null }, 40)
    expect(comes[0]).toMatchObject({ index: 12, label: 'Owning first cheaper' })
    expect(comes[0]!.title).toContain('though not for the rest')
  })

  it('marks the year the loan is paid off, where it falls in the term, part way through a year too', () => {
    expect(rentVsBuyMarkers({ ownCheaper: null, loanPaidOffYear: 25 }, 40)).toMatchObject([{ index: 25, label: 'Loan paid off' }])
    expect(rentVsBuyMarkers({ ownCheaper: null, loanPaidOffYear: 24 + 7 / 12 }, 40)).toMatchObject([
      { index: 24 + 7 / 12, label: 'Loan paid off' },
    ])
  })

  it('marks both, and neither when there is nothing to name', () => {
    expect(rentVsBuyMarkers({ ownCheaper: { fromYear: 3, stays: true }, loanPaidOffYear: 25 }, 40).map((m) => m.label)).toEqual([
      'Owning cheaper from here',
      'Loan paid off',
    ])
    expect(rentVsBuyMarkers({ ownCheaper: null, loanPaidOffYear: null }, 40)).toEqual([])
  })

  it('leaves out a turning point that is off the end of the chart', () => {
    expect(rentVsBuyMarkers({ ownCheaper: null, loanPaidOffYear: 45 }, 40)).toEqual([])
  })
})
