export function dayGroupRowsId(date: string): string {
  return `txn-day-${date}`
}

/**
 * What finds a day's header in the page, whichever form it takes: it sticks under the Transactions
 * bar, so the page's scroll padding has to count it. The attribute is spelled out where the header
 * is rendered (DayGroupHeader.tsx).
 */
export const DAY_HEADER_SELECTOR = '[data-day-header]'
