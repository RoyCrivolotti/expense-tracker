import { describe, expectTypeOf, it } from 'vitest'
import type { CaptureCardLinks } from './captureCards'
import type { CaptureCounters, CaptureEventLog } from './captureEvents'
import type { CaptureKeyStore } from './captureKeys'
import type { CaptureLearningStore } from './captureLearning'
import type { CaptureRecommendationStore } from './captureRecommendations'
import type { CaptureRepository } from './captureRepository'
import type { CaptureStatusReads } from './captureStatusReads'
import type { CaptureTemplateStore } from './captureTemplates'

type Roles = {
  keys: CaptureKeyStore
  events: CaptureEventLog
  counters: CaptureCounters
  cards: CaptureCardLinks
  status: CaptureStatusReads
  recommendations: CaptureRecommendationStore
  templates: CaptureTemplateStore
  learning: CaptureLearningStore
}

/** The names two roles both declare, per pair. `never` for every pair means no method sits in two roles. */
type Shared = {
  [A in keyof Roles]: { [B in keyof Roles]: A extends B ? never : keyof Roles[A] & keyof Roles[B] }[keyof Roles]
}[keyof Roles]

/**
 * Every method of the port, once. `satisfies` makes the type checker reject a name the port lacks and a method
 * missing here, so this list cannot drift from the port.
 */
export const PORT_METHODS = {
  createKey: true,
  findKey: true,
  listKeys: true,
  revokeKey: true,
  touchKey: true,
  recordEvent: true,
  recordCapture: true,
  hasEvent: true,
  admit: true,
  eventsSince: true,
  lastCaptureAt: true,
  bumpCounter: true,
  readCounters: true,
  saveCard: true,
  linkCard: true,
  unlinkCard: true,
  listWaitingCards: true,
  listCards: true,
  countedSources: true,
  readSourceOutcomes: true,
  countMutedTemplates: true,
  createRecommendation: true,
  getRecommendation: true,
  listOpenRecommendations: true,
  findPossibleMatch: true,
  countOpenRecommendations: true,
  summarizeOpen: true,
  decideRecommendation: true,
  findTemplates: true,
  countIgnoredPush: true,
  listIgnoredTemplates: true,
  unignoreTemplate: true,
  eventOfRecommendation: true,
  applyDecisionLearning: true,
  merchantRows: true,
} satisfies Record<keyof CaptureRepository, true>

describe('CaptureRepository roles', () => {
  it('gives no method to two roles', () => {
    expectTypeOf<Shared>().toEqualTypeOf<never>()
  })
})
