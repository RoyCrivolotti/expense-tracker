import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChangeChip } from './ChangeChip'

describe('ChangeChip', () => {
  it('says there is no comparison when the baseline is missing', () => {
    render(<ChangeChip value={1000} baseline={null} upGood />)
    expect(screen.getByText('no comparison')).toBeTruthy()
  })

  it('reads flat inside the noise band', () => {
    render(<ChangeChip value={10050} baseline={10000} upGood />)
    expect(screen.getByText('flat')).toBeTruthy()
  })

  it('shows the percentage move with its direction', () => {
    render(<ChangeChip value={12000} baseline={10000} upGood={false} />)
    expect(screen.getByText('▲ 20%')).toBeTruthy()
  })

  it('reads new when something appears against a zero baseline', () => {
    render(<ChangeChip value={5000} baseline={0} upGood />)
    expect(screen.getByText('new')).toBeTruthy()
  })

  it('reports rate changes in points', () => {
    render(<ChangeChip value={0.25} baseline={0.2} upGood kind="rate" />)
    expect(screen.getByText('▲ 5 pts')).toBeTruthy()
  })
})
