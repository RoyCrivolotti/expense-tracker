import type { UnsavedWork } from './leaveGuardContext'

/** What leaving costs, in the words of the screen the edits are on. */
export function leaveMessage({ name, detached, canSave }: UnsavedWork): string {
  const lost = detached
    ? 'The unsaved draft will be lost if you leave.'
    : `Your changes to ${name} will be lost if you leave.`
  if (!canSave) return `${lost} This session is read-only, so ${detached ? 'it' : 'they'} can't be saved.`
  const keep = detached ? 'Stay and save it as a new scenario first to keep it.' : 'Stay and save first to keep them.'
  return `${lost} ${keep}`
}
