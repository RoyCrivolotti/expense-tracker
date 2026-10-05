/**
 * How the Overview's numbers are made, in the app's own words, so a card never asks to be
 * believed. One place, so the same rule reads the same on every card that leans on it.
 */
export const FIXED_RULE =
  'Fixed costs are charges that settle an instalment plan, or that repeat on a regular rhythm: the same description, account and category at least 3 times, monthly, quarterly or yearly. Weekly habits such as groceries are never fixed. A new subscription becomes fixed on its third charge.'

export const PACE_NOTES: string[] = [
  FIXED_RULE,
  'Flexible spending is every other expense, net of refunds, in categories that have a budget.',
  'The budget shown is the sum of your category budgets minus the fixed charges expected this month (instalments due and monthly patterns seen recently).',
  'Should be today spreads that budget evenly over the days of the month so far. Month ends near is what you have spent so far, scaled up to the whole month.',
]

export const ALLOCATION_NOTES: string[] = [
  'Fixed and flexible are the same split as on the pace card. Invested is what you put into investments.',
  'Left over is income minus fixed, flexible and invested. Charges count in the month they are budgeted to, unpaid card charges included on the Committed basis.',
]

export const BASELINE_NOTES: string[] = [
  'Total, mean and median are your spending in the months before this one (up to 12), with refunds netted and investing left out.',
  'After instalments end takes off the instalment plans that finish within a year. Use in Goals sets the plan’s annual spend to the mean times 12, as an unsaved edit.',
]
