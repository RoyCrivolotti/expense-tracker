import styles from './OnboardingWizard.module.css'

export function OnboardingAccountsStep({
  debitName,
  creditName,
  addCredit,
  onDebitName,
  onCreditName,
  onAddCredit,
}: {
  debitName: string
  creditName: string
  addCredit: boolean
  onDebitName: (v: string) => void
  onCreditName: (v: string) => void
  onAddCredit: (v: boolean) => void
}) {
  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>Add the accounts you pay from. You can rename them later.</p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Main debit account</span>
        <input
          type="text"
          value={debitName}
          onChange={(e) => onDebitName(e.target.value)}
          placeholder="Main debit"
          autoComplete="off"
        />
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={addCredit}
          onChange={(e) => onAddCredit(e.target.checked)}
        />
        <span>Add a credit card (deferred settlement)</span>
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
