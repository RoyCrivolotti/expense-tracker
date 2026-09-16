import { ValidationError } from '../domain/application/validationError'
import { HttpError } from './http'

/**
 * Matches any HTTP-shaped error carrying a numeric `status` (e.g. this repo's
 * test-only `RepoHttpError`, used by the in-memory repository) without this
 * production module importing test code to check `instanceof`.
 */
function hasHttpStatus(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  )
}

/**
 * The HTTP response an error from the application layer should become.
 *
 * Only a `ValidationError` is the client's fault. Anything else that reaches here is
 * the server's, so it is a 500 with a fixed message: a raw D1 or R2 error describes
 * our internals, not the request, and the client can do nothing with it. The real
 * cause goes to the log instead.
 */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (hasHttpStatus(error)) return new HttpError(error.status, error.message)
  if (error instanceof ValidationError) return new HttpError(400, error.message)
  console.error('unexpected error', error)
  return new HttpError(500, 'Something went wrong on our side')
}

/** `toHttpError`, thrown, for route handlers that rethrow from a catch. */
export function mapAppError(error: unknown): never {
  throw toHttpError(error)
}
