import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { MoneyField, NumberField, PercentField } from './goalControlFields'
import { ContributionStepsList } from './ContributionSteps'
import { firstChangeNote } from './contributionText'
import { monthlyAmountMoneyHint } from './moneyHints'
import { planMoneyLabel } from './planMoneyLabel'
import { LifeEventsList } from './LifeEvents'
import { ADJUST_LABELS } from './adjustSections'
import { LEVER_SPECS, NO_LEVERS } from './leverFields'
import { plain, type SectionProps } from './sectionProps'
import styles from './goals.module.css'

const L = LEVER_SPECS

/**
 * The monthly amount the scenario starts with. The changes after it are set under Monthly
 * investing changes, so when there are some this says so rather than leave the amount looking like
 * all there is to it.
 */
function MonthlyInvestingField({
  draft,
  onChange,
  wrap,
}: Pick<SectionProps, 'draft' | 'onChange'> & { wrap: NonNullable<SectionProps['wrap']> }) {
  const format = useMoneyFormat()
  const note = firstChangeNote(draft, format)
  return (
    <>
      {wrap(
        'monthlyContributionCents',
        <MoneyField
          label={L.monthlyContributionCents.label}
          value={draft.monthlyContributionCents}
          onChange={(v) => onChange({ monthlyContributionCents: v })}
        />,
      )}
      {note ? (
        <p className={styles.fieldHint}>
          {note}. Set under {ADJUST_LABELS.changes.title}.
        </p>
      ) : null}
    </>
  )
}

/**
 * What return is reasonable to type. It is said nowhere else, so it stays when the return itself is
 * in the bar, and it names the input so it still reads on its own there.
 */
export function ReturnNote() {
  return (
    <p className={styles.fieldHint}>
      Real return: about 5% a year after inflation is what world stocks have returned over the very long run, and many
      forecasts are lower. 6 to 7% is optimistic. Enter the rate your money compounds at, not the simple average of
      yearly returns, which is higher by about a point for stocks. The plan takes out no fund costs or tax, so enter the
      return after them.
    </p>
  )
}

export function PortfolioFields({ draft, onChange, omit = NO_LEVERS, wrap = plain }: SectionProps) {
  return (
    <>
      {omit.has('startInvestedCents')
        ? null
        : wrap(
            'startInvestedCents',
            <MoneyField
              label={L.startInvestedCents.label}
              value={draft.startInvestedCents}
              onChange={(v) => onChange({ startInvestedCents: v })}
            />,
          )}
      {omit.has('monthlyContributionCents') ? null : (
        <MonthlyInvestingField draft={draft} onChange={onChange} wrap={wrap} />
      )}
      {omit.has('expectedRealReturn')
        ? null
        : wrap(
            'expectedRealReturn',
            <PercentField
              label={L.expectedRealReturn.label}
              value={draft.expectedRealReturn}
              max={L.expectedRealReturn.max ?? 0.15}
              onChange={(v) => onChange({ expectedRealReturn: v })}
            />,
          )}
      <ReturnNote />
      {omit.has('horizonYears')
        ? null
        : wrap(
            'horizonYears',
            <NumberField
              label={L.horizonYears.label}
              value={draft.horizonYears}
              min={L.horizonYears.min ?? 1}
              max={L.horizonYears.max ?? 60}
              onChange={(v) => onChange({ horizonYears: v })}
            />,
          )}
    </>
  )
}

export function ChangesFields({
  draft,
  onChange,
  omit = NO_LEVERS,
}: Pick<SectionProps, 'draft' | 'onChange' | 'omit'>) {
  const format = useMoneyFormat()
  const example = monthlyAmountMoneyHint(draft, useAssumedInflation(), format)
  return (
    <>
      <p className={styles.fieldHint}>
        What you send to your investments each month: the amount you start with, then each change from a month on. It is
        counted in {planMoneyLabel(draft.planStartDate, format)} at the assumed inflation, so an amount that stays the
        same counts for less each year.{example ? ` ${example}` : ''} Enter 0 for a pause.
      </p>
      <ContributionStepsList
        steps={draft.contributionSchedule ?? []}
        planStartDate={draft.planStartDate}
        baseCents={draft.monthlyContributionCents}
        startSetIn={omit.has('monthlyContributionCents') ? 'the bar above' : 'Portfolio'}
        format={format}
        onChange={(steps) => onChange({ contributionSchedule: steps })}
      />
    </>
  )
}

export function EventsFields({ draft, onChange }: Pick<SectionProps, 'draft' | 'onChange'>) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  return (
    <>
      <p className={styles.fieldHint}>
        One-off cash events (bonuses, inheritances, large purchases) applied to the portfolio in a specific projection
        year. Shown as diamond markers on the chart. Amounts are counted in{' '}
        {planMoneyLabel(draft.planStartDate, format)}, like the rest of the plan.
      </p>
      <LifeEventsList
        events={draft.lifeEvents ?? []}
        horizonYears={draft.horizonYears}
        planStartDate={draft.planStartDate}
        inflationRate={inflationRate}
        format={format}
        onChange={(events) => onChange({ lifeEvents: events })}
      />
    </>
  )
}
