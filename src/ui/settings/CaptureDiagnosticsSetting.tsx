import { useEffect, useState } from 'react'
import { fetchCaptureStatus, type SourceDiagnostics, type SourceStatus } from '../../data/captureStatusApi'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import { ratesOf } from './captureDiagnostics'
import styles from './CaptureDiagnosticsSetting.module.css'

const COUNTS: ReadonlyArray<[keyof SourceDiagnostics, string]> = [
  ['received', 'Received'],
  ['recommended', 'Suggested'],
  ['grouped', 'Same payment as another'],
  ['unread', 'Not read'],
  ['addedAsIs', 'Added as shown'],
  ['edited', 'Edited, then added'],
  ['linked', 'Linked'],
  ['dismissed', 'Dismissed'],
  ['open', 'Waiting'],
  ['muted', 'Muted wordings'],
]

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function Rates({ diagnostics }: { diagnostics: SourceDiagnostics }) {
  const rates = ratesOf(diagnostics)
  if (!rates) return <p className={`${styles.rates} ${tabStyles.settingHint}`}>Nothing decided yet.</p>
  return (
    <p className={styles.rates}>
      Of {rates.decided} decided: {rates.addedAsIs}% added as shown, {rates.edited}% edited, {rates.dismissed}%
      dismissed.
    </p>
  )
}

function SourceDiagnosticsRow({ status }: { status: SourceStatus }) {
  const d = status.diagnostics
  return (
    <li className={styles.source}>
      <h3 className={styles.name}>{status.source}</h3>
      <dl className={styles.counts}>
        {COUNTS.map(([field, label]) => (
          <div key={field} className={styles.count}>
            <dt>{label}</dt>
            <dd>{d[field]}</dd>
          </div>
        ))}
      </dl>
      <Rates diagnostics={d} />
    </li>
  )
}

/**
 * How capture is doing for each bank app over the last 30 days: what arrived, what became a suggestion, and what the
 * person did with it. Counts only, read from the status route; nothing here quotes a notification.
 */
export function CaptureDiagnosticsSetting() {
  const [sources, setSources] = useState<SourceStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    fetchCaptureStatus().then(
      (status) => current && setSources(status.sources),
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [])

  return (
    <>
      <SectionTitle>Capture diagnostics</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            The last 30 days for each bank app: what reached the app, what became a suggestion and what you did with it.
            Counts only; nothing here quotes a notification.
          </p>
          {error ? (
            <p className={tabStyles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          {sources && sources.length === 0 ? (
            <p className={tabStyles.settingHint}>Nothing has reached the app yet.</p>
          ) : null}
          {sources && sources.length > 0 ? (
            <ul className={styles.sources}>
              {sources.map((status) => (
                <SourceDiagnosticsRow key={status.source} status={status} />
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </>
  )
}
