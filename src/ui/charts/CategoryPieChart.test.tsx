import { fireEvent, render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { CategoryPieChart } from './CategoryPieChart'
import { LinearChart, type ChartSeries } from './LinearChart'
import styles from './charts.module.css'

beforeAll(() => {
  // The docked tooltip reads a media query; jsdom has no matchMedia.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function model() {
  return buildExpenseModel(
    makeDataset({
      categories: [
        { id: 1, name: 'Food', monthlyBudgetCents: 30_000, sortOrder: 0, active: true },
        { id: 2, name: 'Rent', monthlyBudgetCents: 100_000, sortOrder: 1, active: true },
      ],
      transactions: [
        makeTransaction({ id: 1, budgetMonth: '2026-05', date: '2026-05-03', type: 'expense', categoryId: 1, amountCents: 5_000 }),
        makeTransaction({ id: 2, budgetMonth: '2026-05', date: '2026-05-05', type: 'expense', categoryId: 2, amountCents: 10_000 }),
      ],
    }),
  )
}

function makeLine(id: string, values: number[]): ChartSeries {
  return { id, color: '#6366f1', values }
}

describe('CategoryPieChart alongside another chart', () => {
  it("closes a LinearChart's open tooltip when its own pie slice is tapped", () => {
    const { container } = render(
      <>
        <LinearChart
          height={200}
          series={[makeLine('s1', [10, 20, 30])]}
          xLabels={['2024', '2025', '2026']}
          formatValue={(v) => String(v)}
          ariaLabel="Test chart"
          tooltip={() => ({ title: 'Line chart', lines: [] })}
        />
        <CategoryPieChart model={model()} month="2026-05" />
      </>,
    )

    const svg = container.querySelector('svg[aria-label="Test chart"]')!
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(document.body.querySelectorAll('[role="tooltip"]')).toHaveLength(1)

    const slice = container.querySelector(`.${styles.pieSlice}`)!
    fireEvent.pointerDown(slice)
    expect(document.body.querySelectorAll('[role="tooltip"]')).toHaveLength(1)
    // Slices sort by amount descending, so the first path is the largest category (Rent).
    expect(document.body.querySelector('[role="tooltip"]')).toHaveTextContent('Rent')
  })
})
