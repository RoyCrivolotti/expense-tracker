/**
 * What the plan's money is called: the euros of the year the plan starts. A figure in it is worth
 * what that many euros bought then, which is what the plan counts in until it is re-baselined. A
 * plan with no start date has no year to name, so it is today's.
 */
export function planMoneyLabel(planStartDate: string | null | undefined): string {
  const year = planStartDate?.slice(0, 4)
  return year && /^\d{4}$/.test(year) ? `${year} euros` : "today's euros"
}
