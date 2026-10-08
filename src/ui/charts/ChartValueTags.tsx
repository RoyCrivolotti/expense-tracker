import { buildTags, DOT_ROOM, placeTags, TAG_HEIGHT, type ValueTag, type ValueTagSpec } from './valueTags'
import styles from './charts.module.css'

interface ChartValueTagsProps {
  spec: ValueTagSpec | undefined
  active: number | null
  focusX: number
  width: number
  yTop: number
  yBottom: number
  scaleY: (value: number) => number
  lines: { id: string; color: string; values: number[] }[]
  bands: { color: string; band?: { lo: number[]; hi: number[] } | undefined }[]
  /** Projections given as points (the plan from today), tagged like lines but drawn dotted. */
  pointLines: { id: string; color: string; points: { xIndex: number; value: number }[] }[]
}

/**
 * A chip beside each line's dot at the year pointed at, in the line's colour and level with the
 * dot, with the shaded band's over and under values dashed above and below. Where chips would
 * overlap they are moved together, in the order of the lines. Nothing here takes the pointer.
 */
export function ChartValueTags({ spec, active, focusX, width, yTop, yBottom, scaleY, lines, bands, pointLines }: ChartValueTagsProps) {
  if (!spec || active == null) return null
  const placed = placeTags(buildTags(active, lines, bands, pointLines, scaleY, spec), focusX, width, yTop, yBottom)
  return (
    <g className={styles.valueTags} aria-hidden>
      {placed.map(({ tag, x, y, width: w }) =>
        tag.dotted ? (
          <TodayTag key={tag.id} tag={tag} x={x} y={y} width={w} focusX={focusX} />
        ) : tag.colors.length > 1 ? (
          <MergedTag key={tag.id} tag={tag} x={x} y={y} width={w} />
        ) : (
        <g key={tag.id}>
          <rect
            x={x}
            y={y - TAG_HEIGHT / 2}
            width={w}
            height={TAG_HEIGHT}
            rx={TAG_HEIGHT / 2}
            className={tag.band ? styles.valueTagBand : styles.valueTag}
            style={tag.band ? { stroke: tag.color } : { fill: tag.color }}
          />
          <text
            x={x + w / 2}
            y={y + 4}
            textAnchor="middle"
            className={tag.band ? styles.valueTagBandText : styles.valueTagText}
            style={tag.band ? undefined : { fill: spec.textOn(tag.color) }}
          >
            {tag.text}
          </text>
        </g>
        ),
      )}
    </g>
  )
}

/** Lines that read the same figure: a dot of each colour, then the figure, on a neutral chip. */
function MergedTag({ tag, x, y, width }: { tag: ValueTag; x: number; y: number; width: number }) {
  const dotsWidth = tag.colors.length * DOT_ROOM
  return (
    <g>
      <rect x={x} y={y - TAG_HEIGHT / 2} width={width} height={TAG_HEIGHT} rx={TAG_HEIGHT / 2} className={styles.valueTagMerged} />
      {tag.colors.map((color, i) => (
        <circle key={i} cx={x + 11 + i * DOT_ROOM} cy={y} r={4} style={{ fill: color }} />
      ))}
      <text x={x + dotsWidth + (width - dotsWidth) / 2} y={y + 4} textAnchor="middle" className={styles.valueTagMergedText}>
        {tag.text}
      </text>
    </g>
  )
}

/**
 * The plan restarted from the latest check-in: a hollow dot on its dotted line and a chip in the
 * plan's colour that is a wash with a dotted edge, like its line, so it is not taken for the
 * plan's own solid chip beside it.
 */
function TodayTag({ tag, x, y, width, focusX }: { tag: ValueTag; x: number; y: number; width: number; focusX: number }) {
  return (
    <g>
      <circle cx={focusX} cy={tag.y} r={3.4} className={styles.valueTagTodayDot} style={{ stroke: tag.color }} />
      <rect
        x={x}
        y={y - TAG_HEIGHT / 2}
        width={width}
        height={TAG_HEIGHT}
        rx={TAG_HEIGHT / 2}
        className={styles.valueTagToday}
        style={{ stroke: tag.color, fill: `color-mix(in srgb, ${tag.color} 20%, transparent)` }}
      />
      <text x={x + width / 2} y={y + 4} textAnchor="middle" className={styles.valueTagBandText} style={{ fontWeight: 600 }}>
        {tag.text}
      </text>
    </g>
  )
}
