/**
 * The plan service validates in the language of its own payload, which is the right
 * language for an API consumer and the wrong one for the person looking at this form:
 * the field it names is not the label they just edited. Anything unrecognised is
 * passed through rather than flattened, since a real server message says more than a
 * generic apology.
 */
const PLAN_ERROR_COPY: Record<string, string> = {
  'totalCount must be a positive integer': 'Total installments must be a whole number, at least 1.',
  'amountCents must be greater than zero': 'Installment amount must be greater than zero.',
  'dueDayOfMonth must be between 1 and 31': 'Due day of month must be between 1 and 31.',
  'startInstallmentIndex must be between 1 and totalCount':
    'First tracked installment must be between 1 and the total number of installments.',
  'anchorBudgetMonth must be YYYY-MM': 'Anchor budget month must be a real month.',
  'Description is required': 'Give the plan a description.',
}

export function planErrorCopy(e: unknown): string {
  if (!(e instanceof Error)) return 'Could not save'
  return PLAN_ERROR_COPY[e.message] ?? e.message
}
