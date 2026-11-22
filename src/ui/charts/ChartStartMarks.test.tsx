import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChartStartMarks, type StartMark } from './ChartStartMarks'

const geo = { xForIndex: (i: number) => 50 + i * 20, scaleY: (v: number) => 200 - v, padTop: 10 }

function draw(
  marks: StartMark[],
  over: Partial<Parameters<typeof ChartStartMarks>[0]> = {},
) {
  return render(
    <svg>
      <ChartStartMarks marks={marks} geo={geo} left={50} right={650} active={null} annotations={undefined} {...over} />
    </svg>,
  )
}

describe('the marks where later lines start', () => {
  it('draws a hollow dot in the line’s colour and says when beside it', () => {
    const { container } = draw([{ index: 2, value: 40, color: 'rgb(1, 2, 3)', label: 'starts Jul 2027' }])
    expect(container.querySelector('circle')?.getAttribute('style')).toContain('rgb(1, 2, 3)')
    expect(screen.getByText('starts Jul 2027').getAttribute('text-anchor')).toBe('start')
  })

  it('puts the label on the left where the right has no room', () => {
    draw([{ index: 29, value: 40, color: '#000', label: 'starts Jul 2055' }])
    expect(screen.getByText('starts Jul 2055').getAttribute('text-anchor')).toBe('end')
  })

  it('leaves a label off rather than over another line’s dot or label', () => {
    draw([
      { index: 2, value: 40, color: '#000', label: 'starts Jan 2028' },
      { index: 3, value: 52, color: '#111', label: 'starts Jan 2029' },
      { index: 20, value: 40, color: '#222', label: 'starts Jan 2046' },
    ])
    expect(screen.queryByText('starts Jan 2028')).not.toBeInTheDocument()
    expect(screen.getByText('starts Jan 2029')).toBeInTheDocument()
    expect(screen.getByText('starts Jan 2046')).toBeInTheDocument()
  })

  it('keeps the dots and drops the labels while a year is pointed at or a milestone is picked', () => {
    const marks = [{ index: 2, value: 40, color: '#000', label: 'starts Jul 2027' }]
    const pointed = draw(marks, { active: 4 })
    expect(screen.queryByText('starts Jul 2027')).not.toBeInTheDocument()
    expect(pointed.container.querySelector('circle')).not.toBeNull()
    pointed.unmount()
    draw(marks, { annotations: { dots: [] } })
    expect(screen.queryByText('starts Jul 2027')).not.toBeInTheDocument()
  })

  it('draws nothing without marks', () => {
    const { container } = draw([])
    expect(container.querySelector('g')).toBeNull()
  })
})
