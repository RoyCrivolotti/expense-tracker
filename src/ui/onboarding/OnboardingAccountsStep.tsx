import styles from './OnboardingWizard.module.css'

export function OnboardingAccountsStep({
  hasExistingAccounts,
  addDebit,
  debitName,
  creditName,
  addCredit,
  onAddDebit,
  onDebitName,
  onCreditName,
  onAddCredit,
}: {
  hasExistingAccounts: boolean
  addDebit: boolean
  debitName: string
  creditName: string
  addCredit: boolean
  onAddDebit: (v: boolean) => void
  onDebitName: (v: string) => void
  onCreditName: (v: string) => void
  onAddCredit: (v: boolean) => void
}) {
  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        {hasExistingAccounts
          ? 'Add another account you pay from, or skip if your existing accounts already cover it.'
          : 'You can rename these and add more later in Settings.'}
      </p>
      {hasExistingAccounts ? (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={addDebit} onChange={(e) => onAddDebit(e.target.checked)} />
          <span>Add another debit account</span>
        </label>
      ) : null}
      {!hasExistingAccounts || addDebit ? (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Main account</span>
          <input
            type="text"
            value={debitName}
            onChange={(e) => onDebitName(e.target.value)}
            placeholder="Main account"
            autoComplete="off"
          />
        </label>
      ) : null}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={addCredit}
          onChange={(e) => onAddCredit(e.target.checked)}
        />
        <span>I also pay with a credit card that is charged once a month</span>
      </label>
      {addCredit ? (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Credit card name</span>
          <input
            type="text"
            value={creditName}
            onChange={(e) => onCreditName(e.target.value)}
            placeholder="Credit card"
            autoComplete="off"
          />
        </label>
      ) : null}
    </div>
  )
}
