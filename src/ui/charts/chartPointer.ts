/**
 * Where a pointer is along a chart's x axis, in viewBox units, for a chart drawn a quarter turn
 * clockwise (the full-screen sheet on an upright phone): the axis then runs down the screen, so
 * the answer comes from the pointer's height in the chart's box and not from its width.
 *
 * The box's own rect is used rather than the svg's screen matrix because a bounding rect already
 * includes every transform above the chart, in every engine, and the matrix does not in all of
 * them. `viewWidth` is the viewBox's width, which maps one to one onto the box's height here.
 */
export function quarterTurnX(clientY: number, rect: { top: number; height: number }, viewWidth: number): number | null {
  if (!(rect.height > 0)) return null
  return ((clientY - rect.top) * viewWidth) / rect.height
}
