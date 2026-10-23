import { Money } from '../components/Money'
import styles from './tabs.module.css'

/** "1 item", "0 items", "2 items", "1000+ items". */
function itemCountLabel(count: number, capped: boolean): string {
  return `${count}${capped ? '+' : ''} item${count === 1 ? '' : 's'}`
}

interface ListStatsProps {
  /** Null while it is not known. */
  count: number | null
  capped?: boolean | undefined
  /** Null while it is not known. */
  totalCents: number | null
  /** The figures belong to the filter before this one, or may no longer fit: drawn dimmed. */
  stale?: boolean | undefined
}

/** The count and net spend above the list. */
export function ListStats({ count, capped = false, totalCents, stale }: ListStatsProps) {
  return (
    <span className={styles.resultStats} {...(stale ? { 'data-stale': '' } : {})}>
      <span>{count === null ? '—' : itemCountLabel(count, capped)}</span>
      <span>
        <span className={styles.resultLabel}>Net spend </span>
        <span className={styles.resultAmount}>
          {totalCents === null ? '—' : <Money cents={totalCents} signed={totalCents < 0} />}
        </span>
      </span>
    </span>
  )
}
