import type { ExpenseSettings, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { MilestonesSetting } from '../../settings/MilestonesSetting'
import { CashReserveSetting } from '../../settings/CashReserveSetting'
import { InflationSetting } from '../../settings/InflationSetting'
import { WealthAccountsManager } from './WealthAccountsManager'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  checkins: WealthCheckin[]
  settings: ExpenseSettings
  actions: ExpenseActions | undefined
  onSettingsChange: ((patch: Partial<ExpenseSettings>) => void | Promise<void>) | undefined
  /** Bring the assumed inflation into view, for the link that opens Setup on it. */
  focusInflation?: boolean
}

/**
 * The things Progress is measured with, kept apart from the measuring: the milestone ladder
 * and the accounts each check-in records a balance for.
 */
export function SetupView({
  accounts,
  checkins,
  settings,
  actions,
  onSettingsChange,
  focusInflation = false,
}: Props) {
  if (!actions || !onSettingsChange) {
    return <p className={goalStyles.chartHint}>Read-only session — setup cannot be changed.</p>
  }

  return (
    <div className={styles.progressStack}>
      <p className={goalStyles.intro}>
        What Progress measures with. Milestones mark the ladder your invested portfolio climbs;
        accounts are what each check-in records a balance for; the cash reserve is how much of
        that should stay in cash; the assumed inflation is the rate that brings check-ins, the
        house and the mortgage back to today&apos;s money.
      </p>
      <MilestonesSetting settings={settings} onChange={onSettingsChange} />
      <WealthAccountsManager accounts={accounts} checkins={checkins} actions={actions} />
      <CashReserveSetting settings={settings} onChange={onSettingsChange} />
      <InflationSetting settings={settings} onChange={onSettingsChange} scrollIntoView={focusInflation} />
    </div>
  )
}
