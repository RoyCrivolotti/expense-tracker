import type { Mover } from '../../../engine'
import { formatCentsCompact } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card } from '../../components/primitives'
import styles from './overview.module.css'

/** Flexible categories against their own 3-month average, biggest move first. */
export function MoversCard({ movers }: { movers: Mover[] }) {
  const format = useMoneyFormat()
  if (movers.length === 0) return null
  const maxDelta = Math.max(...movers.map((m) => Math.abs(m.deltaCents)), 1)

  return (
    <Card>
      <h3 className={styles.cardTitle}>What changed</h3>
      <p className={styles.cardSub}>Flexible spending against your 3-month average.</p>
      <div className={styles.movers}>
        {movers.map((m) => {
          const up = m.deltaCents > 0
          const width = (Math.abs(m.deltaCents) / maxDelta) * 50
          return (
            <div key={m.categoryId} className={styles.moverRow}>
              <span className={styles.moverName}>{m.name}</span>
              <span className={styles.moverBar} aria-hidden>
                <i
                  className={up ? styles.moverUp : styles.moverDown}
                  style={{
                    width: `${width}%`,
                    [up ? 'left' : 'right']: '50%',
                  }}
                />
              </span>
              <span className={`${styles.moverAmt} ${up ? styles.neg : styles.pos}`}>
                {up ? '+' : '−'}
                {formatCentsCompact(Math.abs(m.deltaCents), format)}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
