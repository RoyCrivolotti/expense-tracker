import { describe, expect, it } from 'vitest'
import type { HeldLedger } from './ledgerHold'
import { RevisionTrail } from './ledgerRevisionTrail'

const held = (revision: string | null): HeldLedger => ({ revision }) as HeldLedger

describe('RevisionTrail', () => {
  it('knows the revision the held ledger carries when no write was shown', () => {
    expect(new RevisionTrail().known(held('r0'))).toBe('r0')
    expect(new RevisionTrail().known(held(null))).toBeNull()
    expect(new RevisionTrail().known(null)).toBeNull()
  })

  it('takes a write that starts where the ledger is, and knows the token it left', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })

    const at = trail.take(held('r0'))
    trail.vouch(at, null)

    expect(at).toBe('r2')
    expect(trail.known(held(null))).toBe('r2')
  })

  it('follows writes one after another, each from where the last left it', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.vouch(trail.take(held('r0')), null)
    trail.note({ before: 'r2', after: 'r4' })

    expect(trail.take(held(null))).toBe('r4')
  })

  it('takes several writes at once when they follow on from each other', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.note({ before: 'r2', after: 'r4' })

    expect(trail.take(held('r0'))).toBe('r4')
  })

  it.each([
    ['starts elsewhere', [{ before: 'rX', after: 'r2' }]],
    ['has no new token', [{ before: 'r0', after: null }]],
    ['has no first token', [{ before: null, after: 'r2' }]],
    [
      'leaves a gap',
      [
        { before: 'r0', after: 'r2' },
        { before: 'r3', after: 'r4' },
      ],
    ],
    ['has none at all', []],
  ])('does not vouch for a patch whose receipts %s', (_name, receipts) => {
    const trail = new RevisionTrail()
    for (const receipt of receipts) trail.note(receipt)

    expect(trail.take(held('r0'))).toBeNull()
  })

  it('does not vouch when the held ledger is at an unknown revision', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })

    expect(trail.take(held(null))).toBeNull()
  })

  it('does not vouch once more receipts than a patch could need have come', () => {
    const trail = new RevisionTrail()
    let at = 'r0'
    for (let i = 1; i <= 65; i++) {
      trail.note({ before: at, after: `r${i}` })
      at = `r${i}`
    }

    expect(trail.take(held('r0'))).toBeNull()
  })

  it('starts again after a patch: the receipts of one are not the next one’s', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'rX', after: 'r2' })
    trail.take(held('r0'))
    trail.note({ before: 'r0', after: 'r2' })

    expect(trail.take(held('r0'))).toBe('r2')
  })

  it('is given up by a read of everything', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.vouch(trail.take(held('r0')), null)

    trail.forget()

    expect(trail.known(held(null))).toBeNull()
  })

  it('is given up by a patch that is not vouched for', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.vouch(trail.take(held('r0')), null)

    trail.take(held(null))

    expect(trail.known(held(null))).toBeNull()
  })

  it('is ignored once the held ledger carries another revision than the one it was made for', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.vouch(trail.take(held('r0')), null)

    expect(trail.known(held('r7'))).toBe('r7')
  })

  it('goes with the revision a write that changed nothing left the held ledger carrying', () => {
    const trail = new RevisionTrail()
    trail.note({ before: 'r0', after: 'r2' })
    trail.vouch(trail.take(held('r0')), 'r0')

    expect(trail.known(held('r0'))).toBe('r2')
    expect(trail.known(held(null))).toBeNull()
  })

  describe('adoptable', () => {
    it('is the revision read when nothing here says otherwise', () => {
      expect(new RevisionTrail().adoptable(held(null), 'r5')).toBe('r5')
    })

    it('is the revision read when it is the one the writes here left the ledger at', () => {
      const trail = new RevisionTrail()
      trail.note({ before: 'r0', after: 'r2' })
      trail.vouch(trail.take(held('r0')), null)

      expect(trail.adoptable(held(null), 'r2')).toBe('r2')
    })

    it('is nothing when it is another, since someone else wrote after the writes here', () => {
      const trail = new RevisionTrail()
      trail.note({ before: 'r0', after: 'r2' })
      trail.vouch(trail.take(held('r0')), null)

      expect(trail.adoptable(held(null), 'r9')).toBeNull()
    })

    it.each([
      ['has no new token', { before: 'r0', after: null }],
      ['starts elsewhere', { before: 'rX', after: 'r2' }],
    ])('is nothing after a write whose receipt %s, since another write ran beside it', (_name, receipt) => {
      const trail = new RevisionTrail()
      trail.note(receipt)
      trail.take(held('r0'))

      expect(trail.adoptable(held(null), 'r9')).toBeNull()
    })

    it('is nothing from then on, until a read of everything starts', () => {
      const trail = new RevisionTrail()
      trail.note({ before: 'r0', after: null })
      trail.take(held('r0'))
      trail.note({ before: 'r5', after: 'r6' })
      trail.take(held(null))
      expect(trail.adoptable(held(null), 'r9')).toBeNull()

      trail.forget()

      expect(trail.adoptable(held(null), 'r9')).toBe('r9')
    })

    it('is still the revision read when the patches here had no receipts at all, as for a source that sends none', () => {
      const trail = new RevisionTrail()
      trail.take(held('r0'))

      expect(trail.adoptable(held(null), 'r9')).toBe('r9')
    })
  })
})
