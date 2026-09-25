import { useCallback, useEffect, useRef, useState } from 'react'
import { INFLATION_MAX, INFLATION_MIN } from '../../engine'
import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import { PercentStepper } from '../components/PercentStepper'
import { failureMessage } from '../hooks/useFailureToast'
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
 * It sits with the other assumptions Progress is measured with, and saves the way they do.
 *
 * The stepper is instant and the save follows it. Steps in quick succession are not sent
 * one by one: while a save is in flight only the newest value is kept, and sent once it lands.
 * A save that fails puts the saved value back and says so, since a stepper still showing
 * what was clicked reads as saved.
 */
export function InflationSetting({ settings, onChange, scrollIntoView = false }: Props) {
  const value = settings.assumedInflation
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  // True from the first step until the last one has landed. The saved value arriving in the
  // middle of that is an earlier step, and taking it would pull the stepper back to it for a
  // round trip before the newer one it is waiting on replaces it.
  const [busy, setBusy] = useState(false)
  // A value saved from elsewhere replaces the draft; tracked in render rather than in an
  // effect so the stepper never shows the old value for a frame.
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (!busy) setDraft(value)
  }

  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Not every environment has it (jsdom does not).
    if (scrollIntoView) card.current?.scrollIntoView?.({ block: 'center' })
  }, [scrollIntoView])

  // What the save handlers need without being recreated on every render.
  const saved = useRef(value)
  const send = useRef(onChange)
  useEffect(() => {
    saved.current = value
  }, [value])
  useEffect(() => {
    send.current = onChange
  }, [onChange])
  const inFlight = useRef(false)
  const queued = useRef<number | null>(null)

  // Sends `first`, then whatever was clicked while it was in flight, until nothing newer is left.
  const save = useCallback(async (first: number) => {
    inFlight.current = true
    setBusy(true)
    let next: number | null = first
    try {
      while (next !== null) {
        await send.current({ assumedInflation: next })
        saved.current = next
        setError(null)
        const newest: number | null = queued.current
        queued.current = null
        next = newest !== null && newest !== saved.current ? newest : null
      }
    } catch (e) {
      queued.current = null
      setDraft(saved.current)
      setError(failureMessage(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [])

  const step = (next: number) => {
    if (!Number.isFinite(next)) return
    setDraft(next)
    setError(null)
    if (inFlight.current) queued.current = next
    else if (next !== saved.current) void save(next)
  }

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
