import { describe, expect, it, vi } from 'vitest'
import type { CaptureRepository } from '../ports/captureRepository'
import { DIAGNOSTICS_DAYS, STATUS_DAYS, captureStatus } from './captureStatusService'

const NOW = new Date('2026-11-13T10:00:00.000Z')

function repo(over: Partial<Record<'countedSources' | 'readCounters', ReturnType<typeof vi.fn>>> = {}) {
  const fns = {
    countedSources: vi.fn().mockResolvedValue(['bank-a', 'bank-b']),
    readCounters: vi.fn().mockResolvedValue([
      { source: 'bank-a', day: '2026-11-13', received: 4, unrecognised: 1 },
      { source: 'bank-a', day: '2026-11-07', received: 2, unrecognised: 2 },
      { source: 'bank-a', day: '2026-11-06', received: 9, unrecognised: 9 },
      { source: 'bank-b', day: '2026-10-20', received: 3, unrecognised: 0 },
    ]),
    readSourceOutcomes: vi
      .fn()
      .mockResolvedValue([
        { source: 'bank-b', recommended: 3, grouped: 1, addedAsIs: 2, edited: 0, linked: 0, dismissed: 1, open: 0 },
      ]),
    countMutedTemplates: vi.fn().mockResolvedValue([{ source: 'bank-a', muted: 2 }]),
    lastCaptureAt: vi.fn((_owner: string, source: string) =>
      Promise.resolve(source === 'bank-b' ? '2026-10-20T08:00:00.000Z' : null),
    ),
    ...over,
  }
  return { fns, captures: fns as unknown as CaptureRepository }
}

describe('captureStatus', () => {
  it('reads the 30 days of diagnostics, then gives the setup check only the last 7 of them', async () => {
    const { fns, captures } = repo()
    const status = await captureStatus(captures, 'me@example.com', undefined, undefined, NOW)

    expect(STATUS_DAYS).toBe(7)
    expect(DIAGNOSTICS_DAYS).toBe(30)
    expect(fns.readCounters).toHaveBeenCalledWith('me@example.com', '2026-10-15')
    expect(fns.readSourceOutcomes).toHaveBeenCalledWith('me@example.com', '2026-10-15')
    expect(status.sources).toEqual([
      {
        source: 'bank-a',
        lastCaptureAt: null,
        received: 6,
        unrecognised: 3,
        diagnostics: {
          received: 15,
          recommended: 0,
          grouped: 0,
          unread: 12,
          addedAsIs: 0,
          edited: 0,
          linked: 0,
          dismissed: 0,
          open: 0,
          muted: 2,
        },
      },
      {
        source: 'bank-b',
        lastCaptureAt: '2026-10-20T08:00:00.000Z',
        received: 0,
        unrecognised: 0,
        diagnostics: {
          received: 3,
          recommended: 3,
          grouped: 1,
          unread: 0,
          addedAsIs: 2,
          edited: 0,
          linked: 0,
          dismissed: 1,
          open: 0,
          muted: 0,
        },
      },
    ])
  })

  it('lists no source, and asks for no last capture, before anything was counted', async () => {
    const { fns, captures } = repo({
      countedSources: vi.fn().mockResolvedValue([]),
      readCounters: vi.fn().mockResolvedValue([]),
    })
    expect((await captureStatus(captures, 'me@example.com', undefined, undefined, NOW)).sources).toEqual([])
    expect(fns.lastCaptureAt).not.toHaveBeenCalled()
  })
})
