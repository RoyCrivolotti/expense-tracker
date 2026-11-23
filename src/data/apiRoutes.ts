/** What the area modules that `apiDataSource` is assembled from share. */
import type { ExpenseDataSource } from './dataSource'

export const BASE = '/api/expenses'

/**
 * One area of the live data source: exactly the methods named, and all of them present, though the source's own type
 * leaves them optional. A name outside the source, or one two areas both take, is the type checker's or the
 * areas test's to catch.
 */
export type Routes<K extends keyof ExpenseDataSource> = Required<Pick<ExpenseDataSource, K>>
