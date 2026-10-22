import { describe, expect, it } from 'vitest'
import { LEDGER_MODE_KEY, currentLedgerMode, readLedgerMode } from './ledgerMode'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const mode = (search: string, stored: Record<string, string> = {}, checking = false) => {
  const storage = memoryStorage(stored)
  return { result: readLedgerMode({ checking, search, storage }), storage }
}

describe('readLedgerMode', () => {
  it('is off unless asked for', () => {
    expect(mode('').result).toBe('off')
    expect(mode('?other=1').result).toBe('off')
    expect(mode('', { [LEDGER_MODE_KEY]: 'nonsense' }).result).toBe('off')
  })

  it('turns on from the address, and keeps it for the next visit', () => {
    const { result, storage } = mode('?ledger=on')
    expect(result).toBe('on')
    expect(storage.data.get(LEDGER_MODE_KEY)).toBe('on')
    expect(readLedgerMode({ checking: false, search: '', storage })).toBe('on')
  })

  it('turns off from the address, and forgets it', () => {
    const { result, storage } = mode('?ledger=off', { [LEDGER_MODE_KEY]: 'on' })
    expect(result).toBe('off')
    expect(storage.data.has(LEDGER_MODE_KEY)).toBe(false)
  })

  it('lets the address override what was kept', () => {
    expect(mode('?ledger=on', { [LEDGER_MODE_KEY]: 'shadow' }, true).result).toBe('on')
  })

  it('allows shadow only in a development or staging build', () => {
    expect(mode('?ledger=shadow', {}, true).result).toBe('shadow')
    expect(mode('', { [LEDGER_MODE_KEY]: 'shadow' }, true).result).toBe('shadow')
    expect(mode('?ledger=shadow', {}, false).result).toBe('off')
    expect(mode('', { [LEDGER_MODE_KEY]: 'shadow' }, false).result).toBe('off')
  })

  it('keeps only what the address said when storage refuses', () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readLedgerMode({ checking: false, search: '?ledger=on', storage: refusing })).toBe('on')
    expect(readLedgerMode({ checking: false, search: '', storage: refusing })).toBe('off')
    expect(readLedgerMode({ checking: false, search: '?ledger=on', storage: null })).toBe('on')
    expect(readLedgerMode({ checking: false, search: '', storage: null })).toBe('off')
  })
})

describe('currentLedgerMode', () => {
  it('reads this page, and is off in a browser that has not been asked', () => {
    window.localStorage.removeItem(LEDGER_MODE_KEY)
    expect(currentLedgerMode()).toBe('off')
    window.localStorage.setItem(LEDGER_MODE_KEY, 'on')
    expect(currentLedgerMode()).toBe('on')
    window.localStorage.removeItem(LEDGER_MODE_KEY)
  })
})
