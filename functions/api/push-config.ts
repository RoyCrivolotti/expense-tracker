import type { Env, ExpensesData } from '../_shared/env'
import { vapidPublicKeyOf } from '../domain/application/pushService'
import { json } from '../_shared/http'

/**
 * The key the app subscribes with (`applicationServerKey`): the deployment's VAPID public key, a plain variable, or
 * null when it is unset or does not look like one, in which case the Settings card says notifications are not set up.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = (context) =>
  Promise.resolve(json({ publicKey: vapidPublicKeyOf(context.env.VAPID_PUBLIC_KEY) }))
