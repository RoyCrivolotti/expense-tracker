import type { Env, ExpensesData } from '../../_shared/env'
import { createD1CaptureRepository } from '../../_shared/adapters/d1CaptureRepository'
import { linkCaptureCard, listCaptureCards, unlinkCaptureCard } from '../../domain/application/captureCardService'
import { ValidationError } from '../../domain/application/validationError'
import { HttpError, json, readJson } from '../../_shared/http'
import { mapAppError } from '../../_shared/mapAppError'

/**
 * A failure the server did not expect keeps nothing of its message before it reaches the log: a database error can
 * quote the statement or a value, and a value here is four digits of a card.
 */
function plainly(error: unknown): unknown {
  return error instanceof HttpError || error instanceof ValidationError ? error : new Error('capture card request failed')
}

/** A link is a bank app, four digits and an account number. */
const MAX_BODY_BYTES = 1024

/** The signed-in person's links, and the cards payments are waiting on for want of one. */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  try {
    return json(await listCaptureCards(createD1CaptureRepository(context.env), context.data.owner))
  } catch (error) {
    mapAppError(plainly(error))
  }
}

/**
 * Links digits to one of the person's accounts, or points them at another. Saving the same link again changes nothing.
 * Open payments from those digits take the account at once. The account must be the person's, and the person may hold
 * only so many links. The digits are in the body and never in the address, an error or a log.
 */
export const onRequestPost: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  try {
    const result = await linkCaptureCard(createD1CaptureRepository(context.env), context.data.owner, body)
    if (result === 'no-account') throw new HttpError(404, 'Account not found')
    if (result === 'limit') throw new HttpError(409, 'You already have the most card links allowed. Remove one first.')
    return json({ ok: true })
  } catch (error) {
    mapAppError(plainly(error))
  }
}

/** Removes a link, which the body names. Open payments from those digits are no longer mapped. */
export const onRequestDelete: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const body = await readJson<unknown>(context.request, MAX_BODY_BYTES)
  try {
    if (!(await unlinkCaptureCard(createD1CaptureRepository(context.env), context.data.owner, body))) {
      throw new HttpError(404, 'Card link not found')
    }
    return json({ ok: true })
  } catch (error) {
    mapAppError(plainly(error))
  }
}
