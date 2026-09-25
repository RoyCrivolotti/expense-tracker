import { useEffect, useRef } from 'react'
import { INFLATION_MAX, INFLATION_MIN } from '../../engine'
import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import { PercentStepper } from '../components/PercentStepper'
import { useSavedInflation } from '../hooks/useSavedInflation'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
  /** Bring the card into view when it opens, for the link that sends someone here. */
  scrollIntoView?: boolean
}

/**
 * The one place the Goals tab's inflation is set. It is the owner's setting, not a
 * scenario's and not a chart's: check-ins, the house and the mortgage are brought back to
 * today's money by it, and the Nominal view inflates the plan by it, so every view agrees.
 * The chart's Nominal view can preview another rate, but never saves one. It sits with the
 * other assumptions Progress is measured with, and saves the way they do.
 */
export function InflationSetting({ settings, onChange, scrollIntoView = false }: Props) {
  const { draft, error, step } = useSavedInflation(settings.assumedInflation, onChange)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Not every environment has it (jsdom does not).
    if (scrollIntoView) card.current?.scrollIntoView?.({ block: 'center' })
  }, [scrollIntoView])

  return (
    <div ref={card}>
      <Card>
        <h3 className={goalStyles.sectionTitle}>Assumed inflation</h3>
        <div className={styles.settingGroup}>
          <div className={styles.defaultAccountField}>
            <span className={styles.defaultAccountLabel}>Yearly inflation the plan assumes</span>
            <PercentStepper
              value={draft}
              onChange={step}
              min={INFLATION_MIN}
              max={INFLATION_MAX}
              ariaLabel="Assumed inflation"
            />
          </div>
          {error ? (
            <p className={styles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          <p className={styles.settingHint}>
            Goals is in today&apos;s money. Check-ins, the house and the mortgage are brought back to
            today&apos;s money at this rate, and the Nominal view inflates the plan by it.
          </p>
        </div>
      </Card>
    </div>
  )
}
