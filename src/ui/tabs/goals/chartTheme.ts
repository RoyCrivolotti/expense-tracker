import type { CSSProperties } from 'react'
import { formatCents } from '../../../engine'

export function formatEuroShort(cents: number): string {
  if (cents >= 1_000_000_00) return `€${(cents / 1_000_000_00).toFixed(1)}M`
  if (cents >= 1_000_00) return `€${Math.round(cents / 1_000_00)}k`
  return formatCents(cents)
}

export function formatSignedEuroShort(cents: number): string {
  const abs = formatEuroShort(Math.abs(cents))
  if (cents > 0) return `+${abs}`
  if (cents < 0) return `−${abs}`
  return abs
}

export const GOAL_CHART_MARGIN = { top: 12, right: 16, left: 8, bottom: 8 }

export function chartTooltipStyle(): CSSProperties {
  return {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--color-text)',
  }
}
