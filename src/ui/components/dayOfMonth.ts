/** The highest day a budget month can start on, so every month has it (February included). */
export const MAX_ROLLOVER_DAY = 28

/** 1 -> "1st", 12 -> "12th", 23 -> "23rd". */
export function ordinalDay(day: number): string {
  const lastTwo = day % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}
