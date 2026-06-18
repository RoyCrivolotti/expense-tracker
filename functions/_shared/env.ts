export interface Env {
  /** D1 binding configured on the expense-tracker Pages project. */
  DB: D1Database
  /** Optional allow-list (comma-separated emails); defence in depth behind Access. */
  ALLOWED_EMAILS?: string
}

/**
 * Per-request data the auth middleware attaches to `context.data`. `owner` is
 * the authenticated, lowercased email; every read and write is scoped to it so
 * each user only ever sees their own tracker (row-level multi-tenancy).
 */
export interface ExpensesData {
  owner: string
  [key: string]: unknown
}
