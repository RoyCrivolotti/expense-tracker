import type { ListView } from '../transactionListView'

/**
 * What a screen reader is told about the list: how many transactions match, or nothing while that is not known (the
 * first rows are on their way) or the list could not be read, since a number would then be wrong or made up.
 */
export function matchAnnouncement({ count, capped, failed }: Pick<ListView, 'count' | 'capped' | 'failed'>): string {
  if (count === null || failed) return ''
  return `${count}${capped ? '+' : ''} transactions match`
}
