import { describe, expect, it } from 'vitest'
import { mapAppError } from './mapAppError'
import { HttpError } from './http'

describe('mapAppError', () => {
  it('rethrows an HttpError unchanged', () => {
    expect(() => mapAppError(new HttpError(409, 'Conflict'))).toThrow(
      expect.objectContaining({ status: 409, message: 'Conflict' }),
    )
  })

  it('preserves the status of any other HTTP-shaped error (e.g. the in-memory repo test double)', () => {
    class RepoHttpErrorLike extends Error {
      readonly status: number
      constructor(status: number, message: string) {
        super(message)
        this.status = status
      }
    }

    expect(() => mapAppError(new RepoHttpErrorLike(404, 'Category not found'))).toThrow(
      expect.objectContaining({ status: 404, message: 'Category not found' }),
    )
  })

  it('maps a plain Error to 400', () => {
    expect(() => mapAppError(new Error('boom'))).toThrow(
      expect.objectContaining({ status: 400, message: 'boom' }),
    )
  })

  it('maps a non-Error throw to a generic 400', () => {
    expect(() => mapAppError('nope')).toThrow(expect.objectContaining({ status: 400 }))
  })
})
