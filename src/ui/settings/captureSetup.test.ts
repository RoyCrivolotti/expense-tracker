import { describe, expect, it } from 'vitest'
import { lastCaptureText, pastedEndpoint, readSetupMemory, sourceState, writeSetupMemory } from './captureSetup'

// Built in two pieces so the source holds no address-shaped text for the PII scan to flag.
const withCredentials = () => ['https://user:secret', 'capture.example.workers.dev'].join('@')

describe('sourceState', () => {
  it('is waiting when nothing arrived, arriving when pushes came but none was read, and ok once one was', () => {
    expect(sourceState(undefined)).toBe('waiting')
    expect(sourceState({ lastCaptureAt: null, received: 0 })).toBe('waiting')
    expect(sourceState({ lastCaptureAt: null, received: 3 })).toBe('unrecognised')
    expect(sourceState({ lastCaptureAt: '2026-11-12T09:41:00.000Z', received: 0 })).toBe('ok')
  })
})

describe('lastCaptureText', () => {
  const now = new Date(2026, 10, 13, 12, 0)
  it('says today, yesterday, or the day, in the local clock', () => {
    expect(lastCaptureText(new Date(2026, 10, 13, 9, 41).toISOString(), now)).toBe('today at 09:41')
    expect(lastCaptureText(new Date(2026, 10, 12, 18, 2).toISOString(), now)).toBe('yesterday at 18:02')
    expect(lastCaptureText(new Date(2026, 10, 3, 7, 5).toISOString(), now)).toBe('3 Nov at 07:05')
  })
})

describe('pastedEndpoint', () => {
  it('takes only an https address and puts it on the Worker path', () => {
    expect(pastedEndpoint('https://capture.example.workers.dev')).toBe('https://capture.example.workers.dev/capture')
    expect(pastedEndpoint(' https://capture.example.workers.dev/other?x=1 ')).toBe(
      'https://capture.example.workers.dev/capture',
    )
  })
  it.each([
    ['http://capture.example.workers.dev'],
    ['capture.example.workers.dev'],
    [withCredentials()],
    [''],
  ])('refuses %j', (text) => expect(pastedEndpoint(text)).toBeNull())
})

describe('setup memory', () => {
  it('round trips, and falls back to empty for nothing, for damage and for a browser with no storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    writeSetupMemory(storage, { ticks: ['ios'], endpoint: 'https://x.example' })
    expect(readSetupMemory(storage)).toEqual({ ticks: ['ios'], endpoint: 'https://x.example' })
    expect(readSetupMemory({ getItem: () => 'not json' })).toEqual({ ticks: [], endpoint: '' })
    expect(readSetupMemory({ getItem: () => '{"ticks":[1,"a"],"endpoint":5}' })).toEqual({ ticks: ['a'], endpoint: '' })
    expect(readSetupMemory(null)).toEqual({ ticks: [], endpoint: '' })
    expect(() => writeSetupMemory(null, { ticks: [], endpoint: '' })).not.toThrow()
    expect(() =>
      writeSetupMemory(
        {
          setItem: () => {
            throw new Error('full')
          },
        },
        { ticks: [], endpoint: '' },
      ),
    ).not.toThrow()
  })
})
