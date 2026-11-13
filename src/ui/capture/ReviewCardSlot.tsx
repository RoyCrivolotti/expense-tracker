import { Suspense, lazy, useState } from 'react'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { useReviewCore } from './reviewContext'

// Its own chunk, fetched only when there is a payment to show: most people never turn the capture flag on.
const ReviewCard = lazy(() => import('./ReviewCard'))

/**
 * The "To review" card at the top of the Dashboard. Nothing at all while there is nothing to review, except that it
 * stays mounted while the queue sheet is open and until the sheet has left, so deciding the last payment in the
 * sheet shows "All caught up" and the sheet slides away instead of vanishing.
 */
export function ReviewCardSlot() {
  const core = useReviewCore()
  const [sheet, setSheet] = useState(false)
  if (!core) return null
  return (
    <Presence show={core.items.length > 0 || sheet} exitMs={EXIT_MS.sheet}>
      <ChunkBoundary fallback={null}>
        <Suspense fallback={null}>
          <ReviewCard core={core} sheet={sheet} onSheet={setSheet} />
        </Suspense>
      </ChunkBoundary>
    </Presence>
  )
}
