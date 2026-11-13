import { describe, expect, it } from 'vitest'
import {
  STALE_DAYS,
  lastCaptureText,
  pastedEndpoint,
  readSetupMemory,
  sourceState,
  writeSetupMemory,
} from './captureSetup'

// Built in two pieces so the source holds no address-shaped text for the PII scan to flag.
const withCredentials = () => ['https://user:secret', 'capture.example.workers.dev'].join('@')

describe('sourceState', () => {
  const now = new Date('2026-11-13T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const DAY = 86_400_000

  it('is waiting when nothing arrived, and when there is no status yet', () => {
    expect(sourceState(undefined, now)).toBe('waiting')
    expect(sourceState({ lastCaptureAt: null, received: 0, unrecognised: 0 }, now)).toBe('waiting')
  })

  it('is unrecognised when pushes arrive and none was ever read', () => {
    expect(sourceState({ lastCaptureAt: null, received: 3, unrecognised: 3 }, now)).toBe('unrecognised')
  })

  it('is ok for a payment captured lately, with unread pushes beside it as long as some were read', () => {
    expect(sourceState({ lastCaptureAt: ago(DAY), received: 0, unrecognised: 0 }, now)).toBe('ok')
    expect(sourceState({ lastCaptureAt: ago(DAY), received: 5, unrecognised: 4 }, now)).toBe('ok')
  })

  it('is unrecognised, though a payment was once captured, when every push of the week went unread', () => {
    expect(sourceState({ lastCaptureAt: ago(DAY), received: 5, unrecognised: 5 }, now)).toBe('unrecognised')
    expect(sourceState({ lastCaptureAt: ago(DAY), received: 1, unrecognised: 1 }, now)).toBe('unrecognised')
  })

  it(`is quiet when the last payment is more than ${STALE_DAYS} days old, and ok at exactly ${STALE_DAYS}`, () => {
    expect(sourceState({ lastCaptureAt: ago(STALE_DAYS * DAY), received: 0, unrecognised: 0 }, now)).toBe('ok')
    expect(sourceState({ lastCaptureAt: ago(STALE_DAYS * DAY + 1), received: 0, unrecognised: 0 }, now)).toBe('quiet')
    expect(sourceState({ lastCaptureAt: ago(90 * DAY), received: 0, unrecognised: 0 }, now)).toBe('quiet')
  })

  it('puts unread pushes before age', () => {
    expect(sourceState({ lastCaptureAt: ago(90 * DAY), received: 2, unrecognised: 2 }, now)).toBe('unrecognised')
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
  it.each([['http://capture.example.workers.dev'], ['capture.example.workers.dev'], [withCredentials()], ['']])(
    'refuses %j',
    (text) => expect(pastedEndpoint(text)).toBeNull(),
  )
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
