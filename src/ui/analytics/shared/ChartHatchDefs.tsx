/**
 * The one hatch pattern for "committed but not paid yet". Every hatched rendering
 * reads this, so the meaning cannot drift between charts. Include <ChartHatchDefs>
 * once inside each svg that uses UNPAID_FILL.
 */
export const UNPAID_PATTERN_ID = 'analytics-unpaid-hatch'
export const UNPAID_FILL = `url(#${UNPAID_PATTERN_ID})`

export function ChartHatchDefs({ stroke }: { stroke: string }) {
  return (
    <defs>
      <pattern
        id={UNPAID_PATTERN_ID}
        width={5}
        height={5}
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <rect width={5} height={5} fill="transparent" />
        <line x1={0} y1={0} x2={0} y2={5} stroke={stroke} strokeWidth={2.5} />
      </pattern>
    </defs>
  )
}
