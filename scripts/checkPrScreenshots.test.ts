import { describe, expect, it } from 'vitest'
import { evidenceImages } from './prScreenshotEvidence.mjs'

const RAW = 'https://raw.githubusercontent.com/owner/repo'
const image = (url: string) => `![shot](${url})`

describe('evidenceImages', () => {
  it('accepts a capture committed under docs/pr-screenshots', () => {
    const url = `${RAW}/abc123/docs/pr-screenshots/slug/after.png`
    expect(evidenceImages(image(url))).toEqual([url])
  })

  it('accepts one pinned to a branch whose name contains a slash', () => {
    const url = `${RAW}/fix/some-branch/docs/pr-screenshots/slug/after.png`
    expect(evidenceImages(image(url))).toEqual([url])
  })

  it('refuses the product gallery, which is not a picture of any one change', () => {
    // How #105 got through: an existing gallery image, captioned "before".
    const body = `Condensed the rows.\n\n${image(`${RAW}/b/docs/screenshots/gallery/x.png`)}`
    expect(evidenceImages(body)).toEqual([])
  })

  it('still accepts a pasted attachment or an externally hosted image', () => {
    const body = [
      image('https://github.com/user-attachments/assets/abc'),
      image('https://example.com/shot.png'),
    ].join('\n')
    expect(evidenceImages(body)).toHaveLength(2)
  })

  it('keeps the real capture when a gallery image sits beside it', () => {
    const real = `${RAW}/b/docs/pr-screenshots/s/after.png`
    const body = `${image(`${RAW}/b/docs/screenshots/gallery/x.png`)}\n${image(real)}`
    expect(evidenceImages(body)).toEqual([real])
  })

  it('finds nothing in a body with no images', () => {
    expect(evidenceImages('Just prose, no pictures.')).toEqual([])
  })
})
