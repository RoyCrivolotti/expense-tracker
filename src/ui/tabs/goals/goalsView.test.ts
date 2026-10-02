import { describe, expect, it } from 'vitest'
import { mobileSelection, mobileViewOf } from './goalsView'

describe('mobileViewOf', () => {
  it('is the half of Plan that was last open while Plan is the view', () => {
    expect(mobileViewOf('plan', 'chart')).toBe('chart')
    expect(mobileViewOf('plan', 'adjust')).toBe('adjust')
  })

  it('is the view itself for Progress and Assumptions, whatever half Plan was left on', () => {
    expect(mobileViewOf('progress', 'adjust')).toBe('progress')
    expect(mobileViewOf('assumptions', 'chart')).toBe('assumptions')
  })
})

describe('mobileSelection', () => {
  it('moves between the halves of Plan without changing the view', () => {
    expect(mobileSelection('adjust', 'plan')).toEqual({ half: 'adjust', view: null })
    expect(mobileSelection('chart', 'plan')).toEqual({ half: 'chart', view: null })
  })

  it('opens Plan on the half chosen when it comes from another view', () => {
    expect(mobileSelection('adjust', 'progress')).toEqual({ half: 'adjust', view: 'plan' })
    expect(mobileSelection('chart', 'assumptions')).toEqual({ half: 'chart', view: 'plan' })
  })

  it('changes the view for Progress and Assumptions and leaves Plan\'s half alone', () => {
    expect(mobileSelection('progress', 'plan')).toEqual({ half: null, view: 'progress' })
    expect(mobileSelection('assumptions', 'progress')).toEqual({ half: null, view: 'assumptions' })
  })
})
