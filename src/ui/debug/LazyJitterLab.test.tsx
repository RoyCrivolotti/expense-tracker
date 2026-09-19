import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LazyJitterLab } from './LazyJitterLab'

describe('LazyJitterLab', () => {
  it('lazy-loads the panel and shows its button', async () => {
    render(<LazyJitterLab />)

    expect(await screen.findByRole('button', { name: 'jx' })).toBeTruthy()
  })
})
