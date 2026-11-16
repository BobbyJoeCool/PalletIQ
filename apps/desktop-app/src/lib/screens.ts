/**
 * The eight planned Manager screens (umbrella issue #140). This registry is the single
 * source the nav, the home grid and the routes are built from; a screen moves from
 * "Coming Soon" to real by gaining its own page under its own issue.
 */
export interface DesktopScreen {
  /** URL slug — the screen lives at `/screens/{id}`. */
  id: string;
  title: string;
  /** GitHub issue tracking this screen's build. */
  issue: number;
  /** One-line description shown on the home grid and the Coming Soon page. */
  summary: string;
}

export const DESKTOP_SCREENS: readonly DesktopScreen[] = [
  {
    id: 'dpci-setup',
    title: 'DPCI Setup Edit',
    issue: 142,
    summary: 'Item setup and edit: handling codes, item hold, and HQ change tickets.',
  },
  {
    id: 'location-setup',
    title: 'Location Setup Edit',
    issue: 143,
    summary: 'Aisle structure plus a grid editor for storage code, size and contraction.',
  },
  {
    id: 'hung-resolution',
    title: 'Hung Pallet/Location Resolution',
    issue: 144,
    summary: 'Soft and Hard Reset recovery for pallets and locations stuck in a bad state.',
  },
  {
    id: 'job-assignment',
    title: 'Job/Function Assignment',
    issue: 145,
    summary: 'Drag-and-drop shift roster and function assignment.',
  },
  {
    id: 'prod-goals',
    title: 'Prod Goal / Ramping / Daily Plan',
    issue: 146,
    summary: 'Prod-goal rates, per-worker ramping overrides, and Daily Plan targets.',
  },
  {
    id: 'team-prod-summary',
    title: 'Team Prod Summary',
    issue: 147,
    summary: 'Live production-versus-plan dashboard by job function.',
  },
  {
    id: 'audit-tool',
    title: 'Audit Tool',
    issue: 148,
    summary: 'Cross-referenced audit trail lookup across every major entity.',
  },
];

/** The Embedded Floor App (#141) is a window opened from the shell's toggle, not a page. */
export const FLOOR_APP_ISSUE = 141;

/**
 * @param id - a screen slug from the URL
 * @returns the matching screen, or undefined if the slug is unknown
 */
export function findScreen(id: string | undefined): DesktopScreen | undefined {
  return DESKTOP_SCREENS.find((screen) => screen.id === id);
}
