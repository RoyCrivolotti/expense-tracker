import { useState, type CSSProperties, type ReactNode } from 'react'
import { Presence } from '../components/Presence'
import { EXIT_MS, exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import foldStyles from './TipCard.module.css'
import formStyles from '../components/TransactionForm.module.css'
import styles from './FormTip.module.css'

interface Props {
  show: boolean
  /** `line` is the tinted line at the top of the form; `hint` is the small grey note under a field. */
  tone: 'line' | 'hint'
  children: ReactNode
}

/** The form's own gap, which the fold cancels so a line takes the same space whether it is folding or gone. */
const FORM_GAP = '0.85rem'

/**
 * A line of advice in the transaction form that appears and leaves with what the account holds or what the person has
 * chosen. It folds over `EXIT_MS.fold` like a tip card and is `inert` while it does. One that is there when the form opens
 * does not animate in; one that comes later (the budget month line, after the date moves) folds open.
 */
export function FormTip({ show, tone, children }: Props) {
  const [wasAbsent, setWasAbsent] = useState(!show)
  if (!show && !wasAbsent) setWasAbsent(true)
  return (
    <Presence show={show} exitMs={EXIT_MS.fold}>
      <FormTipBody tone={tone} arriving={wasAbsent}>
        {children}
      </FormTipBody>
    </Presence>
  )
}

function FormTipBody({ tone, arriving, children }: Omit<Props, 'show'> & { arriving: boolean }) {
  const { leaving, exitMs } = useExit()
  const classes = [foldStyles.fold, arriving ? foldStyles.arriving : '', leaving ? foldStyles.leaving : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={classes}
      style={{ ...exitVars(leaving, exitMs), '--tip-gap': FORM_GAP } as CSSProperties}
      inert={leaving}
    >
      <div className={foldStyles.foldInner}>
        <p className={tone === 'line' ? styles.line : formStyles.fieldHint} role="note">
          {children}
        </p>
      </div>
    </div>
  )
}
