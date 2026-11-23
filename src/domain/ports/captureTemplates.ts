import type { CaptureSource } from '../capture/types'

/** Templates one person may hold. At the cap, the least recently seen one nobody has accepted makes room. */
export const MAX_CAPTURE_TEMPLATES = 500

/** Templates of one title a new push is compared with, the most recently seen first. */
export const TEMPLATE_LOOKUP_LIMIT = 50

/** A template as a new push is matched against it. */
export interface CaptureTemplate {
  templateId: string
  /** The masked words, with `<M>` where the merchant goes once a sibling push has shown it. */
  skeleton: string
  /** The `<M>` token's run in `skeleton`, end exclusive. Null until known. */
  merchantStart: number | null
  merchantEnd: number | null
  /** When the person's dismissals muted it. Its pushes are then counted and never stored. */
  ignoredAt: string | null
}

/** The most ignored templates one list returns. A person holds at most `MAX_CAPTURE_TEMPLATES` in all. */
export const MAX_IGNORED_LISTED = 100

/** A template the person's dismissals muted, as the list of them shows it: its masked words, never a push's body. */
export interface IgnoredTemplate {
  templateId: string
  source: CaptureSource
  skeleton: string
  seen: number
  dismissals: number
  ignoredAt: string
}

/** The run a template has just learned from a sibling push, and its skeleton rewritten with the wildcard there. */
export interface LearnedRun {
  start: number
  end: number
  skeleton: string
}

/**
 * Which template a push joins, decided before the write so the batch that stores the push stores the template
 * change with it. A new template takes its owner, source and dates from the event. `none` is for a push whose
 * template would be too large to keep.
 */
export type TemplateDecision =
  | { kind: 'existing'; templateId: string; learnedRun?: LearnedRun }
  | { kind: 'new'; template: { templateId: string; title: string; skeleton: string } }
  | { kind: 'none' }

/** The templates pushes are matched against, and the ones the person muted. */
export interface CaptureTemplateStore {
  /**
   * The owner's templates for this source and masked title, at most `TEMPLATE_LOOKUP_LIMIT`, the most recently seen
   * first.
   */
  findTemplates(
    owner: string,
    source: CaptureSource,
    title: string,
  ): Promise<CaptureTemplate[]>
  /**
   * Counts a push of an ignored template, in one batch: as unrecognised on the owner's counter for `day`, and as seen
   * on the template, which stays ignored. Nothing of the push is stored.
   */
  countIgnoredPush(
    owner: string,
    source: CaptureSource,
    day: string,
    templateId: string,
    at: string,
  ): Promise<void>
  /** The owner's ignored templates, the most recently ignored first, at most `MAX_IGNORED_LISTED`. */
  listIgnoredTemplates(owner: string): Promise<IgnoredTemplate[]>
  /**
   * Makes the template suggest again: clears its ignore and its dismissal streak, so three more dismissals in a row are
   * needed to mute it again. False when the owner holds no such template.
   */
  unignoreTemplate(
    owner: string,
    templateId: string,
  ): Promise<boolean>
}
