/** HTTP-shaped error for in-memory repository adapters (tests map to HttpError responses). */
export class RepoHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
