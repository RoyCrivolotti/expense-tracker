import { useState } from 'react'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { StartLaterSheet, type StartLater } from './StartLaterSheet'

/** The sheet, held through its exit so it leaves the way it came, whichever way it is closed. */
export function StartLaterHost({ open, startLater, onClose }: { open: boolean; startLater: StartLater; onClose: () => void }) {
  return (
    <Presence show={open} exitMs={EXIT_MS.sheet}>
      <StartLaterSheet {...startLater} onClose={onClose} />
    </Presence>
  )
}

/** "Start a copy later…" as a button of its own, for the phone's scenario card, which has no menu. */
export function StartLaterButton({ startLater, disabled, className }: { startLater: StartLater; disabled: boolean; className?: string | undefined }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        Start a copy later…
      </button>
      <StartLaterHost open={open} startLater={startLater} onClose={() => setOpen(false)} />
    </>
  )
}
