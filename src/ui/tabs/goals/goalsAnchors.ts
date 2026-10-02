/**
 * The elements of the Goals tab that other code finds by id: the scroll helpers measure them
 * and the pinned-padding hook watches them, so the ids live in one place rather than being
 * spelled in the file that happens to render each one.
 */

/** Where a Goals view's own content starts: past the intro and glossary, which only Plan has. */
export const GOALS_CONTENT_ANCHOR_ID = 'goals-content-top'

/** The sticky row of Goals views on a phone, which is what stays pinned in every view. */
export const GOALS_NAV_ID = 'goals-nav'

/** The draft's chart and the section chips under the view row in Adjust, pinned where the screen has room. */
export const ADJUST_STACK_ID = 'goals-adjust-stack'
