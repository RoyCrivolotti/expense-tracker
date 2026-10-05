import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { entryDraftPatch } from './goalsView'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

beforeAll(() => {
  installFakeMatchMedia()
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
})

describe('entryDraftPatch', () => {
  it('turns a baseline entry into an annual-spend draft edit, and nothing else into one', () => {
    expect(entryDraftPatch({ kind: 'baseline', monthlyCents: 250_000 })).toEqual({
      annualSpendCents: 3_000_000,
    })
    expect(entryDraftPatch('checkin')).toBeNull()
    expect(entryDraftPatch(null)).toBeNull()
    expect(entryDraftPatch(undefined)).toBeNull()
  })
})

describe('GoalsTab baseline entry', () => {
  function goalsModel() {
    return buildExpenseModel(
      makeDataset({
        goalScenarios: [
          makeScenario({ id: 1, name: 'Path A', isActive: true, annualSpendCents: 2_400_000 }),
        ],
      }),
    )
  }

  it('opens Plan with the measured spend as an unsaved draft edit, never a silent save', () => {
    render(
      <GoalsTab
        model={goalsModel()}
        actions={makeActions()}
        entry={{ kind: 'baseline', monthlyCents: 250_000 }}
      />,
    )
    // The prefill is a dirty draft: the Save group is up, and nothing was written.
    expect(screen.getByRole('group', { name: 'Unsaved changes' })).toBeInTheDocument()
  })

  it('leaves the draft clean without a baseline entry', () => {
    render(<GoalsTab model={goalsModel()} actions={makeActions()} />)
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull()
  })
})
