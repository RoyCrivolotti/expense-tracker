import type { OverviewKpis, OverviewTotals } from '../../../engine'
import { formatCentsCompact, formatPercent } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { ChangeChip } from '../shared/ChangeChip'
import { Sparkline } from '../shared/Sparkline'
import styles from './overview.module.css'

interface TileSpec {
  key: string
  label: string
  upGood: boolean
  kind: 'money' | 'rate'
  pick: (t: OverviewTotals) => number
}

const TILES: TileSpec[] = [
  { key: 'income', label: 'Income', upGood: true, kind: 'money', pick: (t) => t.incomeCents },
  { key: 'spend', label: 'Spent', upGood: false, kind: 'money', pick: (t) => t.spendCents },
  { key: 'saved', label: 'Net saved', upGood: true, kind: 'money', pick: (t) => t.savedCents },
  { key: 'rate', label: 'Savings rate', upGood: true, kind: 'rate', pick: (t) => t.rate ?? 0 },
  { key: 'invested', label: 'Invested', upGood: true, kind: 'money', pick: (t) => t.investedCents },
]

function Tile({ spec, kpis, baselineName }: { spec: TileSpec; kpis: OverviewKpis; baselineName: string }) {
  const format = useMoneyFormat()
  const value = spec.pick(kpis.current)
  const display =
    spec.kind === 'rate'
      ? kpis.current.rate === null
        ? '—'
        : formatPercent(kpis.current.rate)
      : formatCentsCompact(value, format)
  return (
    <div className={styles.kpiTile}>
      <span className={styles.kpiLabel}>{spec.label}</span>
      <span className={styles.kpiValue}>{display}</span>
      <span className={styles.kpiDelta}>
        <ChangeChip
          value={value}
          baseline={kpis.baseline ? spec.pick(kpis.baseline) : null}
          upGood={spec.upGood}
          kind={spec.kind}
        />
        <span className={styles.kpiBaseline}>vs {baselineName}</span>
      </span>
      <Sparkline
        values={kpis.series.map((s) => spec.pick(s.totals))}
        label={`${spec.label} over the last ${kpis.series.length} months`}
      />
    </div>
  )
}

/** The five headline numbers, each with its change chip and a 12-month sparkline. */
export function KpiTiles({ kpis, baselineName }: { kpis: OverviewKpis; baselineName: string }) {
  return (
    <div className={styles.kpiRow}>
      {TILES.map((spec) => (
        <Tile key={spec.key} spec={spec} kpis={kpis} baselineName={baselineName} />
      ))}
    </div>
  )
}
