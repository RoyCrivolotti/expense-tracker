import type { CaptureRepository } from '../ports/captureRepository'
import type { IgnoredTemplate } from '../ports/captureTemplates'
import { ValidationError } from './validationError'

/** Template ids are UUIDs the Worker made. Anything else cannot be one. */
export const TEMPLATE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The person's ignored templates. Only that list exists for now, so the query must ask for it: a list of every
 * template is a different answer, and asking for it should not quietly get this one.
 */
export async function listCaptureTemplates(
  captures: CaptureRepository,
  owner: string,
  ignored: string | null,
): Promise<{ templates: IgnoredTemplate[] }> {
  if (ignored !== '1') throw new ValidationError('Only ignored=1 is supported')
  return { templates: await captures.listIgnoredTemplates(owner) }
}

/** False when the id is not one of the person's templates, including an id that cannot be one. */
export async function unignoreCaptureTemplate(
  captures: CaptureRepository,
  owner: string,
  id: string,
): Promise<boolean> {
  return TEMPLATE_ID_PATTERN.test(id) && captures.unignoreTemplate(owner, id)
}
