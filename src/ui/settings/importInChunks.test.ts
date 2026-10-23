import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import { IMPORT_CHUNK, ImportStopped, importInChunks } from './importInChunks'

const rows = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)

describe('importInChunks', () => {
  it('sends nothing for no rows, and the rows in order in requests of at most a hundred', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await importInChunks([], send)
    expect(send).not.toHaveBeenCalled()
    await importInChunks(rows(250), send)
    expect(send.mock.calls.map(([chunk]) => (chunk as number[]).length)).toEqual([100, 100, 50])
    expect(send.mock.calls.flatMap(([chunk]) => chunk as number[])).toEqual(rows(250))
    expect(IMPORT_CHUNK).toBe(100)
  })

  it('is one request for a hundred rows or fewer, as an import always was', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await importInChunks(rows(100), send)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('waits for each request before the next, and says how many rows are saved after each', async () => {
    const order: string[] = []
    const send = vi.fn(async (chunk: number[]) => {
      order.push(`start ${chunk[0]}`)
      await Promise.resolve()
      order.push(`end ${chunk[0]}`)
    })
    const progress: number[] = []
    await importInChunks(rows(250), send, { onProgress: (n) => progress.push(n) })
    expect(order).toEqual(['start 1', 'end 1', 'start 101', 'end 101', 'start 201', 'end 201'])
    expect(progress).toEqual([100, 200, 250])
  })

  it('lets the first request fail as the error it was, since nothing was saved before it', async () => {
    const failure = new ApiError('Row 7: Unknown category', 400)
    const send = vi.fn().mockRejectedValue(failure)
    await expect(importInChunks(rows(250), send)).rejects.toBe(failure)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stops a later request with how many rows are saved, and sends nothing after it', async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError('Something went wrong on our side', 500))
    const stopped = await importInChunks(rows(250), send).catch((error: unknown) => error)
    expect(stopped).toBeInstanceOf(ImportStopped)
    expect((stopped as ImportStopped).imported).toBe(100)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('says that a request the server answered with an error may have been saved, and that confirming again could duplicate it', async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError('Something went wrong on our side', 500))
    const stopped = (await importInChunks(rows(250), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped.maybeSaved).toBe(true)
    expect(stopped.message).toContain('Imported 100 of 250 transactions.')
    expect(stopped.message).toContain('may or may not have been saved')
    expect(stopped.message).toContain('Something went wrong on our side')
    expect(stopped.message).toContain('150 left')
    expect(stopped.message).toContain('Look in Transactions')
  })

  it('says the same of a request that never got an answer', async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const stopped = (await importInChunks(rows(150), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped.maybeSaved).toBe(true)
    expect(stopped.message).toContain('Failed to fetch')
    expect(stopped.message).toContain('50 left')
  })

  it('says that a refused request saved nothing, and names its row by its place in the whole import', async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ApiError('Row 30: Unknown category', 400))
    const stopped = (await importInChunks(rows(250), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped.maybeSaved).toBe(false)
    expect(stopped.message).toContain('were refused and not saved: Row 130: Unknown category')
    expect(stopped.message).toContain('The 150 left are still here')
    expect(stopped.message).not.toContain('twice')
  })

  it('renames every row a message names, and no number that is not one', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError('Row 1: bad, and Row 2: worse, 12 in all', 400))
    const stopped = (await importInChunks(rows(250), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped.message).toContain('Row 201: bad, and Row 202: worse, 12 in all')
  })

  it('keeps the error that stopped it as the cause', async () => {
    const failure = new ApiError('nope', 503)
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure)
    const stopped = (await importInChunks(rows(150), send).catch((error: unknown) => error)) as ImportStopped
    expect(stopped.cause).toBe(failure)
  })
})
