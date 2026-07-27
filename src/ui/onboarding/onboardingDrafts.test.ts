import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CATEGORY_PRESETS } from '../../domain/onboarding/presets'
import { useCategoryDrafts } from './onboardingDrafts'

describe('useCategoryDrafts', () => {
  it('starts every preset checked on a first run (no existing categories)', () => {
    const { result } = renderHook(() => useCategoryDrafts(undefined, false))
    const [drafts] = result.current
    expect(drafts).toHaveLength(CATEGORY_PRESETS.length)
    expect(drafts.every((d) => d.selected)).toBe(true)
  })

  it('starts every preset unchecked on re-entry (tenant already has categories)', () => {
    const { result } = renderHook(() => useCategoryDrafts(undefined, true))
    const [drafts] = result.current
    expect(drafts).toHaveLength(CATEGORY_PRESETS.length)
    expect(drafts.every((d) => !d.selected)).toBe(true)
  })

  it('defaults hasExistingCategories to false when omitted, matching first-run behavior', () => {
    const { result } = renderHook(() => useCategoryDrafts())
    const [drafts] = result.current
    expect(drafts.every((d) => d.selected)).toBe(true)
  })
})
