import { RETIREMENT_RATE_BANDS, type MoneyFormat } from '../../../engine'

/** A rate as a person writes it: 4%, 3,5%, 3,25%, with only the places it needs. */
export function plainPercent(rate: number, format: MoneyFormat): string {
  return `${(rate * 100).toLocaleString(format.locale, { maximumFractionDigits: 2 })}%`
}

/** The guide in words, from the bands the engine uses: "4% up to 35 years, 3,5% up to 49 and 3,25% from 50". */
export function guideText(format: MoneyFormat): string {
  const [short, middle, long] = RETIREMENT_RATE_BANDS
  return `${plainPercent(short.rate, format)} up to ${short.upTo} years, ${plainPercent(middle.rate, format)} up to ${middle.upTo} and ${plainPercent(long.rate, format)} from ${middle.upTo + 1}`
}

/**
 * What lies behind the sentence under the years: the guide the rate follows, how the FI chart tests it, and what moving the
 * years does to the rate. For the note that closes the FI section, not for the first read.
 */
export function retirementYearsNotes(format: MoneyFormat): string[] {
  return [
    `The longer the money has to last, the lower the withdrawal rate has to be: the usual guide is ${guideText(format)}.`,
    'The FI chart shows how often the money lasts in simulated markets.',
    'Changing the years moves the rate to the guide unless you have set the rate yourself.',
  ]
}
