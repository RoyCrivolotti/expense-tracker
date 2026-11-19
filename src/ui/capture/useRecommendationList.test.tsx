import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import * as api from '../../data/recommendationsApi'
import { useRecommendationList } from './useRecommendationList'
import { RETURN_THROTTLE_MS, useHoldReloads, useReloadOnReturn } from './useReloadOnReturn'

vi.mock('../../data/recommendationsApi', async (original) => ({ ...(await original<typeof api>()), fetchRecommendations: vi.fn() }))
afterEach(() => vi.resetAllMocks())

const rec = (id: string): api.RecommendationInfo => ({
  id,
  accountId: 1,
  amountCents: 100,
  currency: 'EUR',
  localDate: '2026-11-10',
  occurredAt: '2026-11-10T09:00:00.000Z',
  createdAt: '2026-11-10T09:00:01.000Z',
  merchantRaw: 'SHOP',
  descriptionSuggested: null,
  suggestedType: 'expense',
})
const page = (ids: string[], next: string | null = null, openCount = ids.length): api.RecommendationPage => ({ recommendations: ids.map(rec), next, openCount })
const fetchMock = () => vi.mocked(api.fetchRecommendations)

describe('useRecommendationList', () => {
  it('reads the first page and the count', async () => {
    fetchMock().mockResolvedValue(page(['a', 'b'], null, 2))
    const { result } = renderHook(() => useRecommendationList())

    await waitFor(() => expect(result.current.items?.map((r) => r.id)).toEqual(['a', 'b']))
    expect(result.current.openCount).toBe(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('shows the reason a read failed, and clears it when a retry works', async () => {
    fetchMock().mockRejectedValueOnce(new ApiError('Request failed (500)', 500)).mockResolvedValueOnce(page(['a']))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.error).toBe('Request failed (500)'))

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('says something plain when the failure is not an Error', async () => {
    fetchMock().mockRejectedValue('boom')
    const { result } = renderHook(() => useRecommendationList())

    await waitFor(() => expect(result.current.error).toBe('Something went wrong'))
  })

  it('appends the next page, and keeps what it has when that read fails', async () => {
    fetchMock().mockResolvedValueOnce(page(['a'], 'c1', 2)).mockRejectedValueOnce(new ApiError('Request failed (503)', 503)).mockResolvedValueOnce(page(['b'], null, 2))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.hasMore).toBe(true))

    await act(() => result.current.more())
    expect(result.current.error).toBe('Request failed (503)')
    expect(result.current.items).toHaveLength(1)

    await act(() => result.current.more())
    expect(result.current.items?.map((r) => r.id)).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
    expect(result.current.hasMore).toBe(false)
  })

  it('does nothing on more when there is no next page', async () => {
    fetchMock().mockResolvedValue(page(['a']))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(() => result.current.more())

    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('drops a decided row and the count without another read', async () => {
    fetchMock().mockResolvedValue(page(['a', 'b'], null, 2))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.remove('a'))

    expect(result.current.items?.map((r) => r.id)).toEqual(['b'])
    expect(result.current.openCount).toBe(1)
    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('reads again when a recommendation is decided elsewhere, bringing back as many pages as were showing', async () => {
    fetchMock()
      .mockResolvedValueOnce(page(['a'], 'c1', 3))
      .mockResolvedValueOnce(page(['b'], 'c2', 3))
      .mockResolvedValueOnce(page(['b'], 'c2', 2))
      .mockResolvedValueOnce(page(['c'], null, 2))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    await act(() => result.current.more())

    act(() => api.announceRecommendationsChanged())

    await waitFor(() => expect(result.current.items?.map((r) => r.id)).toEqual(['b', 'c']))
    expect(fetchMock()).toHaveBeenLastCalledWith('c2')
  })

  it('keeps the rows it has when a later read fails, and shows the failure when Retry asks for one', async () => {
    fetchMock().mockResolvedValueOnce(page(['a'])).mockRejectedValueOnce(new ApiError('Request failed (500)', 500)).mockRejectedValueOnce(new ApiError('Request failed (500)', 500))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    act(() => api.reloadRecommendations())
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
    await act(async () => void (await Promise.resolve()))
    expect(result.current.error).toBeNull()
    expect(result.current.items).toHaveLength(1)

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.error).toBe('Request failed (500)'))
  })
})

describe('a read that was on its way when a payment was decided', () => {
  it('does not bring the payment back, nor count it, when it lands after the decision', async () => {
    let land: (p: api.RecommendationPage) => void = () => undefined
    fetchMock()
      .mockResolvedValueOnce(page(['a', 'b'], null, 2))
      .mockImplementationOnce(() => new Promise<api.RecommendationPage>((resolve) => (land = resolve)))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => api.reloadRecommendations())
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
    // The person decides "a" now; the server answers the read before it saw that.
    act(() => result.current.remove('a'))
    await act(() => {
      land(page(['a', 'b'], null, 2))
      return Promise.resolve()
    })

    expect(result.current.items?.map((r) => r.id)).toEqual(['b'])
    expect(result.current.openCount).toBe(1)
  })

  it('still shows a payment that comes back in a read begun after the decision', async () => {
    fetchMock().mockResolvedValueOnce(page(['a'], null, 1)).mockResolvedValueOnce(page(['a'], null, 1))
    const { result } = renderHook(() => useRecommendationList())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    act(() => result.current.remove('a'))

    act(() => api.reloadRecommendations())

    await waitFor(() => expect(result.current.items?.map((r) => r.id)).toEqual(['a']))
    expect(result.current.openCount).toBe(1)
  })
})

describe('reading again when the app returns', () => {
  const setVisibility = (state: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  const show = () => {
    setVisibility('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
  }

  function mount() {
    fetchMock().mockResolvedValue(page(['a']))
    return renderHook(() => {
      useReloadOnReturn()
      return useRecommendationList()
    })
  }

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('reads once when the app becomes visible after a while, and not when it is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1))
    vi.advanceTimersByTime(RETURN_THROTTLE_MS)

    setVisibility('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    show()

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
  })

  it('does not read again for a quick switch, and reads for the next return once the pause has passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1))

    show()
    show()
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(RETURN_THROTTLE_MS)
    show()
    show()

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
  })

  it('reads for a page restored from the back-forward cache', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1))
    vi.advanceTimersByTime(RETURN_THROTTLE_MS)

    act(() => void window.dispatchEvent(new Event('pageshow')))

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
  })

  it('waits while a form or sheet is open, and reads once when it closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock().mockResolvedValue(page(['a']))
    const { rerender } = renderHook(
      ({ open }) => {
        useReloadOnReturn()
        useHoldReloads(open)
        return useRecommendationList()
      },
      { initialProps: { open: true } },
    )
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1))
    vi.advanceTimersByTime(RETURN_THROTTLE_MS)

    show()
    await act(async () => void (await Promise.resolve()))
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    rerender({ open: false })

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2))
  })
})
