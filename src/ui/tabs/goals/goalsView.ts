export type TabView = 'plan' | 'progress' | 'assumptions'
/** On a phone Plan is two screens, the chart and the controls, instead of one. */
export type MobilePlanView = 'chart' | 'adjust'
/** The phone's four views: Plan is split in two there, so it has no segment of its own. */
export type GoalsMobileView = MobilePlanView | Exclude<TabView, 'plan'>

/** What a link that opens Assumptions asks it to bring into view; any other way in starts at the top. */
export type AssumptionsFocus = 'inflation' | 'accounts'

/**
 * The view row is a tab list over one panel: what ties each tab (`goals-view-<view>`) to the
 * panel that shows the selected view. Only one row is mounted at a time, phone or wide.
 */
export const GOALS_VIEW_TABS = { idPrefix: 'goals-view', panelId: 'goals-panel' }

/** What the phone's one row shows as selected: Plan is whichever of its halves was last open. */
export function mobileViewOf(view: TabView, half: MobilePlanView): GoalsMobileView {
  return view === 'plan' ? half : view
}

/**
 * What choosing a segment of the phone's row changes: the half of Plan, the view, or both.
 * Moving between Plan's halves is not a change of view, which would drop what a view change
 * drops (the inflation preview), so `view` is left out when Plan is already the view.
 */
export function mobileSelection(
  next: GoalsMobileView,
  view: TabView,
): { view: TabView | null; half: MobilePlanView | null } {
  if (next === 'chart' || next === 'adjust') {
    return { half: next, view: view === 'plan' ? null : 'plan' }
  }
  return { half: null, view: next }
}
