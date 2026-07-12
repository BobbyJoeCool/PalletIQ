import { HOLD_LABELS, type HoldCategory } from '../components/shared/HoldPanel';
import { fmtLocation } from './fmt';

export interface ActivityEntry {
  id: number;
  timestamp: string;
  userId: string;
  actionType: string;
  palletId: number | null;
  locationAisle: number | null;
  location: string | null;
  dpci: string | null;
  details: Record<string, unknown> | null;
}

/**
 * actionTypes that represent an intermediate/system bookkeeping step rather than a
 * meaningful, worker-initiated action worth surfacing in the cross-function activity log
 * (issue #46) — RESERVE and MNP_SCAN are pre-steps immediately followed by the actionType
 * that actually completes the transaction (PUT, UNASSIGN, or BLOCK_PUT), and RES_TMOUT is
 * a server-initiated auto-expiry (the worker didn't do anything; attributing a timeout to
 * their own activity feed would be misleading). Everything else in the ActivityLog table
 * represents a real, completed action the worker took.
 */
const HIDDEN_ACTION_TYPES = new Set(['RESERVE', 'MNP_SCAN', 'RES_TMOUT']);

/** True if this entry should appear in the app-wide activity log (issue #46). */
export function isVisibleActivity(entry: ActivityEntry): boolean {
  return !HIDDEN_ACTION_TYPES.has(entry.actionType);
}

/** Short function tag shown on each entry's top line, per the settled design's examples (PUT/PULL/STG/WLH). */
const ACTIVITY_TAGS: Record<string, string> = {
  PULL: 'PULL',
  PUT: 'PUT',
  UNASSIGN: 'PUT',
  BLOCK_PUT: 'PUT',
  STAGE: 'STG',
  RESTAGE: 'STG',
  HOLD_PLACE: 'WLH',
  HOLD_CLEAR: 'WLH',
  RANGE_HOLD: 'WLH',
  RANGE_REL: 'WLH',
  EDIT_PAL: 'PII',
  REINSTATE: 'PAR',
};

/** Falls back to the raw actionType (truncated to fit the same visual slot) if not in ACTIVITY_TAGS. */
export function tagFor(entry: ActivityEntry): string {
  return ACTIVITY_TAGS[entry.actionType] ?? entry.actionType.slice(0, 4);
}

/** Formats a single hold-related detail line, shared by HOLD_PLACE/HOLD_CLEAR. */
function holdCategoryName(cat: unknown): string {
  return typeof cat === 'string' && cat in HOLD_LABELS ? HOLD_LABELS[cat as HoldCategory].name : String(cat);
}

/** Builds the "Aisle X, Bin Y-Z" range description shared by RANGE_HOLD/RANGE_REL detail lines. */
function rangeDesc(aisle: number | null, d: Record<string, unknown>): string {
  const startBin = d.startBin as number | undefined;
  const endBin = d.endBin as number | undefined;
  const binSide = d.binSide as string | undefined;
  const side = binSide && binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : '';
  return `Aisle ${aisle ?? '?'}, Bin ${startBin}-${endBin}${side}`;
}

/**
 * Builds the free-form second-line detail text for one activity entry, per issue #46's
 * generic two-line format (tag+time on top, description below). Every actionType the app
 * writes today (minus the hidden bookkeeping ones — see HIDDEN_ACTION_TYPES) has a bespoke
 * description here; an unrecognized future actionType falls back to a plain readout of its
 * raw fields rather than a blank line.
 */
export function detailFor(entry: ActivityEntry): string {
  const d = entry.details ?? {};
  const loc = entry.location ? fmtLocation(entry.location) : null;

  switch (entry.actionType) {
    case 'PULL':
      return loc ? `Pulled pallet from ${loc}` : 'Pulled pallet';
    case 'PUT':
      return loc ? `${d.wasMove ? 'Moved' : 'Put'} pallet to ${loc}` : 'Put pallet';
    case 'UNASSIGN':
      return loc ? `Released reservation at ${loc}` : 'Released a reservation';
    case 'BLOCK_PUT':
      return loc ? `Marked ${loc} as blocked and redirected to a new location` : 'Marked a location as blocked';
    case 'STAGE': {
      const storageCode = d.storageCode as string | undefined;
      const size = d.size as string | undefined;
      return loc ? `Staged ${size ?? ''} ${storageCode ?? ''} at ${loc}`.replace(/\s+/g, ' ').trim() : 'Staged a location';
    }
    case 'RESTAGE': {
      const results = Array.isArray(d.results) ? d.results as { storageCode: string; size: string; staged: number }[] : [];
      const summary = results.filter((r) => r.staged > 0).map((r) => `${r.staged} ${r.storageCode}-${r.size}`).join(', ');
      return `Restaged ${summary || '0 locations'} in Aisle ${entry.locationAisle ?? '?'}`;
    }
    case 'HOLD_PLACE':
      return loc ? `Placed ${holdCategoryName(d.holdType)} on ${loc}` : 'Placed a hold';
    case 'HOLD_CLEAR':
      return loc ? `Removed ${holdCategoryName(d.clearedHoldType)} from ${loc}` : 'Removed a hold';
    case 'RANGE_HOLD': {
      const placed = (d.placed as number | undefined) ?? 0;
      const upgraded = (d.upgraded as number | undefined) ?? 0;
      const blocked = (d.blocked as number | undefined) ?? 0;
      const parts = [`Placed ${holdCategoryName(d.holdType)} on ${placed} locations`];
      if (upgraded > 0) parts.push(`upgraded ${upgraded} to Hold Both`);
      if (blocked > 0) parts.push(`${blocked} blocked`);
      return `${parts.join(', ')} — ${rangeDesc(entry.locationAisle, d)}`;
    }
    case 'RANGE_REL': {
      const released = (d.released as number | undefined) ?? 0;
      return `Released holds on ${released} locations — ${rangeDesc(entry.locationAisle, d)}`;
    }
    case 'EDIT_PAL': {
      const changed = d.new && typeof d.new === 'object' ? Object.keys(d.new as object) : [];
      return `Changed ${changed.length > 0 ? changed.join(', ') : 'pallet details'} on pallet ${entry.palletId ?? '?'}`;
    }
    case 'REINSTATE':
      return `Reinstated pallet ${entry.palletId ?? '?'}`;
    default:
      return loc ? `${entry.actionType} at ${loc}` : entry.actionType;
  }
}
