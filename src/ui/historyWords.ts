/** What a windowed model says about having no history, and the one reading that means the read is still on its way. */
export const HISTORY_WORDS = {
  loading:
    'Reading the recurring charges. Until they arrive, the fixed and flexible figures use only the months loaded.',
  failed: "Couldn't read the recurring charges, so the fixed and flexible figures use only the months loaded.",
  offline: "You're offline, so the fixed and flexible figures use only the months saved on this device.",
} as const
