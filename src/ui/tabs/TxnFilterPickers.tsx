import { useRef, useState } from 'react'
import type { Flag, Label } from '../../types'
import { ChevronIcon } from '../icons'
import { LabelPickerPopover } from '../components/LabelPickerPopover'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { useToggleIds } from '../hooks/useToggleIds'
import styles from './tabs.module.css'

function labelTriggerText(
  value: number[],
  labels: Label[],
): string {
  if (value.length === 0) return 'Labels'
  if (value.length === 1) return labels.find((l) => l.id === value[0])?.name ?? '1 label'
  return `Labels (${value.length})`
}

/**
 * Multi-select sibling of the flag <select>: a label filter can match more than one
 * label at once (OR), which a native select can't express, so this is a trigger button
 * reusing LabelPickerPopover — the same picker the edit sheet uses (see LabelField) —
 * rather than a second multi-select widget. Renders into FilterFields' grid beside the
 * selects, so it is a plain cell, not a row of its own.
 */
export function LabelFilterField({
  labels,
  labelIds,
  selectMode,
  onLabelIds,
}: {
  labels: Label[]
  labelIds: number[]
  selectMode: boolean
  onLabelIds: (ids: number[]) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const toggle = useToggleIds(labelIds, onLabelIds)

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={labelIds.length > 0 ? `${styles.labelTrigger} ${styles.labelTriggerActive}` : styles.labelTrigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={selectMode}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.labelTriggerText}>{labelTriggerText(labelIds, labels)}</span>
        <ChevronIcon className={styles.labelTriggerChevron} aria-hidden="true" />
      </button>
      <Presence show={open} exitMs={EXIT_MS.popover}>
        <LabelPickerPopover
          value={labelIds}
          labels={labels}
          triggerRef={triggerRef}
          onToggle={toggle}
          onClose={() => setOpen(false)}
        />
      </Presence>
    </>
  )
}

export function FlagFilterSelect({
  options,
  flagId,
  selectMode,
  onFlag,
}: {
  options: Flag[]
  flagId: number | 'all' | 'none'
  selectMode: boolean
  onFlag: (value: number | 'all' | 'none') => void
}) {
  return (
    <select
      className={flagId !== 'all' ? styles.activeSelect : undefined}
      value={flagId}
      onChange={(e) => {
        const raw = e.target.value
        onFlag(raw === 'all' || raw === 'none' ? raw : Number(raw))
      }}
      disabled={selectMode}
      aria-label="Filter by flag"
    >
      <option value="all">Flag</option>
      <option value="none">Unflagged</option>
      {options.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
          {f.active ? '' : ' (archived)'}
        </option>
      ))}
    </select>
  )
}
