import { useEffect, useState } from 'react'
import { sampleViewport, verdict, type ViewportSample } from './viewportProbe'
import styles from './ViewportDebug.module.css'

/**
 * On-screen geometry readout, for reproducing the flag-picker bug on a real
 * phone and screenshotting numbers instead of pixels.
 *
 * Samples on every visual-viewport event *and* on an interval: iOS reports
 * `offsetTop` as 0 when it is read synchronously inside the resize handler in
 * standalone web-app mode (WebKit 237851), so a value that settles a moment
 * later would otherwise never be seen.
 */
export function ViewportDebug() {
  const [sample, setSample] = useState<ViewportSample>(sampleViewport)

  useEffect(() => {
    const update = () => setSample(sampleViewport())
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    const timer = window.setInterval(update, 400)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.clearInterval(timer)
    }
  }, [])

  const v = sample.visual
  // Top of the visible band, below the status bar — the one place that stays on
  // screen with a keyboard up.
  const top = (v?.offsetTop ?? 0) + sample.safeAreaTop + 4
  return (
    <div className={styles.panel} style={{ top }}>
      <div className={styles.verdict}>{verdict(sample)}</div>
      {`build ${sample.buildId}
vv    ${v ? `top ${v.offsetTop} h ${v.height} w ${v.width} pageTop ${v.pageTop}` : 'unavailable'}
inner ${sample.innerWidth}x${sample.innerHeight}
safe  top ${sample.safeAreaTop}
fixed rect.top ${sample.fixedTopRect}
body  ${sample.bodyPosition} ${sample.bodyTop}
${Object.entries(sample.elements)
  .map(([k, val]) => `${k.padEnd(11)} ${val}`)
  .join('\n')}`}
    </div>
  )
}
