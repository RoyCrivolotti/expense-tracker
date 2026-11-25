import { ChartLegend } from '../../../charts/ChartLegend'
import type { ChartSeries } from '../../../charts/LinearChart'
import { ScrollRegion } from './ScrollRegion'
import type { MilestoneRow } from './spreadModel'
import styles from '../goals.module.css'

/** When the runs first reach each amount: the middle half of them, and eight in ten. */
export function SpreadTable({ rows }: { rows: MilestoneRow[] }) {
  return (
    <ScrollRegion label="When the runs first reach each amount, scrolls sideways when the text is large">
      <table className={styles.spreadTable}>
        <caption className={styles.spreadTableCaption}>When the runs first reach each amount</caption>
        <thead>
          <tr>
            <th scope="col">Amount</th>
            <th scope="col">Half of the runs</th>
            <th scope="col">8 in 10</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">
                {row.label}
                <span className={styles.spreadTableNote}>{row.gets} runs get there</span>
              </th>
              <td>{row.middle}</td>
              <td>{row.wide}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  )
}

/** The two lines the key names: the plan, and the middle run with the bands around it. */
export function SpreadLegend({ series }: { series: ChartSeries[] }) {
  return (
    <ChartLegend
      items={[
        { label: 'The plan', color: series.find((s) => s.id === 'plan')!.color },
        {
          label: 'Middle run, middle half shaded, 8 in 10 between the dashed lines',
          color: series.find((s) => s.id === 'median')!.color,
        },
      ]}
    />
  )
}
