import { describe, expect, it, vi } from 'vitest'
import { makeLabel } from '../../testing/factories'
import type { ExpenseActions } from '../actions'
import { createLabelInPlace, duplicateLabelName, quickLabelDraft } from './quickLabel'

describe('quickLabelDraft', () => {
  it('takes the same defaults the full editor opens on', () => {
    // Drifting from initialLabelDraft would mean a label made here behaves
    // differently from one made in Settings, with nothing on screen to say so.
    const draft = quickLabelDraft('Madrid trip', [])
    expect(draft).toMatchObject({ name: 'Madrid trip', active: true })
  })

  it('trims, so a stray space does not become part of the name', () => {
    expect(quickLabelDraft('  Madrid trip  ', [])?.name).toBe('Madrid trip')
  })

  it('is null for a blank name rather than creating an unnamed label', () => {
    expect(quickLabelDraft('', [])).toBeNull()
    expect(quickLabelDraft('   ', [])).toBeNull()
  })

  it('picks a colour that is not already in use', () => {
    const existing = [makeLabel({ id: 1, color: '#6366f1' }), makeLabel({ id: 2, color: '#10b981' })]
    const draft = quickLabelDraft('Third', existing)
    expect(draft?.color).not.toBe('#6366f1')
    expect(draft?.color).not.toBe('#10b981')
  })

  it('lands at the end of the list, matching the full editor', () => {
    const existing = [makeLabel({ id: 1, sortOrder: 0 }), makeLabel({ id: 2, sortOrder: 4 })]
    expect(quickLabelDraft('Next', existing)?.sortOrder).toBe(5)
  })

  it('starts at zero when there is nothing to sort after', () => {
    expect(quickLabelDraft('First', [])?.sortOrder).toBe(0)
  })

  it('leaves the description empty, since a guess would be wrong as often as right', () => {
    expect(quickLabelDraft('Madrid trip', [])?.description).toBeUndefined()
  })
})

describe('duplicateLabelName', () => {
  it('ignores case and surrounding space', () => {
    const existing = [makeLabel({ id: 1, name: 'Japan trip' })]
    expect(duplicateLabelName('  japan TRIP ', existing)).toBe(true)
    expect(duplicateLabelName('Japan trips', existing)).toBe(false)
  })

  it('is false against no labels at all', () => {
    expect(duplicateLabelName('Anything', [])).toBe(false)
  })
})

describe('createLabelInPlace', () => {
  it('creates the label and hands back its id for selection', async () => {
    const createLabel = vi.fn().mockResolvedValue(makeLabel({ id: 77, name: 'Madrid trip' }))
    const actions = { createLabel } as unknown as ExpenseActions

    await expect(createLabelInPlace(actions, [])('Madrid trip')).resolves.toBe(77)
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({ name: 'Madrid trip' }))
  })

  it('throws rather than calling the API with a blank name', async () => {
    const createLabel = vi.fn()
    const actions = { createLabel } as unknown as ExpenseActions

    await expect(createLabelInPlace(actions, [])('   ')).rejects.toThrow('Enter a name')
    expect(createLabel).not.toHaveBeenCalled()
  })
})
