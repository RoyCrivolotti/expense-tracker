import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import { COUNTED_SOURCES_SQL, MUTED_TEMPLATES_SQL, SOURCE_OUTCOMES_SQL } from '../capture/captureStatusSql'
import { rows } from './d1CaptureSupport'

interface OutcomeRow {
  source: string
  recommended: number
  grouped: number
  added_as_is: number
  edited: number
  linked: number
  dismissed: number
  open: number
}

export function status(db: D1Database): Pick<CaptureRepository, 'countedSources' | 'readSourceOutcomes' | 'countMutedTemplates'> {
  return {
    countedSources: async (owner) => (await rows<{ source: string }>(db, COUNTED_SOURCES_SQL, owner)).map((r) => r.source),
    readSourceOutcomes: async (owner, fromDay) =>
      (await rows<OutcomeRow>(db, SOURCE_OUTCOMES_SQL, owner, fromDay)).map((r) => ({
        source: r.source,
        recommended: r.recommended,
        grouped: r.grouped,
        addedAsIs: r.added_as_is,
        edited: r.edited,
        linked: r.linked,
        dismissed: r.dismissed,
        open: r.open,
      })),
    countMutedTemplates: async (owner) => rows<{ source: string; muted: number }>(db, MUTED_TEMPLATES_SQL, owner),
  }
}
