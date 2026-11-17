import type { CaptureSource } from '../capture/types'

/** What became of one source's stored pushes over a window: the outcome each decision wrote, and how many are open. */
export interface SourceOutcomes {
  source: CaptureSource
  /** Pushes stored that made a recommendation. */
  recommended: number
  /** Pushes stored that joined a recommendation another push of the same movement made. */
  grouped: number
  addedAsIs: number
  edited: number
  linked: number
  dismissed: number
  open: number
}

export interface MutedCount {
  source: CaptureSource
  muted: number
}

/** The counts the setup and diagnostics screens read. Counts only: none of them returns a push's words. */
export interface CaptureStatusReads {
  /** Every source word the person's pushes were ever counted under, in order. */
  countedSources(owner: string): Promise<CaptureSource[]>
  /** Per source, the pushes stored since `fromDay` (UTC, inclusive) and what became of them. Sources with none are absent. */
  readSourceOutcomes(owner: string, fromDay: string): Promise<SourceOutcomes[]>
  /** Per source, the person's templates muted by their dismissals. Sources with none are absent. */
  countMutedTemplates(owner: string): Promise<MutedCount[]>
}
