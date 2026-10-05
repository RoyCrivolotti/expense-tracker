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
  /** Null when the number does not exist (a rate without income), never 0 for it. */
  pick: (t: OverviewTotals) => number | null
}

const TILES: TileSpec[] = [
  { key: 'income', label: 'Income', upGood: true, kind: 'money', pick: (t) => t.incomeCents },
  { key: 'spend', label: 'Spent', upGood: false, kind: 'money', pick: (t) => t.spendCents },
  { key: 'saved', label: 'Net saved', upGood: true, kind: 'money', pick: (t) => t.savedCents },
  { key: 'rate', label: 'Savings rate', upGood: true, kind: 'rate', pick: (t) => t.rate },
  { key: 'invested', label: 'Invested', upGood: true, kind: 'money', pick: (t) => t.investedCents },
]

function Tile({ spec, kpis, baselineName }: { spec: TileSpec; kpis: OverviewKpis; baselineName: string }) {
  const format = useMoneyFormat()
  const value = spec.pick(kpis.current)
  const baseline = kpis.baseline ? spec.pick(kpis.baseline) : null
  const show = (v: number) => (spec.kind === 'rate' ? formatPercent(v) : formatCentsCompact(v, format))
  const display = value === null ? '—' : show(value)
  // The chip says how far from the baseline; this says what the baseline is.
  const baselineText = value === null || baseline === null ? null : `vs ${show(baseline)} ${baselineName}`
  return (
    <div className={styles.kpiTile}>
      <span className={styles.kpiLabel}>{spec.label}</span>
      <span className={styles.kpiValue}>{display}</span>
      <span className={styles.kpiDelta}>
        <ChangeChip
          value={value ?? 0}
          baseline={value === null ? null : baseline}
          upGood={spec.upGood}
          kind={spec.kind}
        />
      </span>
      {baselineText && <span className={styles.kpiBaseline}>{baselineText}</span>}
      <Sparkline
        values={kpis.series.flatMap((s) => {
          const v = spec.pick(s.totals)
          return v === null ? [] : [v]
        })}
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
