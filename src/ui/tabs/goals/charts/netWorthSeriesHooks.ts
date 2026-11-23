import { useMemo, useState } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { MoneyFormat, PlanFromToday } from '../../../../engine'
import { RETURN_BAND_SPREAD, formatPercent } from '../../../../engine'
import type { ChartSeries } from '../../../charts/LinearChart'
import type { ValueTagSpec } from '../../../charts/valueTags'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { fromTodayPoints } from './fromTodayLine'
import { HERO_WINDOWS, clipToWindow, heroWindowsFor, insideWindow, type HeroWindowKey } from './heroWindow'
import { inkOn, scenarioInk } from '../scenarioInk'
import { bandSeries, buildSeries, scenarioLines, type HeroAxis } from './heroSeries'

/**
 * Where the draft and the plan from today start on the axis, and the axis' first day where it is a
 * calendar. The plan from today is placed from the plan's own start: the restart's is its check-in.
 */
export function placesOnAxis(
  axis: HeroAxis,
  draft: NewGoalScenario,
  fromToday: PlanFromToday | null | undefined,
) {
  return {
    calendarOrigin: axis.calendar ? axis.origin : null,
    draftOffset: axis.offsetOf(draft.planStartDate),
    planOffset: axis.offsetOf(fromToday?.source.plan.planStartDate),
  }
}

/** The hero's window buttons: which years of the projection are drawn. */
export function useHeroWindow(
  isHero: boolean,
  horizonYears: number,
) {
  const [picked, setHeroWindow] = useState<HeroWindowKey>('all')
  const heroWindows = useMemo(() => heroWindowsFor(horizonYears), [horizonYears])
  // A window the horizon has since shrunk under falls back to All rather than sitting
  // selected-but-unlisted; picking it again once the horizon grows still works.
  const heroWindow = heroWindows.some((w) => w.value === picked) ? picked : 'all'
  const chosen = HERO_WINDOWS.find((w) => w.value === heroWindow)?.years ?? null
  return { heroWindow, setHeroWindow, heroWindows, windowYears: isHero ? chosen : null }
}

/**
 * The plan from the latest check-in, hero only: the same assumptions projected from the
 * balance actually there, drawn from the check-in's place on the plan's axis as a dotted
 * line in the plan's colour, so ahead or behind can be read on into the future rather than
 * only as a gap today.
 */
export function useFromTodaySeries(
  isHero: boolean,
  fromToday: PlanFromToday | null | undefined,
  inflationRate: number,
  windowYears: number | null,
  extentYears: number,
  planOffset: number,
): ChartSeries | null {
  return useMemo(() => {
    if (!isHero || !fromToday) return null
    const limit = windowYears ?? extentYears
    const all = fromTodayPoints(fromToday, inflationRate, planOffset)
    const points = all.filter((p) => p.xIndex <= limit)
    // The steps sit a fraction of a year past the axis' own (the check-in is not on a year), so
    // the last one inside the window stops short of it, and the line has no value at the final
    // year. Carry it there along the step it is cut from.
    const last = points[points.length - 1]
    const next = all[points.length]
    if (last && next && last.xIndex < limit) {
      const t = (limit - last.xIndex) / (next.xIndex - last.xIndex)
      points.push({ xIndex: limit, value: Math.round(last.value + t * (next.value - last.value)) })
    }
    if (points.length < 2) return null
    return {
      id: 'from-today',
      color: scenarioInk(fromToday.scenario.color),
      values: [],
      kind: 'scatter',
      points,
      connect: true,
      dashed: true,
      dots: false,
      tagged: true,
    }
  }, [isHero, fromToday, inflationRate, windowYears, extentYears, planOffset])
}

/** The from-today line as drawn, with the legend label it goes under. */
export function fromTodayDrawing(
  realPoints: ChartSeries[],
  fromToday: PlanFromToday | null | undefined,
): { line: ChartSeries | null; label: string } {
  const line = realPoints[0] ?? null
  return { line, label: fromToday ? `${fromToday.scenario.name}, from today` : '' }
}

/** The draft at a return three points either side, hero only: a sensitivity to the return, not a range of likely outcomes. */
export function useBandSeries(
  isHero: boolean,
  draft: NewGoalScenario,
  inflationRate: number,
  offsetYears: number,
): ChartSeries | null {
  return useMemo(
    () => (isHero ? bandSeries(draft, offsetYears, inflationRate) : null),
    [isHero, draft, inflationRate, offsetYears],
  )
}

/**
 * The inflation the plan is projected at. The monthly amount is euros as sent, so the real line
 * itself depends on the inflation it is brought back by: a previewed rate is a new projection,
 * not the saved one drawn higher.
 */
export function projectionAtPreview(
  nominalMode: boolean,
  viewInflation: number | null | undefined,
  savedInflation: number,
): { previewing: boolean; projectionRate: number } {
  const previewing = nominalMode && viewInflation != null && viewInflation !== savedInflation
  return { previewing, projectionRate: previewing ? viewInflation : savedInflation }
}

/**
 * The lines at the saved inflation while another rate is being previewed, cut at the window like
 * the lines drawn: the Nominal view holds its axis at the height the saved rate gives it, whatever
 * is previewed, so stepping the preview moves the plan against a scale that holds still.
 */
export function useSavedRateFloor(
  previewing: boolean,
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
  savedInflation: number,
  hiddenIds: ReadonlySet<number> | undefined,
  windowYears: number | null,
  axis: HeroAxis,
): ChartSeries[] | null {
  const format = useMoneyFormat()
  return useMemo(() => {
    if (!previewing) return null
    const built = buildSeries(
      scenarioLines(scenarios, draft, activeId, dirty, savedInflation, axis, format, hiddenIds),
      savedInflation,
    )
    return clipToWindow(built.years, built.series, windowYears).series
  }, [previewing, scenarios, draft, activeId, dirty, savedInflation, hiddenIds, windowYears, axis, format])
}

/** Everything drawn, cut at the window in one go so the axis fits what is left. */
export function useWindowedSeries(
  full: { years: number[]; series: ChartSeries[] },
  band: ChartSeries | null,
  extra: ChartSeries[],
  windowYears: number | null,
) {
  return useMemo(() => {
    const bandList = band ? [band] : []
    const cut = clipToWindow(full.years, [...full.series, ...bandList, ...extra], windowYears)
    const n = full.series.length
    return {
      years: cut.years,
      series: cut.series.slice(0, n),
      band: band ? (cut.series[n] ?? null) : null,
      extra: cut.series.slice(n + bandList.length),
    }
  }, [full, band, extra, windowYears])
}

export function useLifeEventMarkers(
  isHero: boolean,
  draft: NewGoalScenario,
  windowYears: number | null,
  offsetYears: number,
) {
  return useMemo(() => {
    if (!isHero) return []
    return (draft.lifeEvents ?? [])
      .filter((ev) => ev.year >= 1 && ev.year <= draft.horizonYears && insideWindow(offsetYears + ev.year, windowYears))
      .map((ev) => ({
        yearIndex: offsetYears + ev.year,
        label: ev.label,
        amountCents: ev.amountCents,
        ...(offsetYears > 0 ? { year: ev.year } : {}),
      }))
  }, [isHero, draft.lifeEvents, draft.horizonYears, windowYears, offsetYears])
}

/**
 * The FI number for the draft, hero only, and only when spend and rate make sense. It is in the draft's
 * own euros, so a draft that starts after the axis' origin has it brought back to the origin's.
 */
export function useFiTarget(
  isHero: boolean,
  draft: NewGoalScenario,
  offsetYears: number,
  inflationRate: number,
): number | null {
  return useMemo(() => {
    if (!isHero || draft.annualSpendCents <= 0 || draft.safeWithdrawalRate <= 0) return null
    const own = draft.annualSpendCents / draft.safeWithdrawalRate
    return Math.round(offsetYears > 0 ? own / Math.pow(1 + inflationRate, offsetYears) : own)
  }, [isHero, draft.annualSpendCents, draft.safeWithdrawalRate, offsetYears, inflationRate])
}

/**
 * The wide hero tags each line's value in a chip beside its dot (and the band's over and under
 * values), to two decimals in millions: the chips above the chart are what names the lines, so the
 * chart itself only has to say how much. Absent where the chips are not above it.
 */
export function useValueTags(
  on: boolean,
  expectedRealReturn: number,
  format: MoneyFormat,
): ValueTagSpec | undefined {
  return useMemo(
    () =>
      on
        ? {
            format: (cents: number) => formatMoneyShort(cents, format, 2),
            textOn: inkOn,
            bandLabels: {
              lo: formatPercent(Math.max(0, expectedRealReturn - RETURN_BAND_SPREAD), format),
              hi: formatPercent(expectedRealReturn + RETURN_BAND_SPREAD, format),
            },
          }
        : undefined,
    [on, expectedRealReturn, format],
  )
}
