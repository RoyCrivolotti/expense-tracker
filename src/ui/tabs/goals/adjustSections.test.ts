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
    expect(pickActiveSection([-400, -50, 90, 300, 500], line, -1)).toBe(2)
    expect(pickActiveSection([-400, -50, 101, 300, 500], line, -1)).toBe(1)
  })

  it('is the first section before any has reached the line', () => {
    expect(pickActiveSection([150, 400, 700, 900, 1000], line, -1)).toBe(0)
  })

  it('is the section the end of the page belongs to, whatever the tops say', () => {
    expect(pickActiveSection([-900, -600, -300, 200, 260], line, 4)).toBe(4)
    expect(pickActiveSection([-900, -600, 200, 300, 400], line, 2)).toBe(2)
  })

  it('is a section that has reached the line even when it comes after the one the page ends in', () => {
    expect(pickActiveSection([-900, -600, -300, -80, 300], line, 2)).toBe(3)
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
