import { memo } from 'react'
import { Card } from '../../../components/primitives'
import { LinearChart } from '../../../charts/LinearChart'
import styles from '../goals.module.css'
import { ChartHint } from './ChartHint'
import { ChartKeys } from './ChartKeys'
import { MilestonePicker } from './MilestonePicker'
import { ChartFooter, ChartHeader, HeroFootnote, PortfolioLegend } from './NetWorthChartParts'
import { chartKeyMarks, floatSideFor, projectionLabel, todayProp } from './netWorthChartProps'
import type { NetWorthChartProps } from './netWorthChartTypes'
import { useNetWorthChart, type NetWorthChartModel } from './useNetWorthChart'

/** The card's header, the line above the chart, and the chart. */
function ChartPlot({ m, headerAside }: { m: NetWorthChartModel; headerAside: NetWorthChartProps['headerAside'] }) {
  const { env, placed, drawn, marks, readings, heroVariantProps, sheet, hint } = m
  const { isHero, scenarios, todayIndex } = env
  const { chartSeries, fiChartMarker, startMarks, formatValue, valueTags } = marks
  const { lines: refLines, curves: refCurves, highlight: refHighlight, annotations } = marks.pick
  const { labels, years, yDomainMax } = drawn
  return (
    <>
      <ChartHeader
        isHero={isHero}
        money={sheet.money}
        aside={headerAside}
        windows={placed.heroWindows}
        value={placed.heroWindow}
        onChange={placed.setHeroWindow}
        onOpenSheet={sheet.onOpenSheet}
      />
      <ChartHint hint={hint} isHero={isHero} savedScenarios={scenarios.length} />
      <LinearChart
        {...heroVariantProps}
        aboveTop={fiChartMarker}
        series={chartSeries}
        xLabels={labels}
        refLines={refLines}
        refCurves={refCurves}
        refHighlight={refHighlight}
        annotations={annotations}
        startMarks={startMarks}
        places={years.length}
        {...todayProp(todayIndex, placed.windowYears)}
        yDomainMax={yDomainMax}
        formatValue={formatValue}
        valueTags={valueTags}
        ariaLabel={projectionLabel(fiChartMarker)}
        tooltip={readings.tooltip}
      />
    </>
  )
}

/** Under the chart: the legend, the key to its marks, the milestone picker and the note. */
function ChartUnder({ m }: { m: NetWorthChartModel }) {
  const { env, listRef, activeIndex, drawn, marks, readings, lifeEventMarkers } = m
  const { isHero, narrow, draft, nominalMode, onToggleVisible, legendStore, format } = env
  const { activeYear, legendWithFromToday, breakdowns, yearZeroHint, calendar } = readings
  const { pick } = marks
  return (
    <>
      <PortfolioLegend
        isHero={isHero}
        narrow={narrow}
        staticLegend={marks.staticLegend}
        legendItems={legendWithFromToday}
        chipsAbove={legendStore !== undefined}
        activeYear={activeYear}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
        breakdownInTodaysMoney={nominalMode}
        floatSide={floatSideFor(activeIndex, drawn.years.length)}
        onToggle={onToggleVisible}
        listRef={listRef}
        calendar={calendar}
      />
      <ChartKeys {...chartKeyMarks(isHero, drawn.displayExtraSeries.length, lifeEventMarkers)} />
      <MilestonePicker
        available={pick.available}
        shown={pick.shown}
        onShown={pick.setShown}
        amounts={pick.amounts}
        picked={pick.picked}
        onPick={pick.setPicked}
        rows={pick.rows}
        nominalMode={nominalMode}
        format={format}
      />
      <HeroFootnote
        draft={draft}
        isHero={isHero}
        narrow={narrow}
        chipsAbove={legendStore !== undefined}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
        breakdownInTodaysMoney={nominalMode}
        reserve={drawn.markerYears.length > 0}
      />
    </>
  )
}

function NetWorthChartImpl({
  activeId = null,
  dirty = false,
  variant = 'default',
  footer,
  footerBare = false,
  headerAside,
  extraSeries = [],
  nominalMode = false,
  ...rest
}: NetWorthChartProps) {
  const m = useNetWorthChart({ activeId, dirty, variant, extraSeries, nominalMode, ...rest })
  return (
    <Card className={m.env.isHero ? `${styles.chartCard} ${styles.heroChart}` : styles.chartCard}>
      <ChartPlot m={m} headerAside={headerAside} />
      <ChartUnder m={m} />
      <ChartFooter footer={footer} bare={footerBare} />
      {m.sheet.sheet}
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
