import type { CaptureCounters, CaptureEventLog } from '../../../src/domain/ports/captureEvents'
import {
  eventParams,
  BUMP_COUNTER_SQL,
  ADMIT_SQL,
  SOURCE_FULL_SQL,
  EVENTS_SINCE_SQL,
  HAS_EVENT_SQL,
  LAST_CAPTURE_SQL,
  READ_COUNTERS_SQL,
  RECORD_EVENT_SQL,
} from '../capture/captureEventsSql'
import { recordCapture } from './d1CaptureWrites'
import { changed, rows } from './d1CaptureSupport'

export function events(db: D1Database): CaptureEventLog {
  return {
    recordEvent: (
      event,
      caps,
    ) => changed(db, RECORD_EVENT_SQL, ...eventParams(event, null, caps)),
    recordCapture: (
      event,
      rec,
      caps,
      template = { kind: 'none' },
    ) => recordCapture(db, event, rec, caps, template),
    hasEvent: async (
      keyId,
      source,
      replayKey,
    ) => (await db.prepare(HAS_EVENT_SQL).bind(keyId, source, replayKey).first()) !== null,
    admit: async (
      owner,
      source,
      day,
      caps,
    ) => {
      if (await changed(db, ADMIT_SQL, owner, source, day, caps.perOwner, caps.global, caps.sourcesPerOwner))
        return 'admitted'
      const full = await db.prepare(SOURCE_FULL_SQL).bind(owner, source, caps.sourcesPerOwner).first()
      return full === null ? 'limited' : 'sources'
    },
    eventsSince: async (
      keyId,
      since,
    ) => {
      const row = await db.prepare(EVENTS_SINCE_SQL).bind(keyId, since).first<{ n: number }>()
      return row?.n ?? 0
    },
    lastCaptureAt: async (
      owner,
      source,
    ) => {
      const row = await db.prepare(LAST_CAPTURE_SQL).bind(owner, source).first<{ at: string | null }>()
      return row?.at ?? null
    },
  }
}

/** Per owner, source and day: how many pushes arrived, and how many of those were unrecognised or malformed. */
export function counters(db: D1Database): CaptureCounters {
  return {
    bumpCounter: async (
      owner,
      source,
      day,
      field,
    ) => {
      await changed(db, BUMP_COUNTER_SQL[field], owner, source, day)
    },
    readCounters: async (
      owner,
      fromDay,
    ) =>
      (
        await rows<{ source: string; day: string; received: number; unrecognised: number; malformed: number }>(
          db,
          READ_COUNTERS_SQL,
          owner,
          fromDay,
        )
      ).map((r) => ({
        source: r.source,
        day: r.day,
        received: r.received,
        unrecognised: r.unrecognised,
        malformed: r.malformed,
      })),
  }
}
