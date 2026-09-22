// One lock, shared with the hub menu and BottomSheet in folio-shell. A private copy here breaks as
// soon as it overlaps the menu's lock and the two release out of order: the page is left unable to
// scroll until the app is restarted.
export { useBodyScrollLock, isBodyScrollLocked } from 'folio-shell'
