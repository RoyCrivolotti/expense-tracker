import { describe, expect, it, vi } from 'vitest'
import { makeFlag } from '../../testing/factories'
import type { ExpenseActions } from '../actions'
import { createFlagInPlace, duplicateFlagName, quickFlagDraft } from './quickFlag'

describe('quickFlagDraft', () => {
  it('carries the reimbursable choice through rather than forcing it', () => {
    // A "Tax deductible" flag is a note to self, not money anyone will repay —
    // offering it an expense report produces a document addressed to nobody.
    expect(quickFlagDraft('Tax deductible', [], false)?.reimbursable).toBe(false)
    expect(quickFlagDraft('Work travel', [], true)?.reimbursable).toBe(true)
  })

  it('defaults to reimbursable when nothing is said, like the full editor', () => {
    expect(quickFlagDraft('Madrid trip', [])?.reimbursable).toBe(true)
  })

  it('takes the same defaults the full editor opens on', () => {
    // Drifting from initialFlagDraft would mean a flag made here behaves
    // differently from one made in Settings, with nothing on screen to say so.
    const draft = quickFlagDraft('Madrid trip', [])
    expect(draft).toMatchObject({ name: 'Madrid trip', reimbursable: true, active: true })
  })

  it('trims, so a stray space does not become part of the name', () => {
    expect(quickFlagDraft('  Madrid trip  ', [])?.name).toBe('Madrid trip')
  })

  it('is null for a blank name rather than creating an unnamed flag', () => {
    expect(quickFlagDraft('', [])).toBeNull()
    expect(quickFlagDraft('   ', [])).toBeNull()
  })

  it('picks a colour that is not already in use', () => {
    const existing = [makeFlag({ id: 1, color: '#6366f1' }), makeFlag({ id: 2, color: '#10b981' })]
    const draft = quickFlagDraft('Third', existing)
    expect(draft?.color).not.toBe('#6366f1')
    expect(draft?.color).not.toBe('#10b981')
  })

  it('lands at the end of the list, matching the full editor', () => {
    const existing = [makeFlag({ id: 1, sortOrder: 0 }), makeFlag({ id: 2, sortOrder: 4 })]
    expect(quickFlagDraft('Next', existing)?.sortOrder).toBe(5)
  })

  it('starts at zero when there is nothing to sort after', () => {
    expect(quickFlagDraft('First', [])?.sortOrder).toBe(0)
  })

  it('leaves the description empty, since it prints on the report', () => {
    expect(quickFlagDraft('Madrid trip', [])?.description).toBeUndefined()
  })
})

describe('duplicateFlagName', () => {
  it('ignores case and surrounding space', () => {
    const existing = [makeFlag({ id: 1, name: 'Work travel' })]
    expect(duplicateFlagName('  work TRAVEL ', existing)).toBe(true)
    expect(duplicateFlagName('Work travels', existing)).toBe(false)
  })

  it('is false against no flags at all', () => {
    expect(duplicateFlagName('Anything', [])).toBe(false)
  })
})

describe('createFlagInPlace', () => {
  it('creates the flag and hands back its id for selection', async () => {
    const createFlag = vi.fn().mockResolvedValue(makeFlag({ id: 77, name: 'Madrid trip' }))
    const actions = { createFlag } as unknown as ExpenseActions

    await expect(createFlagInPlace(actions, [])('Madrid trip', true)).resolves.toBe(77)
    expect(createFlag).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Madrid trip', reimbursable: true }),
    )
  })

  it('throws rather than calling the API with a blank name', async () => {
    const createFlag = vi.fn()
    const actions = { createFlag } as unknown as ExpenseActions

    await expect(createFlagInPlace(actions, [])('   ', true)).rejects.toThrow('Enter a name')
    expect(createFlag).not.toHaveBeenCalled()
  })
})
