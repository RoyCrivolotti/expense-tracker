import type { Env, ExpensesData } from '../../../_shared/env'
import { suggestDescriptions } from '../../../domain/application/descriptionSuggestService'
import { parseDescriptionSuggest } from '../../../_shared/descriptionSuggestParams'
import { json } from '../../../_shared/http'
import { mapAppError } from '../../../_shared/mapAppError'

/**
 * Descriptions that start with `q` among the owner's rows booked in months before `before`, newest row of
 * each, in the browser's order (docs/SCALING.md, "Description autocomplete"). Not cached, and not allowed
 * to be: a request is one prefix, the answer follows every write, and a shared cache would keep it.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const response = json(await suggestDescriptions(repo, owner, parseDescriptionSuggest(new URL(context.request.url))))
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    mapAppError(error)
  }
}
