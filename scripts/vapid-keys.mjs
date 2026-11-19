#!/usr/bin/env node
/**
 * Prints a fresh VAPID key pair (RFC 8292) for web push. It sets nothing anywhere: the values are for whoever deploys
 * to paste into Cloudflare themselves, as docs/PUSH.md, "Setting it up", describes. The private line is a secret;
 * keep it out of the repo, shell history and chat.
 */
import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const point = Buffer.from(await subtle.exportKey('raw', pair.publicKey))
const jwk = await subtle.exportKey('jwk', pair.privateKey)

console.log(`VAPID_PUBLIC_KEY=${point.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`)
console.log('')
console.log('The public line goes on the capture Worker (a secret) and on each Pages project (a plain variable).')
console.log('The private line goes on the capture Worker only, as a secret. VAPID_SUBJECT is the app URL, https://<app origin>.')
