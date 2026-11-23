import { Suspense, lazy, useState } from 'react'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { useHistoryWatch, useWaitingForHistory } from '../useHistoryWatch'
import { useReviewCore, type ReviewCore } from './reviewContext'
import { useHoldReloads } from './useReloadOnReturn'

// Its own chunk, fetched only when there is a payment to show: most visits have none, and the budget check measures it
// apart from the rest of the app.
const ReviewCard = lazy(() => import('./ReviewCard'))

/**
 * The "To review" card at the top of the Dashboard. Nothing at all while there is nothing to review, except that it
 * stays mounted while the queue sheet is open and until the sheet has left, so deciding the last payment in the
 * sheet shows "All caught up" and the sheet slides away instead of vanishing.
 */
export function ReviewCardSlot() {
  const core = useReviewCore()
  const [sheet, setSheet] = useState(false)
  useHoldReloads(sheet)
  return core ? <Slot core={core} sheet={sheet} onSheet={setSheet} /> : null
}

function Slot({ core, sheet, onSheet }: { core: ReviewCore; sheet: boolean; onSheet: (open: boolean) => void }) {
  const open = core.items.length > 0
  // A payment's monthly-series hint is worked out from the whole history. Shown after the row, it would push the
  // buttons down under a finger, so the card waits for the history (watched here, as the card is not mounted yet).
  useHistoryWatch(core.model, open)
  const waiting = useWaitingForHistory(core.model, open)
  return (
    <Presence show={(open && !waiting) || sheet} exitMs={EXIT_MS.sheet}>
      <ChunkBoundary fallback={null}>
        <Suspense fallback={null}>
          <ReviewCard core={core} sheet={sheet} onSheet={onSheet} />
        </Suspense>
      </ChunkBoundary>
    </Presence>
  )
}
