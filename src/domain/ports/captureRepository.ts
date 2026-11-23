import type { CaptureCardLinks } from './captureCards'
import type { CaptureCounters, CaptureEventLog } from './captureEvents'
import type { CaptureKeyStore } from './captureKeys'
import type { CaptureLearningStore } from './captureLearning'
import type { CaptureRecommendationStore } from './captureRecommendations'
import type { CaptureStatusReads } from './captureStatusReads'
import type { CaptureTemplateStore } from './captureTemplates'

/**
 * Persistence for capture. Every method is scoped by owner, except those that start from a key (a request
 * is identified by its key, and the key row names the owner). Times are ISO strings in UTC, passed in so
 * nothing here reads a clock.
 */
export interface CaptureRepository
  extends
    CaptureKeyStore,
    CaptureEventLog,
    CaptureCounters,
    CaptureCardLinks,
    CaptureStatusReads,
    CaptureRecommendationStore,
    CaptureTemplateStore,
    CaptureLearningStore {}
