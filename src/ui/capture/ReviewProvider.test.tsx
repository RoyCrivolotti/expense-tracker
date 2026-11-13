import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as cardsApi from '../../data/captureCardsApi'
import * as decisions from '../../data/recommendationDecisionsApi'
import * as api from '../../data/recommendationsApi'
import { makeActions } from '../../testing/makeActions'
import { makeTransaction } from '../../testing/factories'
import { pushAt, arrivedAt, makeRecommendation, makeReviewModel } from '../../testing/reviewKit'
import type { ExpenseActions } from '../actions'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { ToastContext } from '../hooks/useToast'
import { ReviewProvider } from './ReviewProvider'
import { useReviewCore } from './reviewContext'
import { useReviewApi } from './useReviewApi'
import { UNDO_SHORTCUT } from '../components/toastShortcuts'
import { UNDO_MS } from './usePendingAction'

vi.mock('../../data/captureCardsApi', async (original) => ({ ...(await original<typeof cardsApi>()), linkCard: vi.fn() }))
vi.mock('../../data/recommendationsApi', async (original) => ({
  ...(await original<typeof api>()),
  fetchRecommendations: vi.fn(),
}))
vi.mock('../../data/recommendationDecisionsApi', () => ({ dismissRecommendation: vi.fn(), linkRecommendation: vi.fn() }))

const A = '0b0c0d0e-1111-4222-8333-444455556661'
const B = '0b0c0d0e-1111-4222-8333-444455556662'
const C = '0b0c0d0e-1111-4222-8333-444455556663'
const model = makeReviewModel()
const showToast = vi.fn()
const dismissToast = vi.fn()

function Probe() {
  const core = useReviewCore()
  return core ? <Rows core={core} /> : <p>off</p>
}

function Rows({ core }: { core: NonNullable<ReturnType<typeof useReviewCore>> }) {
  const r = useReviewApi(core)
  return (
    <div>
      <p data-testid="count">{r.count}</p>
      <p data-testid="write">{String(r.canWrite)}</p>
      {r.views.map((v) => (
        <div key={v.rec.id} data-testid={v.rec.id}>
          <span>{v.description}</span>
          <span data-testid={`ready-${v.rec.id.slice(-1)}`}>{v.oneTap ? 'ready' : `review:${v.accountId ?? 'none'}`}</span>
          <span>{r.failures.get(v.rec.id)}</span>
          <button onClick={() => r.add(v)}>add {v.rec.id.slice(-1)}</button>
          <button onClick={() => r.dontAdd(v)}>skip {v.rec.id.slice(-1)}</button>
          <button onClick={() => r.link(v)}>link {v.rec.id.slice(-1)}</button>
          <button onClick={() => r.review(v)}>review {v.rec.id.slice(-1)}</button>
        </div>
      ))}
    </div>
  )
}

const page = (...recs: api.RecommendationInfo[]): api.RecommendationPage => ({ recommendations: recs, next: null, openCount: recs.length })
const known = (id: string, over: Partial<api.RecommendationInfo> = {}) => makeRecommendation({ id, ...over })

async function show(recs: api.RecommendationInfo[], readOnly = false) {
  const actions: ExpenseActions | undefined = readOnly ? undefined : makeActions({ submitRecommendation: vi.fn().mockResolvedValue(makeTransaction({ id: 50 })) })
  vi.mocked(api.fetchRecommendations).mockResolvedValue(page(...recs))
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <ToastContext.Provider value={{ showToast, dismissToast }}>
        <ReviewProvider model={model} actions={actions}>
          <Probe />
        </ReviewProvider>
      </ToastContext.Provider>
    </MoneyFormatProvider>,
  )
  await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
  return actions
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const press = (name: string) => act(() => void fireEvent.click(screen.getByRole('button', { name })))

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?capture=on')
  vi.mocked(decisions.dismissRecommendation).mockResolvedValue(undefined)
  vi.mocked(decisions.linkRecommendation).mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  showToast.mockReset()
  dismissToast.mockReset()
  window.history.replaceState(null, '', '/')
})

describe('the capture flag', () => {
  it('keeps everything off, and reads nothing, until it is on', async () => {
    window.history.replaceState(null, '', '/?capture=off')
    await show([known(A)])

    expect(screen.getByText('off')).toBeInTheDocument()
    expect(api.fetchRecommendations).not.toHaveBeenCalled()
  })
})

describe('one tap', () => {
  it('hides the row at once, sends nothing for five seconds, then sends exactly what the toast said', async () => {
    const actions = await show([known(A), known(B, { merchantRaw: 'BRAND NEW PLACE' })])
    expect(screen.getByTestId('count')).toHaveTextContent('2')

    press('add 1')

    expect(screen.queryByTestId(A)).not.toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    const [text, tone, action, options] = showToast.mock.calls[0] as [string, string, { label: string; shortcut: unknown }, object]
    expect(text.split('\n')[1]).toBe('Expense · Eating out · Main Debit · Tue 10 Nov · Nov budget')
    expect([tone, action.label, action.shortcut]).toEqual(['success', 'Undo', UNDO_SHORTCUT])
    expect(options).toEqual({ holdMs: UNDO_MS, key: `review:${A}`, keepOnTap: true })
    await tick(UNDO_MS - 1)
    expect(actions!.submitRecommendation).not.toHaveBeenCalled()

    await tick(1)
    expect(actions!.submitRecommendation).toHaveBeenCalledWith(A, {
      date: '2026-11-10',
      budgetMonth: '2026-11',
      description: 'Cafe Example',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 1250,
      cancelled: false,
      flagId: null,
    })
    expect(screen.queryByTestId(A)).not.toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('does nothing for a payment in doubt, however it is pressed', async () => {
    const actions = await show([known(A, { merchantRaw: 'BRAND NEW PLACE' })])

    press('add 1')
    await tick(UNDO_MS * 2)

    expect(actions!.submitRecommendation).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(screen.getByTestId(A)).toBeInTheDocument()
  })

  it('brings the row back on Undo and sends nothing', async () => {
    const actions = await show([known(A)])
    press('add 1')

    const action = showToast.mock.calls[0]![2] as { onAction: () => void }
    act(() => action.onAction())
    await tick(UNDO_MS * 2)

    expect(screen.getByTestId(A)).toBeInTheDocument()
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(actions!.submitRecommendation).not.toHaveBeenCalled()
  })

  it('sends the earlier action the moment a new one starts, and Undo then covers only the new one', async () => {
    const actions = await show([known(A), known(B)])
    press('add 1')

    press('skip 2')
    expect(actions!.submitRecommendation).toHaveBeenCalledOnce()
    const undo = showToast.mock.calls[1]![2] as { onAction: () => void }
    act(() => undo.onAction())
    await tick(UNDO_MS * 2)

    expect(decisions.dismissRecommendation).not.toHaveBeenCalled()
    expect(screen.getByTestId(B)).toBeInTheDocument()
  })

  it('puts the row back with the reason when the server refuses, and says so', async () => {
    const actions = await show([known(A)])
    vi.mocked(actions!.submitRecommendation!).mockRejectedValue(new Error('This recommendation was already decided'))

    press('add 1')
    await tick(UNDO_MS)

    expect(screen.getByTestId(A)).toBeInTheDocument()
    expect(screen.getByText('This recommendation was already decided')).toBeInTheDocument()
    expect(showToast).toHaveBeenLastCalledWith("Couldn't add Cafe Example. It is back in the list.", 'error')
  })

  it('says something plain when the failure is not an Error, and clears the reason on the next try', async () => {
    const actions = await show([known(A)])
    vi.mocked(actions!.submitRecommendation!).mockRejectedValueOnce('boom').mockResolvedValue(makeTransaction({ id: 51 }))
    press('add 1')
    await tick(UNDO_MS)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    press('add 1')

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('does not let an earlier action that fails replace the Undo of the newer one it made way for', async () => {
    const actions = await show([known(A), known(B)])
    vi.mocked(actions!.submitRecommendation!).mockRejectedValue(new Error('Request failed (500)'))
    press('add 1')

    press('skip 2')
    await tick(0)

    expect(screen.getByText('Request failed (500)')).toBeInTheDocument()
    expect(showToast.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['success', 'success'])
    const undo = showToast.mock.calls[1]![2] as { onAction: () => void }
    act(() => undo.onAction())
    expect(screen.getByTestId(B)).toBeInTheDocument()
  })

  it('takes the Undo down when its action is sent, however it is sent', async () => {
    const actions = await show([known(A), known(B)])
    press('add 1')
    await tick(UNDO_MS)
    expect(dismissToast).toHaveBeenCalledWith(`review:${A}`)

    dismissToast.mockClear()
    press('skip 2')
    expect(dismissToast).not.toHaveBeenCalled()
    await tick(UNDO_MS)
    expect(dismissToast).toHaveBeenCalledWith(`review:${B}`)
    expect(actions!.onAdd).not.toHaveBeenCalled()
  })

  it('sends the held action when the app goes out of sight', async () => {
    const actions = await show([known(A)])
    press('add 1')

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    expect(actions!.submitRecommendation).toHaveBeenCalledOnce()
  })

  it('cannot add where the app cannot write, and says so', async () => {
    await show([known(A)], true)

    expect(screen.getByTestId('write')).toHaveTextContent('false')
    press('add 1')
    press('skip 1')
    press('link 1')
    press('review 1')
    await tick(UNDO_MS * 2)

    expect(showToast).not.toHaveBeenCalled()
    expect(decisions.dismissRecommendation).not.toHaveBeenCalled()
    expect(screen.getByTestId(A)).toBeInTheDocument()
  })
})

describe("Don't add", () => {
  it('removes only that payment after the window, creates nothing, and says it teaches the app nothing', async () => {
    const actions = await show([known(A), known(B)])

    press('skip 1')

    expect(showToast.mock.calls[0]![0]).toContain('Only this suggestion is removed')
    expect(showToast.mock.calls[0]![0]).toContain('learns nothing')
    await tick(UNDO_MS)
    expect(decisions.dismissRecommendation).toHaveBeenCalledExactlyOnceWith(A)
    expect(actions!.submitRecommendation).not.toHaveBeenCalled()
    expect(screen.queryByTestId(A)).not.toBeInTheDocument()
    expect(screen.getByTestId(B)).toBeInTheDocument()
  })

  it('puts the row back when the server refuses', async () => {
    await show([known(A)])
    vi.mocked(decisions.dismissRecommendation).mockRejectedValue(new Error('Request failed (500)'))

    press('skip 1')
    await tick(UNDO_MS)

    expect(screen.getByTestId(A)).toBeInTheDocument()
    expect(showToast).toHaveBeenLastCalledWith("Couldn't remove Cafe Example. It is back in the list.", 'error')
  })
})

describe('Link', () => {
  it('links to the typed row the server named, once the window ends', async () => {
    await show([known(A, { possibleMatch: { transactionId: 9, description: 'Cafe', date: '2026-11-09' } })])

    press('link 1')

    expect(showToast.mock.calls[0]![0]).toContain('To your typed row "Cafe". Nothing new is added.')
    await tick(UNDO_MS)
    expect(decisions.linkRecommendation).toHaveBeenCalledExactlyOnceWith(A, 9)
    expect(screen.queryByTestId(A)).not.toBeInTheDocument()
  })

  it('does nothing for a payment with no named match', async () => {
    await show([known(A)])

    press('link 1')
    await tick(UNDO_MS)

    expect(decisions.linkRecommendation).not.toHaveBeenCalled()
  })

  it('puts the row back when the server says another recommendation already answers for that row', async () => {
    await show([known(A, { possibleMatch: { transactionId: 9, description: 'Cafe', date: '2026-11-09' } })])
    vi.mocked(decisions.linkRecommendation).mockRejectedValue(new Error('That transaction already answers for another recommendation'))

    press('link 1')
    await tick(UNDO_MS)

    expect(screen.getByText('That transaction already answers for another recommendation')).toBeInTheDocument()
    expect(showToast).toHaveBeenLastCalledWith("Couldn't link Cafe Example. It is back in the list.", 'error')
  })
})

describe('review', () => {
  it('opens the add form for the payment with the others queued behind it, skipping any decided meanwhile', async () => {
    const actions = await show([known(A), known(B, { merchantRaw: 'BRAND NEW PLACE' }), known(C, { merchantRaw: 'OTHER NEW PLACE' })])

    press('review 1')

    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!
    expect(seed).toMatchObject({ recommendationId: A, amountCents: 1250 })
    expect(seed.queue!.left).toBe(2)
    press('skip 2')
    expect(seed.queue!.left).toBe(2)
    const next = seed.queue!.next()
    expect(next).toMatchObject({ recommendationId: C })
    expect(next!.queue!.left).toBe(0)
    expect(next!.queue!.next()).toBeUndefined()
  })

  it('takes the Undo down when the form opens and sends the held action first', async () => {
    const actions = await show([known(A), known(B, { merchantRaw: 'BRAND NEW PLACE' })])
    press('add 1')

    press('review 2')

    expect(dismissToast).toHaveBeenCalledWith(`review:${A}`)
    expect(actions!.onAdd).toHaveBeenCalledOnce()
  })

  it('sends a held action before the form opens, because the form saves at once', async () => {
    const actions = await show([known(A), known(B)])
    press('add 1')

    press('review 2')

    expect(actions!.submitRecommendation).toHaveBeenCalledOnce()
    expect(actions!.onAdd).toHaveBeenCalledOnce()
  })

  it('"Don\'t add" in the form hands over to the next payment, and the last one hands over nothing', async () => {
    const actions = await show([known(A, { merchantRaw: 'BRAND NEW PLACE' }), known(B, { merchantRaw: 'OTHER NEW PLACE' })])
    press('review 1')
    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!

    const next = seed.queue!.dontAdd()

    expect(next).toMatchObject({ recommendationId: B })
    expect(showToast.mock.calls[0]![0]).toContain('Not added')
    expect(next!.queue!.dontAdd()).toBeUndefined()
  })

  it('reads the clock of the payment, so the toast for a late push shows its own date', async () => {
    const late = known(A, { localDate: '2026-12-01', occurredAt: pushAt(2026, 12, 1, 10, 41), createdAt: arrivedAt(2026, 12, 1, 10, 42) })
    await show([late])

    press('add 1')

    expect(showToast.mock.calls[0]![0]).toContain('Tue 1 Dec')
    expect(showToast.mock.calls[0]![0]).toContain('Dec budget')
  })
})

describe('a card linked from the form', () => {
  const card = { source: 'iberia' as const, digits: '4821' }
  const three = () => [known(A, { accountId: null, card }), known(B, { accountId: null, card }), known(C, { accountId: null, card })]

  it('asks about the card, then after it is linked all three payments from it are ready for one tap', async () => {
    vi.mocked(cardsApi.linkCard).mockResolvedValue(undefined)
    const actions = await show(three())
    expect(['1', '2', '3'].map((n) => screen.getByTestId(`ready-${n}`).textContent)).toEqual(['review:none', 'review:none', 'review:none'])
    press('review 1')
    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!
    expect(seed.card).toMatchObject({ ...card, answer: { accountId: null, remember: true } })

    // The read that follows the link has not come back yet, so the payments take the account from what was just linked.
    vi.mocked(api.fetchRecommendations).mockImplementation(() => new Promise(() => undefined))
    await act(async () => void (await seed.card!.remember(2)))

    expect(cardsApi.linkCard).toHaveBeenCalledWith('iberia', '4821', 2)
    expect(['1', '2', '3'].map((n) => screen.getByTestId(`ready-${n}`).textContent)).toEqual(['ready', 'ready', 'ready'])
  })

  it('keeps the account when the read that follows brings the server own rows', async () => {
    vi.mocked(cardsApi.linkCard).mockResolvedValue(undefined)
    const actions = await show(three())
    press('review 1')
    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!
    vi.mocked(api.fetchRecommendations).mockResolvedValue(page(...three().map((r) => ({ ...r, accountId: 2 }))))

    await act(async () => void (await seed.card!.remember(2)))
    await tick(0)

    expect(['1', '2', '3'].map((n) => screen.getByTestId(`ready-${n}`).textContent)).toEqual(['ready', 'ready', 'ready'])
  })

  it('says why, without showing a toast of its own, when the card cannot be remembered', async () => {
    vi.mocked(cardsApi.linkCard).mockRejectedValue(new Error('You already have the most card links allowed. Remove one first.'))
    const actions = await show([known(A, { accountId: null, card })])
    press('review 1')
    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!

    let why: string | null = null
    await act(async () => void (why = await seed.card!.remember(2)))

    expect(why).toBe('The payment was added, but this card could not be remembered: You already have the most card links allowed. Remove one first.')
    expect(showToast).not.toHaveBeenCalled()
  })

  it('says something plain when the failure is not an Error', async () => {
    vi.mocked(cardsApi.linkCard).mockRejectedValue('boom')
    const actions = await show([known(A, { accountId: null, card })])
    press('review 1')
    const seed = vi.mocked(actions!.onAdd).mock.calls[0]![0]!

    let why: string | null = null
    await act(async () => void (why = await seed.card!.remember(2)))

    expect(why).toBe('The payment was added, but this card could not be remembered: something went wrong')
  })

  it('asks nothing for a payment whose account is known or that showed no card', async () => {
    const actions = await show([known(A, { accountId: 1, card }), known(B, { accountId: null, card: null })])

    press('review 1')
    press('review 2')

    for (const call of vi.mocked(actions!.onAdd).mock.calls) expect(call[0]!.card).toBeUndefined()
  })
})

