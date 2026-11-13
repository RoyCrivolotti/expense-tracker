import { describe, expect, it, vi } from 'vitest'
import { CAPTURE_FLAG_KEY, captureEnabled, readCaptureFlag, setCaptureFlag } from './captureFlag'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('readCaptureFlag', () => {
  it('is off when nothing was asked for', () => {
    expect(readCaptureFlag({ search: '', storage: memoryStorage() })).toBe(false)
    expect(readCaptureFlag({ search: '', storage: null })).toBe(false)
  })

  it('turns on from the address and keeps it', () => {
    const storage = memoryStorage()

    expect(readCaptureFlag({ search: '?capture=on', storage })).toBe(true)
    expect(readCaptureFlag({ search: '', storage })).toBe(true)
  })

  it('turns off from the address and keeps that too', () => {
    const storage = memoryStorage({ [CAPTURE_FLAG_KEY]: 'on' })

    expect(readCaptureFlag({ search: '?capture=off', storage })).toBe(false)
    expect(readCaptureFlag({ search: '', storage })).toBe(false)
  })

  it('ignores any other value', () => {
    const storage = memoryStorage({ [CAPTURE_FLAG_KEY]: 'on' })

    expect(readCaptureFlag({ search: '?capture=yes', storage })).toBe(true)
    expect(readCaptureFlag({ search: '?capture=yes', storage: memoryStorage() })).toBe(false)
  })

  it('goes by the address alone when the browser refuses storage', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(readCaptureFlag({ search: '?capture=on', storage: refusing })).toBe(true)
    expect(readCaptureFlag({ search: '', storage: refusing })).toBe(false)
  })
})

describe('captureEnabled', () => {
  it('reads the page’s own address and storage', () => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '/?capture=on')

    expect(captureEnabled()).toBe(true)

    window.history.replaceState(null, '', '/')
    expect(captureEnabled()).toBe(true)
    window.localStorage.clear()
    expect(captureEnabled()).toBe(false)
  })

  it('is off when reading localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    window.history.replaceState(null, '', '/')

    expect(captureEnabled()).toBe(false)
    vi.restoreAllMocks()
  })
})

describe('setCaptureFlag', () => {
  it('keeps the choice so the next read sees it', () => {
    const storage = memoryStorage()

    expect(setCaptureFlag(true, storage)).toBe(true)
    expect(readCaptureFlag({ search: '', storage })).toBe(true)
    expect(setCaptureFlag(false, storage)).toBe(true)
    expect(readCaptureFlag({ search: '', storage })).toBe(false)
  })

  it('says false when there is no storage or it refuses', () => {
    expect(setCaptureFlag(true, null)).toBe(false)
    expect(
      setCaptureFlag(true, {
        setItem: () => {
          throw new Error('full')
        },
      }),
    ).toBe(false)
  })
})
