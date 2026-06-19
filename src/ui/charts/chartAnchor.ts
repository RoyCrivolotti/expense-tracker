/** Map a viewBox point to screen coordinates for the given SVG element. */
export function svgViewBoxToScreen(
  svg: SVGSVGElement,
  viewBoxX: number,
  viewBoxY: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const scaleX = rect.width / vb.width
  const scaleY = rect.height / vb.height
  return {
    x: rect.left + (viewBoxX - vb.x) * scaleX,
    y: rect.top + (viewBoxY - vb.y) * scaleY,
  }
}
