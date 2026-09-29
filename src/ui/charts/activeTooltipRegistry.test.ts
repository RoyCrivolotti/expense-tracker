import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  claimActiveTooltip,
  releaseActiveTooltip,
  __resetActiveTooltipRegistryForTests,
} from './activeTooltipRegistry'

describe('activeTooltipRegistry', () => {
  beforeEach(() => {
    __resetActiveTooltipRegistryForTests()
  })

  it('closes the previous owner when a new one claims', () => {
    const dismissA = vi.fn()
    const dismissB = vi.fn()

    claimActiveTooltip(dismissA)
    expect(dismissA).not.toHaveBeenCalled()

    claimActiveTooltip(dismissB)
    expect(dismissA).toHaveBeenCalledTimes(1)
    expect(dismissB).not.toHaveBeenCalled()
  })

  it('is a no-op when the current owner re-claims with the same reference', () => {
    const dismiss = vi.fn()

    claimActiveTooltip(dismiss)
    claimActiveTooltip(dismiss)

    expect(dismiss).not.toHaveBeenCalled()
  })

  it('release from a non-owner does nothing', () => {
    const dismissA = vi.fn()
    const dismissB = vi.fn()

    claimActiveTooltip(dismissA)
    releaseActiveTooltip(dismissB)

    // A is still the owner: claiming with a third dismiss still closes A.
    const dismissC = vi.fn()
    claimActiveTooltip(dismissC)
    expect(dismissA).toHaveBeenCalledTimes(1)
  })

  it('release from the owner clears the claim so a later claim does not call it', () => {
    const dismissA = vi.fn()
    const dismissB = vi.fn()

    claimActiveTooltip(dismissA)
    releaseActiveTooltip(dismissA)
    claimActiveTooltip(dismissB)

    expect(dismissA).not.toHaveBeenCalled()
  })
})
