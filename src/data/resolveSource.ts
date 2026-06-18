import type { ExpenseDataSource } from './dataSource'
import { apiDataSource } from './apiDataSource'

/**
 * Resolve the active data source. Production always uses the D1-backed API;
 * dev mode dynamically imports the CSV source (so the ?raw import is never
 * resolved in production builds and the CSV is fully tree-shaken).
 */
export async function resolveSource(): Promise<ExpenseDataSource> {
  if (import.meta.env.DEV) {
    const { csvDataSource } = await import('./csvDataSource')
    return csvDataSource
  }
  return apiDataSource
}
