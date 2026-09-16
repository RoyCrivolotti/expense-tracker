const IMAGE_URL_RE = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/g
const REPO_RAW_PREFIX = 'https://raw.githubusercontent.com/'

/**
 * The images in a PR body that can stand as evidence of its change.
 *
 * A pasted attachment or an external image counts. An image from this repo counts only
 * from docs/pr-screenshots/, because nothing else stored here is a picture of one PR:
 * #105 passed by linking an existing gallery image as its "before".
 */
export function evidenceImages(body) {
  return [...body.matchAll(IMAGE_URL_RE)]
    .map((m) => m[1])
    .filter((url) => !url.startsWith(REPO_RAW_PREFIX) || url.includes('/docs/pr-screenshots/'))
}
