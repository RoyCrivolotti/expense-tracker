import { useRef } from 'react'
import { SCENARIO_COLORS } from '../../engine'
import styles from './ColorSwatchPicker.module.css'

function normalizeHex(color: string): string {
  return color.toLowerCase()
}

function hexForNativeInput(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  return '#6366f1'
}

interface ColorSwatchPickerProps {
  color: string
  onChange: (color: string) => void
  disabled?: boolean
  /** Names the group for assistive tech, e.g. "Scenario color", "Flag colour". */
  label: string
}

/**
 * Preset swatches from the shared palette plus a native colour input as an
 * escape hatch. The presets are chosen to stay legible on both themes, so
 * prefer them; a custom value is allowed but is the user's own risk.
 */
export function ColorSwatchPicker({ color, onChange, disabled, label }: ColorSwatchPickerProps) {
  const colorInputRef = useRef<HTMLInputElement>(null)
  const current = normalizeHex(color)
  const isPreset = SCENARIO_COLORS.some((c) => normalizeHex(c) === current)

  return (
    <div className={styles.colorPicker} role="group" aria-label={label}>
      {SCENARIO_COLORS.map((preset) => (
        <button
          key={preset}
          type="button"
          className={`${styles.colorSwatch}${normalizeHex(preset) === current ? ` ${styles.colorSwatchActive}` : ''}`}
          style={{ background: preset }}
          aria-label={`Use color ${preset}`}
          aria-pressed={normalizeHex(preset) === current}
          disabled={disabled}
          onClick={() => onChange(preset)}
        />
      ))}
      <button
        type="button"
        className={`${styles.colorSwatch} ${styles.colorSwatchCustom}${
          !isPreset ? ` ${styles.colorSwatchActive}` : ''
        }`}
        style={!isPreset ? { background: color } : undefined}
        aria-label="Pick custom color"
        aria-pressed={!isPreset}
        disabled={disabled}
        onClick={() => colorInputRef.current?.click()}
      />
      <input
        ref={colorInputRef}
        type="color"
        className={styles.colorInputNative}
        value={hexForNativeInput(color)}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
