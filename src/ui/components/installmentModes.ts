import type { InstallmentMode } from './installmentIntent'

interface ModeOption {
  mode: InstallmentMode
  label: string
}

export function modeOptions(
  linked: boolean,
  hasPlans: boolean,
): ModeOption[] {
  const base: ModeOption[] = linked
    ? [
        { mode: 'none', label: 'Keep' },
        { mode: 'existing', label: 'Change plan' },
        { mode: 'new', label: 'New plan' },
        { mode: 'unlink', label: 'Remove' },
      ]
    : // Likely intent first. On an unlinked transaction 'none' is the state the
      // previous screen already reported ("Not part of a plan"), so it is the way
      // back out of a choice in progress rather than a destination of its own —
      // last in the row, and phrased as a choice.
      [
        { mode: 'new', label: 'New plan' },
        { mode: 'existing', label: 'Existing plan' },
        { mode: 'none', label: 'No plan' },
      ]
  return base.filter((o) => o.mode !== 'existing' || hasPlans)
}
