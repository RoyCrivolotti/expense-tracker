import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { MoneyField } from './goalControlFields'
import { PercentField } from './goalSliderFields'
import { Disclosure } from './Disclosure'
import { spendMoneyHint } from './moneyHints'
import { LEVER_SPECS, NO_LEVERS } from './leverFields'
import { RetirementYearsField } from './RetirementYearsField'
import { retirementYearsNotes } from './retirementGuide'
import { plain, type SectionProps } from './sectionProps'
import styles from './goals.module.css'

const L = LEVER_SPECS

export function FireFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  // The formula is about both inputs, so it stays while either is on the page.
  const explainsTarget = !omit.has('annualSpendCents') || !omit.has('safeWithdrawalRate')
  const spendHint = spendMoneyHint(draft, useAssumedInflation(), useMoneyFormat())
  return (
    <>
      {omit.has('annualSpendCents') ? null : (
        <>
          {wrap(
            'annualSpendCents',
            <MoneyField
              label={L.annualSpendCents.label}
              value={draft.annualSpendCents}
              onChange={(v) => onChange({ annualSpendCents: v })}
            />,
          )}
          <p className={styles.fieldHint}>
            Yearly cost of living after FI. Add the tax on what you withdraw: the plan does not.
          </p>
          {spendHint ? <p className={`${styles.fieldHint} ${styles.fieldHintReserve}`}>{spendHint}</p> : null}
        </>
      )}
      <RetirementYearsField draft={draft} onChange={onChange} />
      {omit.has('safeWithdrawalRate')
        ? null
        : wrap(
            'safeWithdrawalRate',
            <PercentField
              label={L.safeWithdrawalRate.label}
              value={draft.safeWithdrawalRate}
              min={L.safeWithdrawalRate.min ?? 0.005}
              max={L.safeWithdrawalRate.max ?? 0.06}
              onChange={(v) => onChange({ safeWithdrawalRate: v })}
            />,
          )}
      {explainsTarget ? (
        <p className={styles.fieldHint}>
          Share of the portfolio spent each year after FI. FI target = annual spend ÷ this rate.
        </p>
      ) : null}
      <FireNotes explainsTarget={explainsTarget} />
    </>
  )
}

/**
 * How the FI figures are worked out, behind one closed note: where FI is looked for, what the guide for the years is and
 * how the chart tests it, and why a lower rate is a higher target. The one about the rate leaves with it when neither
 * input of the formula is on the page.
 */
function FireNotes({ explainsTarget }: { explainsTarget: boolean }) {
  const format = useMoneyFormat()
  const notes = [
    'FI is searched within your Horizon (years); if it is never reached, the drawdown charts show the target only.',
    ...retirementYearsNotes(format),
    ...(explainsTarget
      ? ['4% is the usual rule of thumb. A lower rate means spending less, which is a higher FI target.']
      : []),
  ]
  return (
    <Disclosure title="How FI is worked out">
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </Disclosure>
  )
}
