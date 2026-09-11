import { useRef } from 'react'
import styles from './NativeDateOverlay.module.css'

/**
 * iOS Safari renders input[type=date]/[type=month] using the device locale's
 * own long-form text ("September 2026") plus a native picker glyph, which can
 * be wider than the space a two-column row gives the field — and that text
 * isn't something CSS or the `value` attribute can shorten; the browser owns
 * it. Chromium and desktop WebKit don't have this problem (both render a
 * compact numeric format), which is why this only surfaces on a real device.
 *
 * Keeps the real input for its native picker UI, keyboard and accessible
 * value, but makes it invisible and overlays our own compact label (which we
 * fully control) on top — same trick as a custom-styled file input.
 *
 * Desktop browsers only treat a click on their own internal calendar-icon
 * glyph as "open the picker" — clicking elsewhere in a native date/month
 * input just focuses a segment. Since the input already fills the entire
 * box here, calling showPicker() on click makes the whole field open the
 * picker on desktop too, matching what a tap already does natively on
 * mobile. Feature-detected (older Firefox lacks showPicker()): where it's
 * unsupported, this is a silent no-op and today's existing focus/arrow-key
 * behavior is unchanged.
 */
export function NativeDateOverlay({
  type,
  value,
  label,
  onChange,
}: {
  type: 'date' | 'month'
  value: string
  label: string
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    const input = inputRef.current
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker()
      } catch {
        // No transient user activation, or unsupported in this state — the
        // browser's default click/focus behavior still applies either way.
      }
    }
  }

  return (
    <span className={styles.wrap}>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        onKeyDown={(e) => {
          // Space opens the picker for keyboard parity with a mobile tap.
          // Enter is deliberately left alone: these fields live inside a
          // real <form>, and Enter submitting it is existing behavior that
          // must not be hijacked.
          if (e.key === ' ') {
            e.preventDefault()
            openPicker()
          }
        }}
        required
        className={styles.input}
      />
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
