/** Shared option lists for the currency + number-format pickers. */

/** Shown under the currency/number-format preview in both Settings and onboarding. */
export const CURRENCY_DISPLAY_ONLY_HINT =
  "Display only — changes the symbol and decimal separator for every transaction, past and " +
  "future. There's no currency conversion, so pick the one currency you actually track " +
  'everything in.'

/** ISO 4217 codes offered in the picker; symbol is derived at format time. */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CHF', label: 'Swiss Franc (CHF)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'SEK', label: 'Swedish Krona (kr)' },
  { code: 'NOK', label: 'Norwegian Krone (kr)' },
  { code: 'DKK', label: 'Danish Krone (kr)' },
  { code: 'PLN', label: 'Polish Złoty (zł)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
  { code: 'MXN', label: 'Mexican Peso ($)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
]

/** Number grouping/decimal styles, keyed by the locale that produces them. */
export const NUMBER_STYLES: { locale: string; label: string }[] = [
  { locale: 'de-DE', label: '1.234,56 (dot thousands, comma decimals)' },
  { locale: 'en-US', label: '1,234.56 (comma thousands, dot decimals)' },
  { locale: 'fr-FR', label: '1 234,56 (space thousands, comma decimals)' },
]
