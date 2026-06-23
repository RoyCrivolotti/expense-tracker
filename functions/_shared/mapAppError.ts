import { HttpError } from './http'

/** Map application-layer validation errors to HTTP 400 responses. */
export function mapAppError(error: unknown): never {
  if (error instanceof HttpError) throw error
  if (error instanceof Error) throw new HttpError(400, error.message)
  throw new HttpError(400, 'Bad request')
}
