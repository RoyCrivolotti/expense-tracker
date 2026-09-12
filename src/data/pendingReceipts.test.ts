import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removeStaged, revokeStaged, stageReceipts } from './pendingReceipts'

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

let revoked: string[]

beforeEach(() => {
  revoked = []
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++n}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    revoked.push(url)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stageReceipts', () => {
  it('mints one url per file, preserving order', () => {
    const staged = stageReceipts([file('a.jpg'), file('b.jpg')])

    expect(staged.map((s) => s.url)).toEqual(['blob:1', 'blob:2'])
    expect(staged.map((s) => s.file.name)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('degrades to a blank preview where createObjectURL is absent', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(undefined as unknown as string)
    // @ts-expect-error deliberately removing the API to model an environment without it
    URL.createObjectURL = undefined

    expect(stageReceipts([file('a.jpg')])[0]?.url).toBe('')
  })
})

describe('removeStaged', () => {
  it('drops the chosen index and revokes only its blob', () => {
    const staged = stageReceipts([file('a.jpg'), file('b.jpg'), file('c.jpg')])

    const left = removeStaged(staged, 1)

    expect(left.map((s) => s.url)).toEqual(['blob:1', 'blob:3'])
    expect(revoked).toEqual(['blob:2'])
  })

  it('keeps two same-named files apart', () => {
    // Two photos taken a second apart are both image.jpg; anything keyed on the
    // name would drop the wrong one.
    const staged = stageReceipts([file('image.jpg'), file('image.jpg')])

    const left = removeStaged(staged, 0)

    expect(left).toHaveLength(1)
    expect(left[0]?.url).toBe('blob:2')
    expect(revoked).toEqual(['blob:1'])
  })

  it('is a no-op for an index that is not staged', () => {
    const staged = stageReceipts([file('a.jpg')])

    expect(removeStaged(staged, 5)).toBe(staged)
    expect(revoked).toEqual([])
  })
})

describe('revokeStaged', () => {
  it('releases every blob it is given', () => {
    revokeStaged(stageReceipts([file('a.jpg'), file('b.jpg')]))

    expect(revoked).toEqual(['blob:1', 'blob:2'])
  })

  it('skips entries that never got a url', () => {
    revokeStaged([{ file: file('a.jpg'), url: '' }])

    expect(revoked).toEqual([])
  })
})
