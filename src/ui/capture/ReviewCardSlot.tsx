import { Suspense, lazy } from 'react'
import { ChunkBoundary } from '../components/ChunkBoundary'
import { useReviewCore } from './reviewContext'

// Its own chunk, fetched only when there is a payment to show: most people never turn the capture flag on.
const ReviewCard = lazy(() => import('./ReviewCard'))

/** The "To review" card at the top of the Dashboard. Nothing at all while there is nothing to review. */
export function ReviewCardSlot() {
  const core = useReviewCore()
  if (!core || core.items.length === 0) return null
  return (
    <ChunkBoundary fallback={null}>
      <Suspense fallback={null}>
        <ReviewCard core={core} />
      </Suspense>
    </ChunkBoundary>
  )
}
