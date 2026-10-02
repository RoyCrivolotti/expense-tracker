import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DayGroupHeader } from './DayGroupHeader'
import { DAY_HEADER_SELECTOR } from './dayGroupId'

function renderHeader(selectMode: boolean) {
  return render(
    <DayGroupHeader
      date="2026-06-12"
      ids={[1, 2]}
      selectMode={selectMode}
      selectedIds={new Set<number>()}
      collapsed={false}
      onToggleCollapse={vi.fn()}
    />,
  ).container
}

describe('DayGroupHeader', () => {
  it.each([
    ['a header', false],
    ['a header while rows are being picked', true],
  ])('is found by the selector the Transactions scroll padding measures, as %s', (_, selectMode) => {
    const container = renderHeader(selectMode)

    expect(container.querySelectorAll(DAY_HEADER_SELECTOR)).toHaveLength(1)
    expect(container.querySelector(DAY_HEADER_SELECTOR)).toBe(container.firstElementChild)
  })
})
