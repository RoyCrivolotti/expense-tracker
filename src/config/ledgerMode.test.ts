import { describe, expect, it } from 'vitest'
import { LEDGER_MODE_KEY, currentLedgerMode, readLedgerMode } from './ledgerMode'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const mode = (search: string, stored: Record<string, string> = {}, checking = false) => {
  const storage = memoryStorage(stored)
  return { result: readLedgerMode({ checking, search, storage }), storage }
}

describe('readLedgerMode', () => {
  it('is on unless it was turned off', () => {
    expect(mode('').result).toBe('on')
    expect(mode('?other=1').result).toBe('on')
    expect(mode('', { [LEDGER_MODE_KEY]: 'nonsense' }).result).toBe('on')
  })

  it('turns on from the address, and keeps it for the next visit', () => {
    const { result, storage } = mode('?ledger=on')
    expect(result).toBe('on')
    expect(storage.data.get(LEDGER_MODE_KEY)).toBe('on')
    expect(readLedgerMode({ checking: false, search: '', storage })).toBe('on')
  })

  it('turns off from the address, and keeps it off: nothing kept would mean on', () => {
    const { result, storage } = mode('?ledger=off', { [LEDGER_MODE_KEY]: 'on' })
    expect(result).toBe('off')
    expect(storage.data.get(LEDGER_MODE_KEY)).toBe('off')
    expect(readLedgerMode({ checking: false, search: '', storage })).toBe('off')
    expect(readLedgerMode({ checking: false, search: '?ledger=on', storage })).toBe('on')
  })

  it('lets the address override what was kept', () => {
    expect(mode('?ledger=on', { [LEDGER_MODE_KEY]: 'shadow' }, true).result).toBe('on')
    expect(mode('?ledger=off', { [LEDGER_MODE_KEY]: 'on' }, true).result).toBe('off')
  })

  it('allows shadow only in a development or staging build, where anywhere else it is on', () => {
    expect(mode('?ledger=shadow', {}, true).result).toBe('shadow')
    expect(mode('', { [LEDGER_MODE_KEY]: 'shadow' }, true).result).toBe('shadow')
    expect(mode('?ledger=shadow', {}, false).result).toBe('on')
    expect(mode('', { [LEDGER_MODE_KEY]: 'shadow' }, false).result).toBe('on')
  })

  it('keeps only what the address said when storage refuses, and is on when it said nothing', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    const refusing = { getItem: blocked, setItem: blocked }
    expect(readLedgerMode({ checking: false, search: '?ledger=off', storage: refusing })).toBe('off')
    expect(readLedgerMode({ checking: false, search: '', storage: refusing })).toBe('on')
    expect(readLedgerMode({ checking: false, search: '?ledger=off', storage: null })).toBe('off')
    expect(readLedgerMode({ checking: false, search: '', storage: null })).toBe('on')
  })
})

describe('currentLedgerMode', () => {
  it('reads this page, and is on in a browser that has not been asked', () => {
    window.localStorage.removeItem(LEDGER_MODE_KEY)
    expect(currentLedgerMode()).toBe('on')
    window.localStorage.setItem(LEDGER_MODE_KEY, 'off')
    expect(currentLedgerMode()).toBe('off')
    window.localStorage.removeItem(LEDGER_MODE_KEY)
  })
})
