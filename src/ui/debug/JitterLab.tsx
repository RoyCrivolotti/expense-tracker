import { useEffect, useRef, useState } from 'react'
import './jitterLab.css'
import { applyJx, jxActive } from './jitterFlags'
import { describeEnvironment, startFactsSampler, type FactsSampler } from './jitterFacts'
import { ALL_OFF, JITTER_TOGGLES } from './jitterToggles'

interface ToggleListProps {
  active: string[]
  onToggle: (id: string) => void
}

function ToggleList({ active, onToggle }: ToggleListProps) {
  return (
    <ul className="jx-list">
      {JITTER_TOGGLES.map((t) => (
        <li key={t.id}>
          <label>
            <input type="checkbox" checked={active.includes(t.id)} onChange={() => onToggle(t.id)} />
            <span>{t.label}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function Numbers({ getSampler }: { getSampler: () => FactsSampler | null }) {
  const [text, setText] = useState('')
  const show = () => setText(`${describeEnvironment()}\n${getSampler()?.report() ?? ''}`)
  const clear = () => {
    getSampler()?.reset()
    setText('')
  }
  return (
    <>
      <div className="jx-row">
        <button type="button" onClick={show}>
          Show numbers
        </button>
        <button type="button" onClick={clear}>
          Clear ranges
        </button>
      </div>
      {text ? <pre className="jx-numbers">{text}</pre> : null}
    </>
  )
}

/**
 * Diagnostic panel for the date-row jitter on iPhone, which cannot be reproduced off-device.
 * Each switch neutralises one suspect (see jitterToggles.ts); the person holding the phone
 * reports which one makes the wobble stop. Never merged: this branch exists to be deployed
 * to staging and read.
 */
export function JitterLab() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string[]>(jxActive)
  const sampler = useRef<FactsSampler | null>(null)

  useEffect(() => {
    const s = startFactsSampler()
    sampler.current = s
    return () => s.stop()
  }, [])

  const set = (next: string[]) => {
    setActive(next)
    applyJx(next)
  }
  const toggle = (id: string) => set(active.includes(id) ? active.filter((f) => f !== id) : [...active, id])

  if (!open) {
    return (
      <button type="button" className="jx-pill" onClick={() => setOpen(true)}>
        jx
      </button>
    )
  }
  return (
    <div className="jx-panel" role="dialog" aria-label="Jitter lab">
      <div className="jx-row">
        <strong>Jitter lab</strong>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p>Tick a switch, close this, scroll Transactions, and note whether the wobble stops.</p>
      <div className="jx-row">
        <button type="button" onClick={() => set(ALL_OFF)}>
          All off
        </button>
        <button type="button" onClick={() => set([])}>
          Reset
        </button>
      </div>
      <ToggleList active={active} onToggle={toggle} />
      <Numbers getSampler={() => sampler.current} />
    </div>
  )
}
