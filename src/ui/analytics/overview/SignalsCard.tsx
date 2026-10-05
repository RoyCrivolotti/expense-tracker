import type { AnalyticsSignal } from '../../../engine'
import { formatCentsCompact, fullMonthLabel } from '../../../engine'
import type { MoneyFormat } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import type { AnalyticsView } from '../analyticsView'
import styles from './overview.module.css'

interface Sentence {
  title: string
  body: string
  go: string
  view: AnalyticsView
}

function sentenceOf(signal: AnalyticsSignal, format: MoneyFormat): Sentence {
  if (signal.kind === 'pace') {
    const over = signal.projectedCents > signal.flexibleBudgetCents
    return {
      title: over ? 'Flexible spending is ahead of pace' : 'Flexible spending is on pace',
      body: `Day ${signal.dayOfMonth} of ${signal.daysInMonth}: at this rate the month ends near ${formatCentsCompact(signal.projectedCents, format)} against ${formatCentsCompact(signal.flexibleBudgetCents, format)}.`,
      go: 'See the month',
      view: 'spending',
    }
  }
  if (signal.kind === 'mover') {
    const up = signal.currentCents > signal.baselineCents
    return {
      title: `${signal.name} is ${signal.pct}% ${up ? 'above' : 'below'} your 3-month average`,
      body: `${formatCentsCompact(signal.currentCents, format)} against about ${formatCentsCompact(signal.baselineCents, format)} for the same stretch.`,
      go: `Open ${signal.name}`,
      view: 'spending',
    }
  }
  return {
    title: `${fullMonthLabel(signal.month)} is ready to count`,
    body: 'Its card statements are paid. Enter the cash you hold to close the month.',
    go: 'Reconcile',
    view: 'cash',
  }
}

/** Up to three sentences computed from the numbers, each opening the place to act. */
export function SignalsCard({
  signals,
  onShowView,
}: {
  signals: AnalyticsSignal[]
  onShowView: (view: AnalyticsView) => void
}) {
  const format = useMoneyFormat()
  if (signals.length === 0) return null
  return (
    <div className={styles.signalRow}>
      {signals.map((signal) => {
        const s = sentenceOf(signal, format)
        return (
          <Card key={`${signal.kind}-${s.title}`} className={styles.signalCard}>
            <span className={`${styles.signalDot} ${styles[`tone_${signal.tone}`]}`} aria-hidden />
            <h4 className={styles.signalTitle}>{s.title}</h4>
            <p className={styles.signalBody}>{s.body}</p>
            <button type="button" className={styles.signalGo} onClick={() => onShowView(s.view)}>
              {s.go}
            </button>
          </Card>
        )
      })}
    </div>
  )
}
