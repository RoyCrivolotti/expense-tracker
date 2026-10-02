import { useMediaQuery } from './useMediaQuery'

const QUERY = '(max-width: 767px)'

/** True when viewport is below 768px — aligns with AppShell's desktop breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery(QUERY)
}
