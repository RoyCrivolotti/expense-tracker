/**
 * What a read-only session says about scenarios. Edits are still allowed there (the charts answer
 * what-ifs), they just have nowhere to go, so once there are some the note says what that means
 * for them.
 */
export function readOnlyScenarioNote(hasEdits: boolean): string {
  return hasEdits
    ? 'Read-only session, so these changes cannot be saved. They are lost when you leave Goals or reload.'
    : 'Read-only session — scenarios cannot be saved.'
}

/** The end of the discard question: what keeping the edits would take, which a read-only session cannot do. */
export function keepEditsHint(canSave: boolean, detached: boolean): string {
  if (!canSave) return 'This session is read-only, so they cannot be saved.'
  return detached ? 'Save the draft as a new scenario first to keep them.' : 'Save changes first to keep them.'
}
