/** The year of the calendar a plan year falls in, or the plan year when there is no start date. */
export function yearLabel(years: number, planStartDate: string | null | undefined): string {
  return planStartDate ? String(Number(planStartDate.slice(0, 4)) + years) : `year ${years}`
}
