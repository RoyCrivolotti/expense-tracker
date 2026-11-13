import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import * as api from '../../data/recommendationsApi'
import { useRecommendationList } from './useRecommendationList'

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
  it('reads nothing while it is off', () => {
    const { result } = renderHook(() => useRecommendationList(false))

    expect(fetchMock()).not.toHaveBeenCalled()
    expect(result.current.items).toBeNull()
  })

  it('reads the first page and the count', async () => {
    fetchMock().mockResolvedValue(page(['a', 'b'], null, 2))
    const { result } = renderHook(() => useRecommendationList(true))

    await waitFor(() => expect(result.current.items?.map((r) => r.id)).toEqual(['a', 'b']))
    expect(result.current.openCount).toBe(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('shows the reason a read failed, and clears it when a retry works', async () => {
    fetchMock().mockRejectedValueOnce(new ApiError('Request failed (500)', 500)).mockResolvedValueOnce(page(['a']))
    const { result } = renderHook(() => useRecommendationList(true))
    await waitFor(() => expect(result.current.error).toBe('Request failed (500)'))

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.error).toBeNull()
  })

  it('says something plain when the failure is not an Error', async () => {
    fetchMock().mockRejectedValue('boom')
    const { result } = renderHook(() => useRecommendationList(true))

    await waitFor(() => expect(result.current.error).toBe('Something went wrong'))
  })

  it('appends the next page, and keeps what it has when that read fails', async () => {
    fetchMock().mockResolvedValueOnce(page(['a'], 'c1', 2)).mockRejectedValueOnce(new ApiError('Request failed (503)', 503)).mockResolvedValueOnce(page(['b'], null, 2))
    const { result } = renderHook(() => useRecommendationList(true))
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
    const { result } = renderHook(() => useRecommendationList(true))
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(() => result.current.more())

    expect(fetchMock()).toHaveBeenCalledOnce()
  })

  it('drops a decided row and the count without another read', async () => {
    fetchMock().mockResolvedValue(page(['a', 'b'], null, 2))
    const { result } = renderHook(() => useRecommendationList(true))
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
    const { result } = renderHook(() => useRecommendationList(true))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    await act(() => result.current.more())

    act(() => api.announceRecommendationsChanged())

    await waitFor(() => expect(result.current.items?.map((r) => r.id)).toEqual(['b', 'c']))
    expect(fetchMock()).toHaveBeenLastCalledWith('c2')
  })
})
