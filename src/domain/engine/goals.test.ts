import { describe, expect, it } from 'vitest'
import { averageMonthlySaving } from './goals'

describe('averageMonthlySaving', () => {
  it('returns zero for an empty month list', () => {
    expect(averageMonthlySaving([])).toBe(0)
  })

  it('rounds the mean net saving across months', () => {
    expect(averageMonthlySaving([100000, 200000, 300000])).toBe(200000)
    expect(averageMonthlySaving([100001, 100002])).toBe(100002)
  })
})
