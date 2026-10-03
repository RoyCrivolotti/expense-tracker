import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { installFakeMatchMedia } from '../../../../testing/fakeMatchMedia'
import { makeScenario } from '../../../../testing/factories'
import { MilestoneMatrix } from './MilestoneMatrix'
import { NARROW_MQ } from '../useGoalsNarrow'

const draft = makeScenario({ id: 0, name: 'Draft' })

const plan = makeScenario({
  id: 1,
  name: 'Path A',
  isActive: true,
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 100_000,
})
// A tenth of the saving: 1M is out of reach within 30 years.
const slower = makeScenario({
  id: 2,
  name: 'Path B',
  planStartDate: '2026-01-01',
  startInvestedCents: 10_000_000,
  monthlyContributionCents: 10_000,
})
// Starts at 300k, so the 100k and 200k are already there, the 1M comes in the same year as the 750k at the plan's pace.
const milestones = [
  { amountCents: 10_000_000, label: '' },
  { amountCents: 20_000_000, label: 'House deposit' },
  { amountCents: 100_000_000, label: '' },
]
const reached = new Map([[10_000_000, '2026-05-14']])

function renderMatrix(props: Partial<Parameters<typeof MilestoneMatrix>[0]> = {}) {
  return render(
    <MilestoneMatrix
      scenarios={[plan, slower]}
      draft={draft}
      milestones={milestones}
      reached={reached}
      includeDraft={false}
      {...props}
    />,
  )
}

async function openTimeline() {
  await userEvent.click(screen.getByRole('radio', { name: 'Timeline' }))
}

describe('the switch between the table and the timeline', () => {
  afterEach(() => {
    installFakeMatchMedia().setMatching(() => false)
  })

  it('is in the card\'s header on the wide page, with the table showing', () => {
    renderMatrix()

    const group = screen.getByRole('radiogroup', { name: 'Show years to milestone as' })
    expect(within(group).getByRole('radio', { name: 'Table' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'Timeline' })).not.toBeChecked()
    expect(screen.getByRole('grid')).toBeVisible()
    expect(screen.queryByRole('group', { name: /Follow one milestone/ })).toBeNull()
  })

  it('swaps the table for the timeline and back, and keeps the table\'s toggles while away', async () => {
    renderMatrix()
    await userEvent.click(screen.getByRole('button', { name: 'vs plan' }))

    await openTimeline()
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('group', { name: /Follow one milestone/ })).toBeInTheDocument()
    expect(screen.getByText(/Each dot is a milestone, at the year the path reaches it/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Table' }))
    expect(screen.getByRole('grid')).toBeVisible()
    expect(screen.getByRole('button', { name: 'vs plan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is not there on a phone, which has the table alone', () => {
    installFakeMatchMedia().setMatching((query) => query === NARROW_MQ)
    renderMatrix()

    expect(screen.queryByRole('radiogroup', { name: 'Show years to milestone as' })).toBeNull()
    expect(screen.getByRole('grid')).toBeVisible()
  })

  it('is not there without milestones', () => {
    renderMatrix({ milestones: [] })

    expect(screen.queryByRole('radiogroup', { name: 'Show years to milestone as' })).toBeNull()
  })
})

describe('the timeline', () => {
  it('has a row per path with its name, and the axis in years and in calendar years', async () => {
    renderMatrix()
    await openTimeline()

    const names = within(document.querySelector<HTMLElement>('[class*="tlNames"]')!)
    expect(names.getByText('Path A')).toBeInTheDocument()
    expect(names.getByText('Path B')).toBeInTheDocument()
    expect(screen.getByText('start')).toBeInTheDocument()
    expect(screen.getByText('30y')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('2056')).toBeInTheDocument()
  })

  it('draws a milestone as a dot a screen reader can read, in the sentence the table uses', async () => {
    renderMatrix()
    await openTimeline()

    const dot = screen.getByRole('button', { name: /^Path A reaches House deposit \(200k €\) in \d+ years, by 20\d\d\.$/ })
    expect(dot).toBeInTheDocument()
  })

  it('collapses what is already there into a badge at the left and what is out of reach into one at the right', async () => {
    renderMatrix()
    await openTimeline()

    expect(screen.getByRole('button', { name: "Path A already has 100k € (reached by May '26)." })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Path B already has 100k € (reached by May '26)." })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Path B does not reach 1,0M € within its 30 year horizon.' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Path A does not reach/ })).toBeNull()
  })

  it('says a milestone met at the start was met there, and not reached by a check-in', async () => {
    renderMatrix({ reached: new Map() })
    await openTimeline()

    expect(screen.getByRole('button', { name: 'Path A already has 100k € (met at its start).' })).toBeInTheDocument()
  })

  it('writes the sentence in the same live region when a dot is pointed at, focused or pressed', async () => {
    renderMatrix()
    await openTimeline()
    const dot = screen.getByRole('button', { name: /^Path A reaches House deposit/ })

    expect(screen.getByText(/Point at or focus a dot or a badge to read it as a sentence/)).toHaveAttribute('aria-live', 'polite')
    await userEvent.hover(dot)
    expect(screen.getByText(dot.getAttribute('aria-label')!, { selector: 'p[aria-live]' })).toBeInTheDocument()

    const badge = screen.getByRole('button', { name: /^Path B does not reach/ })
    act(() => badge.focus())
    expect(screen.getByText(badge.getAttribute('aria-label')!, { selector: 'p[aria-live]' })).toBeInTheDocument()
  })

  it('reaches the dots by Tab in row order and reads one out with Enter or Space', async () => {
    renderMatrix()
    await openTimeline()
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    const dots = names.filter((n) => /^Path [AB] (reaches|already|does not)/.test(n))

    // Path A's badge, dots and then Path B's, never Path B before Path A.
    expect(dots.findIndex((n) => n.startsWith('Path B'))).toBeGreaterThan(dots.map((n) => n.startsWith('Path A')).lastIndexOf(true))

    const first = screen.getByRole('button', { name: /^Path A reaches House deposit/ })
    act(() => first.focus())
    await userEvent.keyboard('{Enter}')
    expect(screen.getByText(first.getAttribute('aria-label')!, { selector: 'p[aria-live]' })).toBeInTheDocument()
    const badge = screen.getByRole('button', { name: /^Path B does not reach/ })
    act(() => badge.focus())
    await userEvent.keyboard(' ')
    expect(screen.getByText(badge.getAttribute('aria-label')!, { selector: 'p[aria-live]' })).toBeInTheDocument()
  })

  it('joins milestones that fall in the same year in one dot, with their number, and names them all', async () => {
    const same = makeScenario({ ...plan, id: 3, name: 'Path C', isActive: false, startInvestedCents: 5_000_000, monthlyContributionCents: 1_000_000, planStartDate: '2026-01-01' })
    renderMatrix({
      scenarios: [plan, same],
      milestones: [
        { amountCents: 20_000_000, label: '' },
        { amountCents: 25_000_000, label: '' },
        { amountCents: 100_000_000, label: '' },
      ],
      reached: new Map(),
    })
    await openTimeline()

    const dot = screen.getByRole('button', { name: /^Path C reaches 200k € and 250k € in \d+ years/ })
    expect(dot).toHaveTextContent('2')
  })

  it('ends a path with a shorter horizon in hatching and puts the badge past its end', async () => {
    const short = makeScenario({ ...slower, id: 4, name: 'Path D', horizonYears: 20 })
    renderMatrix({ scenarios: [plan, short] })
    await openTimeline()

    expect(document.querySelectorAll('[class*="tlHatch"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Path D does not reach 1,0M € within its 20 year horizon.' })).toBeInTheDocument()
  })

  it('draws the editing path\'s dots with a dashed ring, and says so in the key', async () => {
    renderMatrix({ includeDraft: true })
    await openTimeline()

    const draftDot = screen.getByRole('button', { name: /^Draft \(editing\) reaches House deposit/ })
    expect(draftDot.className).toMatch(/tlDotDraft/)
    expect(screen.getByText('Dashed ring: the path you are editing')).toBeInTheDocument()
  })

  it('names the badges in a key, and the number in a dot', async () => {
    renderMatrix()
    await openTimeline()

    expect(screen.getByText(/milestones already there: reached by a check-in, or met at the path's start/)).toBeInTheDocument()
    expect(screen.getByText(/milestones not within the path's horizon/)).toBeInTheDocument()
    expect(screen.getByText(/A shorter horizon ends in hatching/)).toBeInTheDocument()
    expect(screen.getByText(/A number in a dot: milestones that fall in the same year/)).toBeInTheDocument()
  })
})

describe('following one milestone', () => {
  it('has a chip for each milestone that is still ahead, and none for the ones the check-ins reached', async () => {
    renderMatrix()
    await openTimeline()

    const chips = within(screen.getByRole('group', { name: /Follow one milestone/ })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['200k', '1,0M'])
  })

  it('has a chip for each when every milestone has been reached', async () => {
    renderMatrix({ reached: new Map(milestones.map((m) => [m.amountCents, '2026-05-14'])) })
    await openTimeline()

    const chips = within(screen.getByRole('group', { name: /Follow one milestone/ })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['100k', '200k', '1,0M'])
  })

  it('marks the dot of the chosen milestone on each path, dims the rest and labels the year', async () => {
    renderMatrix()
    await openTimeline()
    const chip = screen.getByRole('button', { name: '200k' })

    await userEvent.click(chip)

    expect(chip).toHaveAttribute('aria-pressed', 'true')
    const picked = document.querySelectorAll('[class*="tlDotPick"]')
    expect(picked).toHaveLength(2)
    expect(document.querySelector('[class*="tlDim"]')).not.toBeNull()
    expect(document.querySelectorAll('[class*="tlLabelPick"]')).toHaveLength(2)
    for (const label of document.querySelectorAll('[class*="tlLabelPick"]')) expect(label.textContent).toMatch(/^\d+y$/)
  })

  it('joins the paths at that milestone with a dashed line, and takes it away with Clear', async () => {
    renderMatrix()
    await openTimeline()
    expect(document.querySelector('svg polyline')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '200k' }))
    const points = document.querySelector('svg polyline')!.getAttribute('points')!.split(' ')
    expect(points).toHaveLength(2)
    // Down the page, Path A first: the same height on each path's row, 54px apart.
    const [a, b] = points.map((p) => Number(p.split(',')[1]))
    expect(b! - a!).toBe(54)

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(document.querySelector('svg polyline')).toBeNull()
    expect(document.querySelector('[class*="tlDim"]')).toBeNull()
  })

  it('draws no line through a milestone only one path reaches', async () => {
    renderMatrix()
    await openTimeline()

    await userEvent.click(screen.getByRole('button', { name: '1,0M' }))

    expect(document.querySelector('svg polyline')).toBeNull()
  })

  it('lets a second press of the same chip stop following', async () => {
    renderMatrix()
    await openTimeline()
    const chip = screen.getByRole('button', { name: '200k' })

    await userEvent.click(chip)
    await userEvent.click(chip)

    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })
})
