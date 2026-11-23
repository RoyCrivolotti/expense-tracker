import { useRef, useState } from 'react'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { Presence } from '../components/Presence'
import { ReassignDeleteSheet } from '../components/ReassignDeleteSheet'
import { EXIT_MS, afterExit } from '../hooks/motion'
import type { DeleteConfig } from './configModalConfig'
import styles from './definitions.module.css'

/** Structural check so this stays agnostic of which `ExpenseDataSource` threw (see `ApiError`). */
function hasHttpStatus(error: unknown): error is Error & { status: number } {
  return error instanceof Error && 'status' in error && typeof (error as { status: unknown }).status === 'number'
}

export type DeleteMode = 'idle' | 'confirm' | 'reassign'

function usePlainDelete(
  config: DeleteConfig,
  onDeleted: () => void,
  onModeChange: (mode: DeleteMode) => void,
) {
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Any user-driven mode change makes a pending 409 escalation stand down (see
  // runPlainDelete). Without it, reopening the confirm inside the escalation's wait
  // had the reassign sheet replace that confirm mid-open when the timer fired.
  const escalation = useRef(0)
  const changeMode = (next: DeleteMode) => {
    escalation.current += 1
    onModeChange(next)
  }

  const runPlainDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      await config.onPlainDelete()
      onDeleted()
    } catch (e) {
      // The client's cached usageCount (checked before showing this confirm) can be
      // stale — another tab or a duplicate submission may have linked a record to this
      // one since. A 409 here means the server now disagrees; escalate straight to the
      // reassign flow instead of leaving the user to retry the same failing delete.
      // Idle first and wait out this sheet's own exit, or the reassign sheet (a sibling
      // Presence, also full-screen) would mount on top of it before it has left.
      if (hasHttpStatus(e) && e.status === 409) {
        changeMode('idle')
        const mine = escalation.current
        await afterExit(EXIT_MS.sheet)
        if (escalation.current === mine) onModeChange('reassign')
      } else {
        changeMode('idle')
        setErr(e instanceof Error ? e.message : 'Could not delete')
      }
    } finally {
      setDeleting(false)
    }
  }

  return { err, setErr, changeMode, runPlainDelete }
}

function DeleteSheets({
  config,
  mode,
  onDeleted,
  onConfirm,
  onCancel,
}: {
  config: DeleteConfig
  mode: DeleteMode
  onDeleted: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <Presence show={mode === 'confirm'} exitMs={EXIT_MS.sheet}>
        <ConfirmSheet
          title={`Delete ${config.label}?`}
          message="This can't be undone."
          {...(config.usage.words === null ? {} : { footnote: config.usage.words })}
          confirmLabel="Delete"
          destructive
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </Presence>
      <Presence show={mode === 'reassign'} exitMs={EXIT_MS.sheet}>
        <ReassignDeleteSheet
          title={`Delete ${config.label}?`}
          // usageCount === 0 here means we escalated from a stale-count 409 (see
          // runPlainDelete), not the normal usageCount > 0 path — the exact count isn't
          // trustworthy in that case, so use a generic message instead of "0 records".
          message={
            (config.usageCount ?? 0) > 0
              ? `This ${config.noun} is used by ${config.usageCount} record${config.usageCount === 1 ? '' : 's'}. Move them to another ${config.noun} first, or create a new one.`
              : `This ${config.noun} turned out to still be in use elsewhere. Move its records to another ${config.noun} first, or create a new one.`
          }
          options={config.otherOptions}
          createLabel={config.noun}
          onConfirm={(target) => config.onReassignDelete(target).then(onDeleted)}
          onCancel={onCancel}
        />
      </Presence>
    </>
  )
}

export function ConfigDeleteControl({
  config,
  onDeleted,
  mode,
  onModeChange,
}: {
  config: DeleteConfig
  onDeleted: () => void
  mode: DeleteMode
  onModeChange: (mode: DeleteMode) => void
}) {
  const { err, setErr, changeMode, runPlainDelete } = usePlainDelete(config, onDeleted, onModeChange)

  if (config.isLast) {
    return <p className={styles.deleteNote}>You need at least one {config.noun}, so this one can&apos;t be deleted.</p>
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.editBtn} ${styles.deleteBtn}`}
        // What uses it is not known until the server has counted: it is asked for, and not taken to be nothing.
        disabled={config.usageCount === null && config.usage.note === 'reading'}
        onClick={() => {
          setErr(null)
          changeMode((config.usageCount ?? 0) > 0 ? 'reassign' : 'confirm')
        }}
      >
        Delete {config.noun}
      </button>
      {config.usage.notice}
      {err && <p className={styles.deleteError}>{err}</p>}
      <DeleteSheets
        config={config}
        mode={mode}
        onDeleted={onDeleted}
        onConfirm={() => void runPlainDelete()}
        onCancel={() => changeMode('idle')}
      />
    </>
  )
}
