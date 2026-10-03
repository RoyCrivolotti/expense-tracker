/** A scenario's name as far as its colon: "Path A: Invest only" is "Path A". */
export function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

/**
 * The name a table row gives a scenario: the short form, unless another scenario would be given
 * the same one, which would leave two rows saying "Path A" and only a swatch to tell them apart
 * (a copy of "Path A: Invest only" is "Path A: Invest only (copy)"). Then the full name.
 */
export function tableName(name: string, allNames: readonly string[]): string {
  const short = shortName(name)
  return allNames.some((other) => other !== name && shortName(other) === short) ? name : short
}
