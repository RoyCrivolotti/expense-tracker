import { beforeEach, describe, expect, it } from 'vitest'
import { clearOnboardingSkip, isOnboardingSkipped, skipOnboarding } from './onboardingStorage'

describe('the setup a person skipped', () => {
  beforeEach(() => localStorage.clear())

  it('is skipped for that person and not for the next one on the browser', () => {
    skipOnboarding('alice@example.com')

    expect(isOnboardingSkipped('alice@example.com')).toBe(true)
    expect(isOnboardingSkipped('bob@example.com')).toBe(false)
    expect(isOnboardingSkipped()).toBe(false)
  })

  it('is taken back for that person only', () => {
    skipOnboarding('alice@example.com')
    skipOnboarding('bob@example.com')

    clearOnboardingSkip('alice@example.com')

    expect(isOnboardingSkipped('alice@example.com')).toBe(false)
    expect(isOnboardingSkipped('bob@example.com')).toBe(true)
  })

  it('is one flag for the device when no one is signed in, as the demo is', () => {
    skipOnboarding()
    expect(isOnboardingSkipped()).toBe(true)
  })
})
