import { TIP_IDS } from '../../domain/onboarding/tips'
import { useIsMobile } from '../hooks/useIsMobile'
import { TipCard } from '../tips/TipCard'

/** The first visit to Analytics with data in it: what the page answers, and that it needs a few weeks of entries to say much. */
export function AnalyticsIntro() {
  const tap = useIsMobile() ? 'Tap' : 'Click'
  return (
    <TipCard id={TIP_IDS.analytics} title="Analytics">
      <p>Where the month&apos;s money went, by category, compared with last month, a three-month average or last year.</p>
      <p>Open Spending, then {tap.toLowerCase()} a category to see the payments behind it.</p>
      <p>It gets more useful after a couple of weeks of entries.</p>
    </TipCard>
  )
}
