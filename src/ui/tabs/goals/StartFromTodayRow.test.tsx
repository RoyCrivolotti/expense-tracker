import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFakeMatchMedia } from '../../../testing/fakeMatchMedia'
import { makeScenario } from '../../../testing/factories'
import { ScenarioChips } from './ScenarioChips'
import { StartFromTodayRow, StartFromTodayStatus, StartFromTodaySwitch } from './StartFromTodayRow'
import { NARROW_MQ } from './useGoalsNarrow'

let media: ReturnType<typeof installFakeMatchMedia>

beforeAll(() => {
  media = installFakeMatchMedia()
})

afterEach(() => media.setMatching(() => false))

const latest = { investedCents: 138_700_00, date: '2026-10-05' }

describe('StartFromTodayRow', () => {
  it('is a switch between two views, and changing it reports which one is wanted', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<StartFromTodayRow control={{ on: false, onChange }} latest={latest} />)

    const group = screen.getByRole('radiogroup', { name: 'Where the scenarios start from' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['As saved', 'My balance today'])
    await user.click(within(group).getByRole('radio', { name: 'My balance today' }))
    expect(onChange).toHaveBeenLastCalledWith(true)

    rerender(<StartFromTodayRow control={{ on: true, onChange }} latest={latest} />)
    await user.click(within(group).getByRole('radio', { name: 'As saved' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('names the balance and date while off, and that nothing is saved while on', () => {
    const { rerender } = render(<StartFromTodayRow control={{ on: false, onChange: vi.fn() }} latest={latest} />)
    expect(screen.getByText(/My balance today is .* on .*2026.*, your latest check-in \(invested money only\)\./)).toBeInTheDocument()
    expect(screen.queryByText('Details')).not.toBeInTheDocument()

    rerender(<StartFromTodayRow control={{ on: true, onChange: vi.fn() }} latest={latest} />)
    expect(screen.getByText(/Viewing every scenario from .*, your latest check-in\. Nothing is saved\./)).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('does not call it on without a check-in to start from, whatever it was left on', () => {
    render(<StartFromTodayRow control={{ on: true, onChange: vi.fn() }} latest={null} />)
    const group = screen.getByRole('radiogroup', { name: 'Where the scenarios start from' })
    expect(within(group).getByRole('radio', { name: 'As saved' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'My balance today' })).toBeDisabled()
    expect(screen.queryByText(/Viewing every scenario/)).not.toBeInTheDocument()
  })

  it('names several scenarios that keep their own start, in the plural', async () => {
    const user = userEvent.setup()
    render(<StartFromTodayRow control={{ on: true, onChange: vi.fn() }} latest={latest} notRestarted={['House now', 'Buy now']} />)
    await user.click(screen.getByText('Details'))
    expect(screen.getByText(/House now, Buy now are tagged "own start": they buy the house at year 0/)).toBeInTheDocument()
  })

  it('is the same switch on a phone, full width', () => {
    media.setMatching((query) => query === NARROW_MQ)
    render(<StartFromTodayRow control={{ on: false, onChange: vi.fn() }} latest={latest} />)
    expect(screen.getByRole('radiogroup', { name: 'Where the scenarios start from' }).className).toMatch(/groupBar/)
  })
})

describe('StartFromTodayStatus', () => {
  it('says nothing while off with a check-in, unless asked to, so a wide screen gives it no height', () => {
    const control = { on: false, onChange: vi.fn() }
    const { container, rerender } = render(<StartFromTodayStatus control={control} latest={latest} />)
    expect(container).toBeEmptyDOMElement()

    rerender(<StartFromTodayStatus control={control} latest={latest} showWhenOff />)
    expect(screen.getByText(/My balance today is .*, your latest check-in \(invested money only\)\./)).toBeInTheDocument()
  })

  it('says why there is nothing to switch to, with or without being asked to say more', () => {
    const control = { on: false, onChange: vi.fn() }
    const { rerender } = render(<StartFromTodayStatus control={control} latest={null} />)
    expect(screen.getByText('Log a wealth check-in to see the scenarios from your balance today.')).toBeInTheDocument()
    rerender(<StartFromTodayStatus control={control} latest={null} showWhenOff />)
    expect(screen.getByText('Log a wealth check-in to see the scenarios from your balance today.')).toBeInTheDocument()
  })

  it('names the balance and says nothing is saved while on, whatever is passed for the scenarios kept', () => {
    render(<StartFromTodayStatus control={{ on: true, onChange: vi.fn() }} latest={latest} />)
    expect(screen.getByText(/Viewing every scenario from .*, your latest check-in\. Nothing is saved\./)).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
  })
})

describe('StartFromTodaySwitch', () => {
  it('has no tooltip while on, when the line under it says the same, and none without a check-in', () => {
    const { container, rerender } = render(<StartFromTodaySwitch control={{ on: true, onChange: vi.fn() }} latest={latest} />)
    expect(container.firstElementChild).not.toHaveAttribute('title')
    rerender(<StartFromTodaySwitch control={{ on: false, onChange: vi.fn() }} latest={null} />)
    expect(container.firstElementChild).not.toHaveAttribute('title')
  })
})

describe('ScenarioChips', () => {
  it('tags a scenario that keeps its own start, and no other', () => {
    const a = makeScenario({ id: 1, name: 'Path A' })
    const b = makeScenario({ id: 2, name: 'House now' })
    render(
      <ScenarioChips
        scenarios={[a, b]}
        activeId={1}
        hiddenIds={new Set()}
        ownStartIds={new Set([2])}
        onSelect={vi.fn()}
        onSelectEditing={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )
    expect(screen.getAllByText('Own start')).toHaveLength(1)
    const chip = (name: string) => screen.getByText(name).closest('button')!
    expect(within(chip('House now')).getByText('Own start')).toBeInTheDocument()
    expect(within(chip('Path A')).queryByText('Own start')).not.toBeInTheDocument()
  })

  it('has no tag when none is given', () => {
    render(
      <ScenarioChips
        scenarios={[makeScenario({ id: 1, name: 'Path A' })]}
        activeId={null}
        hiddenIds={new Set()}
        onSelect={vi.fn()}
        onSelectEditing={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )
    expect(screen.queryByText('Own start')).not.toBeInTheDocument()
  })
})
