import { useEffect, useRef } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { GoalControls } from './GoalControls'
import styles from './goals.module.css'

interface MobileControlsSheetProps {
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  open: boolean
  onClose: () => void
}

export function MobileControlsSheet({
  draft,
  onChange,
  open,
  onClose,
}: MobileControlsSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      className={styles.mobileSheet}
      aria-label="Adjust projection controls"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className={styles.mobileSheetInner}>
        <div className={styles.mobileSheetHeader}>
          <span className={styles.mobileSheetTitle}>Adjust projection</span>
          <button
            type="button"
            className={styles.mobileSheetClose}
            aria-label="Close controls"
            onClick={onClose}
          >
            Done
          </button>
        </div>
        <div className={styles.mobileSheetBody}>
          <GoalControls draft={draft} onChange={onChange} />
        </div>
      </div>
    </dialog>
  )
}
