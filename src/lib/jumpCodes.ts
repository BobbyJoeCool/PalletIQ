export interface JumpCode {
  code: string;
  label: string;
  route: string;
  built: boolean;
}

/** Registry of all 3-letter jump codes and their screen metadata. */
export const JUMP_CODES: Record<string, JumpCode> = {
  MMN: { code: 'MMN', label: 'Main Menu',                   route: '/',                       built: true  },
  PIP: { code: 'PIP', label: 'Pallet ID Pull',              route: '/pull',                   built: true  },
  SDP: { code: 'SDP', label: 'System Directed Put',         route: '/put/directed',           built: true  },
  MNP: { code: 'MNP', label: 'Manual Put',                  route: '/put/manual',             built: true  },
  PII: { code: 'PII', label: 'Pallet ID Info',              route: '/pallet',                 built: true  },
  IID: { code: 'IID', label: 'Item ID Lookup',              route: '/item',                   built: true  },
  PAR: { code: 'PAR', label: 'Pallet Reinstate',            route: '/pallet/reinstate',       built: true  },
  LII: { code: 'LII', label: 'Location ID Info',            route: '/location',               built: true  },
  WLH: { code: 'WLH', label: 'Warehouse Location Hold',     route: '/hold',                   built: true  },
  SAR: { code: 'SAR', label: 'Staged Aisle Report',         route: '/staged-aisle',           built: true  },
  ISI: { code: 'ISI', label: 'Item Storage Inquiry',        route: '/storage-inquiry',        built: true  },
  ELA: { code: 'ELA', label: 'Empty Locations by Aisle',    route: '/empty/aisle',            built: true  },
  ELZ: { code: 'ELZ', label: 'Empty Locations by Zone',     route: '/empty/zone',             built: true  },
  STG: { code: 'STG', label: 'Stage Aisle',                 route: '/stage',                  built: true  },
  IRP: { code: 'IRP', label: 'Individual Reporting',        route: '/reporting/individual',   built: false },
  PRQ: { code: 'PRQ', label: 'Pull Request by Label',       route: '/reporting/pull-request', built: false },
};

/** The subset of jump codes shown as quick-access buttons in the HotJump shortcuts panel. */
export const COMMON_SHORTCUTS: JumpCode[] = [
  JUMP_CODES.PIP,
  JUMP_CODES.SDP,
  JUMP_CODES.ELA,
  JUMP_CODES.ELZ,
  JUMP_CODES.MMN,
];

/**
 * Looks up a jump code entry by its 3-letter code string (case-insensitive).
 * Used by HotJump for typed-code resolution and by HomePage to check whether
 * a function button is available in the current demo build.
 *
 * @param code - 3-letter function code (e.g. "PIP", "sdp", "ELA")
 * @returns The matching JumpCode entry, or null if the code does not exist
 */
export function resolveJump(code: string): JumpCode | null {
  return JUMP_CODES[code.toUpperCase()] ?? null;
}
