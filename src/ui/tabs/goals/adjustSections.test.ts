import { describe, expect, it } from 'vitest'
import { ADJUST_SECTIONS, adjustSectionId, pickActiveSection } from './adjustSections'

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

  it('is the last section at the bottom of the page, whatever the tops say', () => {
    expect(pickActiveSection([-900, -600, -300, 200, 260], line, true)).toBe(4)
  })
})
