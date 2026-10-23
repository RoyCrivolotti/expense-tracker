import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OWNER_KEYS, forgetUnownedSettings, ownerKey } from './accountOwner'

describe('ownerKey', () => {
  it('names the person, and is the bare key when no one is signed in', () => {
    expect(ownerKey('base', 'alice@example.com')).toBe('base:alice@example.com')
    expect(ownerKey('base', undefined)).toBe('base')
    expect(ownerKey('base', '')).toBe('base')
  })
})

describe('forgetUnownedSettings', () => {
  beforeEach(() => localStorage.clear())

  it('removes what is kept under the keys that name no one, and nothing else', () => {
    for (const key of Object.values(OWNER_KEYS)) localStorage.setItem(key, 'x')
    localStorage.setItem(`${OWNER_KEYS.stopped}:alice@example.com`, '{}')
    localStorage.setItem('exp-theme', 'dark')

    forgetUnownedSettings()

    for (const key of Object.values(OWNER_KEYS)) expect(localStorage.getItem(key)).toBeNull()
    expect(localStorage.getItem(`${OWNER_KEYS.stopped}:alice@example.com`)).toBe('{}')
    expect(localStorage.getItem('exp-theme')).toBe('dark')
  })

  it('does not fail when the browser refuses to remove', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => forgetUnownedSettings()).not.toThrow()
    vi.restoreAllMocks()
  })
})
