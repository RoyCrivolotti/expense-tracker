import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapAppError, toHttpError } from './mapAppError'
import { HttpError, readJson } from './http'
import { ValidationError } from '../domain/application/validationError'

describe('toHttpError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes an HttpError through unchanged', () => {
    const original = new HttpError(409, 'Conflict')
    expect(toHttpError(original)).toBe(original)
  })

  it('preserves the status of any other HTTP-shaped error (e.g. the in-memory repo test double)', () => {
    class RepoHttpErrorLike extends Error {
      readonly status: number
      constructor(status: number, message: string) {
        super(message)
        this.status = status
      }
    }

    expect(toHttpError(new RepoHttpErrorLike(404, 'Category not found'))).toMatchObject({
      status: 404,
      message: 'Category not found',
    })
  })

  it('answers a validation failure with 400 and its own message', () => {
    expect(toHttpError(new ValidationError('date must be YYYY-MM-DD'))).toMatchObject({
      status: 400,
      message: 'date must be YYYY-MM-DD',
    })
  })

  it('answers anything else with a 500 that does not repeat the cause', () => {
    // A driver error describes our internals, not the request. It used to go back as
    // a 400, text and all, as though the client had sent something wrong.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mapped = toHttpError(new Error('D1_ERROR: no such column: owner_email'))

    expect(mapped.status).toBe(500)
    expect(mapped.message).not.toContain('D1_ERROR')
    expect(mapped.message).not.toContain('owner_email')
  })

  it('keeps the real cause in the log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('R2 bucket unreachable')

    toHttpError(cause)

    expect(log).toHaveBeenCalledWith('unexpected error', cause)
  })

  it('still answers a malformed body with 400', async () => {
    // A JSON parse failure is a SyntaxError, which is not a ValidationError, so it would
    // be a 500 if it reached here raw. readJson turns it into a 400 first.
    const bad = new Request('https://expenses.test/api', { method: 'POST', body: '{not json' })
    const thrown = await readJson(bad).catch((e: unknown) => e)

    expect(toHttpError(thrown)).toMatchObject({ status: 400, message: 'Invalid JSON body' })
  })

  it('treats a non-Error throw as the server’s problem too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(toHttpError('nope').status).toBe(500)
  })
})

describe('mapAppError', () => {
  it('throws what toHttpError returns', () => {
    expect(() => mapAppError(new ValidationError('Invalid categoryId'))).toThrow(
      expect.objectContaining({ status: 400, message: 'Invalid categoryId' }),
    )
  })
})
