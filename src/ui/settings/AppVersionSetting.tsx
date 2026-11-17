import { Card, SectionTitle } from '../components/primitives'
import type { ExpenseModel } from '../useExpenseData'
import styles from './AppVersionSetting.module.css'

/**
 * Which build this copy is and how it reads the ledger, so whoever tests a release can tell what an installed app
 * runs: it keeps its old code until it has fetched and switched to the new. `pagedList` is set only by
 * `useLedgerData`, so it says what is running, a fall back to the whole dataset included, which the address and the
 * stored switch do not.
 */
export function AppVersionSetting({ model }: { model: Pick<ExpenseModel, 'pagedList'> }) {
  return (
    <>
      <SectionTitle>About this app</SectionTitle>
      <Card>
        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>Version</dt>
            <dd className={styles.build}>{import.meta.env.VITE_BUILD_ID ?? 'unknown'}</dd>
          </div>
          <div className={styles.row}>
            <dt>Reads your data</dt>
            <dd>{model.pagedList ? 'In parts (ledger mode)' : 'As one dataset (classic)'}</dd>
          </div>
        </dl>
      </Card>
    </>
  )
}
