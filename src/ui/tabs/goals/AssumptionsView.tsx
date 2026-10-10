import { useEffect, useRef } from 'react'
import { currencyWord } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import type { ExpenseSettings, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { MilestonesSetting } from '../../settings/MilestonesSetting'
import { CashReserveSetting } from '../../settings/CashReserveSetting'
import { InflationSetting } from '../../settings/InflationSetting'
import { MarketBounceSetting } from '../../settings/MarketBounceSetting'
import { WealthAccountsManager } from './WealthAccountsManager'
import type { AssumptionsFocus } from './goalsView'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  checkins: WealthCheckin[]
  settings: ExpenseSettings
  actions: ExpenseActions | undefined
  onSettingsChange: ((patch: Partial<ExpenseSettings>) => void | Promise<void>) | undefined
  /** Bring a card into view, for the link that opens Assumptions on it. */
  focus?: AssumptionsFocus | null
}

/**
 * The Assumptions view: the things Progress is measured with, kept apart from the measuring.
 * The milestone ladder, the accounts each check-in records a balance for, the cash reserve and
 * the assumed inflation.
 */
export function AssumptionsView({
  accounts,
  checkins,
  settings,
  actions,
  onSettingsChange,
  focus = null,
}: Props) {
  const format = useMoneyFormat()
  const accountsCard = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Not every environment has it (jsdom does not).
    if (focus === 'accounts') accountsCard.current?.scrollIntoView?.({ block: 'start' })
  }, [focus])

  if (!actions || !onSettingsChange) {
    return <p className={goalStyles.chartHint}>Read-only session — assumptions cannot be changed.</p>
  }

  return (
    <div className={styles.progressStack}>
      <p className={goalStyles.intro}>
        Progress is measured with your milestones, the accounts each check-in records a balance
        for, the months of spending to hold in cash, and an assumed inflation rate. That rate
        brings check-ins, the house and the mortgage back to the {currencyWord(format)} of the plan&apos;s start year, and
        counts what you invest each month for less each year.
      </p>
      <p className={goalStyles.chartHint}>The return, the house and life after FI are set per scenario, in Scenarios.</p>
      <MilestonesSetting settings={settings} onChange={onSettingsChange} />
      <div ref={accountsCard} className={styles.landingTarget}>
        <WealthAccountsManager accounts={accounts} checkins={checkins} actions={actions} />
      </div>
      <CashReserveSetting settings={settings} onChange={onSettingsChange} />
      <InflationSetting settings={settings} onChange={onSettingsChange} scrollIntoView={focus === 'inflation'} />
      <MarketBounceSetting settings={settings} onChange={onSettingsChange} />
    </div>
  )
}
