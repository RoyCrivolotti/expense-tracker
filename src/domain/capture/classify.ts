import { foldTitle } from './text'
import type { KindRule, RawPush } from './types'

/**
 * The kind list. A push only creates anything if a row matches its Title and Body together;
 * everything else is dropped and counted. The Iberia purchase push is the only wording the plan has
 * confirmed. More rows join when blanked samples of their kinds arrive, so the Icon's instalment
 * offer, which repeats a purchase with no card, is dropped for lack of a row rather than special-cased.
 */
export const KIND_RULES: readonly KindRule[] = [
  { source: 'iberia', title: 'Compra realizada', kind: 'card-purchase', mark: 'comma', keepsText: true },
]

/** The rule a push matches, or null when its kind is not on the list. */
export function matchRule(push: Pick<RawPush, 'source' | 'title' | 'body'>, rules: readonly KindRule[] = KIND_RULES): KindRule | null {
  const title = foldTitle(push.title)
  return (
    rules.find(
      (rule) =>
        rule.source === push.source &&
        foldTitle(rule.title) === title &&
        (rule.body === undefined || rule.body.test(push.body)),
    ) ?? null
  )
}
