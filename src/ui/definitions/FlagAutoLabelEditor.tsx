import { useState } from 'react'
import type { Flag, Label } from '../../types'
import type { ExpenseActions } from '../actions'
import { selectableLabels } from '../components/labelPickerOptions'
import { createLabelInPlace } from '../components/quickLabel'
import { QuickCreateLabel } from '../components/QuickCreateLabel'
// Reused wholesale, same call as LabelPickerPopover's: this is the identical
// list/option/swatch/create styling, laid out inline in the modal instead of a
// portalled popover (the modal already owns positioning and the focus trap, so
// usePopoverPosition/useFocusTrap/createPortal would be duplicate machinery).
import pickerStyles from '../components/FlagPicker.module.css'
import formStyles from './FlagForm.module.css'

interface Props {
  flag: Flag
  labels: Label[]
  actions: ExpenseActions
  onDone: () => void
}

/**
 * Single-select, inline: the label a flag hands off to. Unlike LabelPickerPopover
 * (multi-select, toggle-and-stay-open), picking an option here just changes the
 * chosen value — Save is a separate, explicit step, since this also runs a
 * retroactive apply across every transaction already carrying the flag.
 */
export function FlagAutoLabelEditor({ flag, labels, actions, onDone }: Props) {
  const [value, setValue] = useState<number | null>(flag.autoLabelId ?? null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const options = selectableLabels(labels, value != null ? [value] : [])

  const save = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await actions.updateFlag(flag.id, { autoLabelId: value })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the auto-label')
      setBusy(false)
    }
  }

  return (
    <div className={formStyles.form}>
      <p className={formStyles.hint}>
        Applied to every transaction flagged {flag.name}, including ones already flagged when you
        save this — not just ones flagged from now on.
      </p>
      <ul className={pickerStyles.list}>
        <li>
          <button
            type="button"
            className={pickerStyles.option}
            onClick={() => setValue(null)}
            aria-pressed={value === null}
          >
            <span className={`${pickerStyles.swatch} ${pickerStyles.swatchNone}`} aria-hidden />
            <span className={pickerStyles.optionBody}>
              <span className={pickerStyles.optionName}>No auto-label</span>
            </span>
            {value === null ? (
              <span className={pickerStyles.tick} aria-hidden>
                ✓
              </span>
            ) : null}
          </button>
        </li>
        {options.map((label) => (
          <li key={label.id}>
            <button
              type="button"
              className={pickerStyles.option}
              onClick={() => setValue(label.id)}
              aria-pressed={value === label.id}
            >
              <span
                className={pickerStyles.swatch}
                style={{ background: label.color, borderRadius: '999px' }}
                aria-hidden
              />
              <span className={pickerStyles.optionBody}>
                <span className={pickerStyles.optionName}>
                  {label.name}
                  {!label.active ? <span className={pickerStyles.archived}> · archived</span> : null}
                </span>
                {label.description ? (
                  <span className={pickerStyles.optionDesc}>{label.description}</span>
                ) : null}
              </span>
              {value === label.id ? (
                <span className={pickerStyles.tick} aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {creating ? (
        <QuickCreateLabel
          labels={labels}
          onCreate={createLabelInPlace(actions, labels)}
          onCreated={(id) => {
            setCreating(false)
            setValue(id)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className={pickerStyles.newFlag} onClick={() => setCreating(true)}>
          + New label
        </button>
      )}
      {err ? <p className={formStyles.error}>{err}</p> : null}
      <div className={formStyles.actions}>
        <button
          type="button"
          className={formStyles.saveBtn}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={formStyles.cancelBtn} disabled={busy} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}
