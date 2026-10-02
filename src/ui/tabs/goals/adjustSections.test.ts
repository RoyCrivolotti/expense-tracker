import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ADJUST_SECTIONS,
  adjustSectionId,
  openAdjustSections,
  pickActiveSection,
  showAdjustSections,
} from './adjustSections'

describe('adjustSectionId', () => {
  it('gives every section its own id', () => {
    const ids = ADJUST_SECTIONS.map((s) => adjustSectionId(s.key))

    expect(new Set(ids).size).toBe(ADJUST_SECTIONS.length)
  })
})

describe('pickActiveSection', () => {
  const line = 100

  it('is the last section whose top has reached the line', () => {
    expect(pickActiveSection([-400, -50, 90, 300, 500], line, false)).toBe(2)
    expect(pickActiveSection([-400, -50, 101, 300, 500], line, false)).toBe(1)
  })

  it('is the first section before any has reached the line', () => {
    expect(pickActiveSection([150, 400, 700, 900, 1000], line, false)).toBe(0)
  })

  it('is the last section when the page ends in it, whatever the tops say', () => {
    expect(pickActiveSection([-900, -600, -300, 200, 260], line, true)).toBe(4)
  })

  it('is still the last section to have reached the line when the page ends in a folded one', () => {
    expect(pickActiveSection([-900, -600, -300, 200, 260], line, false)).toBe(2)
  })
})

describe('the sections shown on the page', () => {
  beforeEach(() => {
    for (const s of ADJUST_SECTIONS) {
      const el = document.createElement('details')
      el.id = adjustSectionId(s.key)
      el.open = s.key === 'portfolio' || s.key === 'housing' || s.key === 'fire'
      document.body.append(el)
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists the ones whose controls are open, in the order they are shown', () => {
    expect(openAdjustSections()).toEqual(['portfolio', 'housing', 'fire'])
  })

  it('opens exactly the sections it is given and folds the others', () => {
    showAdjustSections(['housing', 'events'])

    expect(openAdjustSections()).toEqual(['housing', 'events'])
  })

  it('copes with a page that does not have the sections', () => {
    document.body.innerHTML = ''

    expect(openAdjustSections()).toEqual([])
    expect(() => showAdjustSections(['events'])).not.toThrow()
  })
})
