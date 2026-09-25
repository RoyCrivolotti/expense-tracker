import { useEffect, useRef } from 'react'
import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import { InflationStepper } from './InflationStepper'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
  /** Bring the card into view when it opens, for the link that sends someone here. */
  scrollIntoView?: boolean
}

/**
 * Where the Goals tab's inflation is explained and set, with the stepper it shares with the
 * chart. It is the owner's setting, not a scenario's and not a chart's: check-ins, the house
 * and the mortgage are brought back to today's money by it, and the Nominal view inflates the
 * plan by it, so every view agrees. It sits with the other assumptions Progress is measured
 * with, and saves the way they do.
 */
export function InflationSetting({ settings, onChange, scrollIntoView = false }: Props) {
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
            <InflationStepper settings={settings} onChange={onChange} />
          </div>
          <p className={styles.settingHint}>
            Goals is in today&apos;s money. Check-ins, the house and the mortgage are brought back to
            today&apos;s money at this rate, and the Nominal view inflates the plan by it.
          </p>
        </div>
      </Card>
    </div>
  )
}
