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
}

/**
 * A chip beside each line's dot at the year pointed at, in the line's colour and level with the
 * dot, with the shaded band's over and under values dashed above and below. Where chips would
 * overlap they are moved together, in the order of the lines. Nothing here takes the pointer.
 */
export function ChartValueTags({ spec, active, focusX, width, yTop, yBottom, scaleY, lines, bands }: ChartValueTagsProps) {
  if (!spec || active == null) return null
  const placed = placeTags(buildTags(active, lines, bands, scaleY, spec), focusX, width, yTop, yBottom)
  return (
    <g className={styles.valueTags} aria-hidden>
      {placed.map(({ tag, x, y, width: w }) =>
        tag.colors.length > 1 ? (
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
