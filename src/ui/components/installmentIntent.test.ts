import { describe, expect, it } from 'vitest'
import { buildInstallmentIntent, type InstallmentDraft } from './installmentIntent'

function draft(overrides: Partial<InstallmentDraft>): InstallmentDraft {
  return { mode: 'none', totalCount: '', installmentIndex: '', planId: null, ...overrides }
}

describe('buildInstallmentIntent', () => {
  it('returns none when mode is none', () => {
    expect(buildInstallmentIntent(draft({ mode: 'none' }))).toEqual({
      ok: true,
      intent: { kind: 'none' },
    })
  })

  it('returns unlink when mode is unlink', () => {
    expect(buildInstallmentIntent(draft({ mode: 'unlink' }))).toEqual({
      ok: true,
      intent: { kind: 'unlink' },
    })
  })

  it('builds a new-plan intent from valid fields', () => {
    const result = buildInstallmentIntent(
      draft({ mode: 'new', totalCount: '24', installmentIndex: '8' }),
    )
    expect(result).toEqual({ ok: true, intent: { kind: 'new', totalCount: 24, installmentIndex: 8 } })
  })

  it('builds a link intent for an existing plan', () => {
    const result = buildInstallmentIntent(
      draft({ mode: 'existing', totalCount: '24', installmentIndex: '3', planId: 7 }),
    )
    expect(result).toEqual({ ok: true, intent: { kind: 'link', planId: 7, installmentIndex: 3 } })
  })

  it('rejects a non-integer or sub-1 total', () => {
    expect(buildInstallmentIntent(draft({ mode: 'new', totalCount: '0', installmentIndex: '1' })).ok).toBe(
      false,
    )
    expect(
      buildInstallmentIntent(draft({ mode: 'new', totalCount: '2.5', installmentIndex: '1' })).ok,
    ).toBe(false)
  })

  it('rejects an index outside 1..total', () => {
    expect(
      buildInstallmentIntent(draft({ mode: 'new', totalCount: '12', installmentIndex: '13' })).ok,
    ).toBe(false)
    expect(
      buildInstallmentIntent(draft({ mode: 'new', totalCount: '12', installmentIndex: '0' })).ok,
    ).toBe(false)
  })

  it('rejects an existing-plan intent with no plan selected', () => {
    const result = buildInstallmentIntent(
      draft({ mode: 'existing', totalCount: '24', installmentIndex: '3', planId: null }),
    )
    expect(result).toEqual({ ok: false, error: 'Choose an installment plan' })
  })
})
