import styles from './tabs.module.css'

/** One bound of the amount filter. Empty is no bound; text that is not an amount is marked invalid and ignored. */
function AmountBoundInput({
  value,
  cents,
  placeholder,
  ariaLabel,
  selectMode,
  onChange,
}: {
  value: string
  cents: number | null
  placeholder: string
  ariaLabel: string
  selectMode: boolean
  onChange: (value: string) => void
}) {
  const invalid = value.trim() !== '' && cents === null
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cents !== null ? styles.activeAmount : undefined}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      {...(invalid ? { 'aria-invalid': true } : {})}
      disabled={selectMode}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Min and Max amount, both inclusive and compared by size (see TxnFilter.amountMinCents). */
export function AmountRangeRow({
  amountMin,
  amountMax,
  amountMinCents,
  amountMaxCents,
  selectMode,
  onAmountMin,
  onAmountMax,
}: {
  amountMin: string
  amountMax: string
  amountMinCents: number | null
  amountMaxCents: number | null
  selectMode: boolean
  onAmountMin: (value: string) => void
  onAmountMax: (value: string) => void
}) {
  return (
    <div className={styles.amountRange} role="group" aria-label="Amount">
      <AmountBoundInput
        value={amountMin}
        cents={amountMinCents}
        placeholder="Min amount"
        ariaLabel="Minimum amount"
        selectMode={selectMode}
        onChange={onAmountMin}
      />
      <AmountBoundInput
        value={amountMax}
        cents={amountMaxCents}
        placeholder="Max amount"
        ariaLabel="Maximum amount"
        selectMode={selectMode}
        onChange={onAmountMax}
      />
    </div>
  )
}
