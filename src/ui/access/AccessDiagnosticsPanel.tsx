import { useEffect, useState } from 'react'
import { collectAccessDiagnostics, type AccessDiagnostics } from './accessDiagnostics'
import styles from './AccessScreen.module.css'

export function AccessDiagnosticsPanel({ error }: { error: string }) {
  const [open, setOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<AccessDiagnostics | null>(null)
  const [copyLabel, setCopyLabel] = useState('Copy diagnostics')

  useEffect(() => {
    let active = true
    void collectAccessDiagnostics(error).then((snapshot) => {
      if (active) setDiagnostics(snapshot)
    })
    return () => {
      active = false
    }
  }, [error])

  const onCopy = () => {
    if (!diagnostics) return
    void navigator.clipboard
      .writeText(JSON.stringify(diagnostics, null, 2))
      .then(() => {
        setCopyLabel('Copied')
        window.setTimeout(() => setCopyLabel('Copy diagnostics'), 2000)
      })
      .catch(() => {
        setCopyLabel('Copy failed')
      })
  }

  return (
    <div className={styles.diagnostics}>
      <button
        type="button"
        className={styles.detailsToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide technical details' : 'Show technical details'}
      </button>
      {open && diagnostics ? (
        <pre className={styles.detailsPre}>{JSON.stringify(diagnostics, null, 2)}</pre>
      ) : null}
      <button
        type="button"
        className={styles.secondaryBtn}
        onClick={onCopy}
        disabled={!diagnostics}
      >
        {copyLabel}
      </button>
    </div>
  )
}
