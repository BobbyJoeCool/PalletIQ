import { HOLD_LABELS, type HoldCategory } from '../components/shared/HoldPanel';

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
 * their own activity feed would be misleading). STAGE is also hidden here even though it's
 * a real worker action — it's the per-location bookkeeping row reporting.ts's "Staged
 * Longest" column depends on (see staging.ts's comment on stageLocations/restageAisle);
 * STAGE_SUM and RESTAGE are the combined, one-row-per-action entries meant for display.
 * Everything else in the ActivityLog table represents a real, completed action worth showing.
 */
const HIDDEN_ACTION_TYPES = new Set(['RESERVE', 'MNP_SCAN', 'RES_TMOUT', 'STAGE']);

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
  STAGE_SUM: 'STG',
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

export type Severity = 'info' | 'success' | 'warning' | 'error';

/** Tailwind arbitrary-value text color class for each severity, tuned for the overlay's dark background. */
const SEVERITY_COLORS: Record<Severity, string> = {
  info: 'text-[#5B9BD5]',
  success: 'text-[#5CB85C]',
  warning: 'text-[#E0B84C]',
  error: 'text-[#FF4444]',
};

export function severityColorClass(severity: Severity): string {
  return SEVERITY_COLORS[severity];
}

/**
 * Classifies an entry's outcome for the detail line's color-coding. Most actionTypes map
 * 1:1 to a severity, but PUT and RESTAGE need to inspect `details` — a PUT can be a routine
 * store, a non-consolidation move (worth flagging), or an MNP put into an already-occupied
 * location (also worth flagging); a RESTAGE can be an ordinary restage or a pure unstage
 * (nothing re-staged, only cleared).
 */
export function severityFor(entry: ActivityEntry): Severity {
  const d = entry.details ?? {};

  switch (entry.actionType) {
    case 'PULL':
    case 'STAGE_SUM':
    case 'REINSTATE':
      return 'success';

    case 'PUT': {
      if (d.method === 'MNP' && d.destinationWasOccupied === true) return 'warning';
      if (d.wasMove === true && d.consolidating !== true) return 'warning';
      return 'success';
    }

    case 'RESTAGE': {
      const results = Array.isArray(d.results)
        ? d.results as { cleared: number; staged: number }[]
        : [];
      const totalStaged = results.reduce((sum, r) => sum + (r.staged ?? 0), 0);
      const totalCleared = results.reduce((sum, r) => sum + (r.cleared ?? 0), 0);
      return totalStaged === 0 && totalCleared > 0 ? 'warning' : 'success';
    }

    case 'BLOCK_PUT':
    case 'HOLD_PLACE':
    case 'HOLD_CLEAR':
    case 'RANGE_HOLD':
    case 'RANGE_REL':
      return 'warning';

    case 'EDIT_PAL':
    case 'UNASSIGN':
      return 'info';

    case 'RES_TMOUT':
      return 'error';

    default:
      return 'info';
  }
}

/** A tappable ID reference within a detail line — rendered as a <LiveId> by the overlay. */
export type DetailIdToken = { id: string; type: 'pallet' | 'location' | 'dpci' | 'upc' };
export type DetailToken = string | DetailIdToken;
/** One rendered line of an entry's detail text; an entry can produce more than one. */
export type DetailLine = DetailToken[];

function palletToken(palletId: number | null): DetailIdToken | null {
  return palletId != null ? { id: String(palletId), type: 'pallet' } : null;
}

function locationToken(location: string | null): DetailIdToken | null {
  return location ? { id: location, type: 'location' } : null;
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

const PULL_FUNCTION_LABELS: Record<string, string> = { CA: 'CA Pull', CF: 'CF Pull', FP: 'FP Pull' };

/** Builds the compact "2P 5C 3S" quantity readout, omitting zero components. */
function fmtPCS(pallets: number, cartons: number, ssps: number): string {
  const parts: string[] = [];
  if (pallets > 0) parts.push(`${pallets}P`);
  if (cartons > 0) parts.push(`${cartons}C`);
  if (ssps > 0) parts.push(`${ssps}S`);
  return parts.length > 0 ? parts.join(' ') : '0C';
}

/**
 * Builds the trailing "(Scan: PID, Enter: BIN)" verification-method suffix — records how
 * each field that produced a PULL or (SDP) PUT was entered, scanned vs. hand-typed. Missing
 * from log entries written before this tracking existed, so callers only invoke this when
 * the relevant `details` field is actually present, and this always returns a non-empty
 * string given a non-empty `parts`.
 */
function fmtVerification(parts: { label: string; scanned: boolean }[]): string {
  return ` (${parts.map((p) => `${p.scanned ? 'Scan' : 'Enter'}: ${p.label}`).join(', ')})`;
}

const EDIT_FIELD_LABELS: Record<string, string> = {
  dpci: 'DPCI',
  vcp: 'VCP',
  ssp: 'SSP/CTN',
  currentPallets: 'Pallets',
  currentCartons: 'Cartons',
  currentSSPs: 'SSP',
};
const EDIT_FIELD_ORDER = ['dpci', 'vcp', 'ssp', 'currentPallets', 'currentCartons', 'currentSSPs'];

function fmtEditValue(field: string, value: unknown): string {
  if (field === 'dpci' && value && typeof value === 'object') {
    const v = value as { dept: number; class: number; item: number };
    return `${String(v.dept).padStart(3, '0')}-${String(v.class).padStart(2, '0')}-${String(v.item).padStart(4, '0')}`;
  }
  return String(value);
}

/**
 * Builds the detail text for one activity entry as one or more lines, each a mix of plain
 * text and tappable ID tokens (rendered as <LiveId> by the overlay — issue #46's tap-nav
 * requirement). Every actionType the app writes today (minus the hidden bookkeeping ones —
 * see HIDDEN_ACTION_TYPES) has a bespoke description here; an unrecognized future actionType
 * falls back to a plain readout of its raw fields rather than a blank line.
 */
export function detailFor(entry: ActivityEntry): DetailLine[] {
  const d = entry.details ?? {};
  const pallet = palletToken(entry.palletId);
  const loc = locationToken(entry.location);

  switch (entry.actionType) {
    case 'PULL': {
      const pullFunction = d.pullFunction as string | undefined;
      const label = (pullFunction && PULL_FUNCTION_LABELS[pullFunction]) || 'Pull';
      const pulled = (d.pulled ?? {}) as { pallets?: number; cartons?: number; ssps?: number };
      const qty = fmtPCS(pulled.pallets ?? 0, pulled.cartons ?? 0, pulled.ssps ?? 0);
      const line: DetailLine = [`${label}: Pulled ${qty} from `];
      line.push(pallet ?? '?');
      if (loc) line.push(' at ', loc);
      const verifiedVia = d.verifiedVia as string | undefined;
      if (verifiedVia) {
        line.push(fmtVerification([{ label: verifiedVia, scanned: d.wasScanned === true }]));
      }
      return [line];
    }

    case 'PUT': {
      const wasMove = d.wasMove === true;
      const method = d.method as string | undefined;
      const clearedLoc = locationToken((d.clearedLocation as string | null) ?? null);
      // Only ever set on SDP's confirmPut (findNextLocation's STAGED-vs-EMPTY match) —
      // undefined for MNP (whose own, differently-scoped destinationWasStaged isn't
      // rendered here) and for any entry written before this tracking existed.
      const wasStaged = d.wasStaged as boolean | undefined;
      const stagedTag = wasStaged != null ? (wasStaged ? ' (Staged)' : ' (Empty)') : null;
      const line: DetailLine = [pallet ?? '?'];
      if (wasMove && clearedLoc) {
        line.push(' moved from ', clearedLoc, ' to ', loc ?? '?');
      } else {
        line.push(' put in ', loc ?? '?');
      }
      if (stagedTag) line.push(stagedTag);
      if (method === 'SDP') {
        const override = d.override as Record<string, string | number> | undefined;
        if (override && Object.keys(override).length > 0) {
          const parts: string[] = [];
          if (override.size) parts.push(`Size: ${override.size}`);
          if (override.storageCode) parts.push(`Storage: ${override.storageCode}`);
          if (override.zone != null) parts.push(`Zone: ${override.zone}`);
          line.push(` — Override {${parts.join(', ')}}`);
        }
      }
      if (method === 'MNP' && d.destinationWasOccupied === true) {
        line.push(' — Location was occupied');
      }
      if (method === 'SDP') {
        const verification = d.verification as { pid?: { scanned: boolean }; bin?: { scanned: boolean } } | undefined;
        if (verification) {
          const parts: { label: string; scanned: boolean }[] = [];
          if (verification.pid) parts.push({ label: 'PID', scanned: verification.pid.scanned === true });
          if (verification.bin) parts.push({ label: 'BIN', scanned: verification.bin.scanned === true });
          if (parts.length > 0) line.push(fmtVerification(parts));
        }
      }
      return [line];
    }

    case 'UNASSIGN': {
      const releasedStatus = d.releasedStatus as 'STAGED' | 'EMPTY' | undefined;
      const releasedTag = releasedStatus ? ` (${releasedStatus === 'STAGED' ? 'Staged' : 'Empty'})` : '';
      return [loc ? ['Released reservation at ', loc, releasedTag] : ['Released a reservation']];
    }

    case 'BLOCK_PUT':
      return [loc ? ['Marked ', loc, ' as blocked and redirected to a new location'] : ['Marked a location as blocked']];

    case 'STAGE_SUM': {
      const storageCode = (d.storageCode as string | undefined) ?? '';
      const size = (d.size as string | undefined) ?? '';
      const count = (d.count as number | undefined) ?? 0;
      return [[`Staged ${count} ${storageCode}-${size} in Aisle ${entry.locationAisle ?? '?'}`]];
    }

    case 'RESTAGE': {
      const results = Array.isArray(d.results)
        ? d.results as { storageCode: string; size: string; cleared: number; staged: number }[]
        : [];
      if (results.length === 0) return [[`Restaged 0 locations in Aisle ${entry.locationAisle ?? '?'}`]];
      return results.map((r) => [
        `Cleared ${r.cleared}, staged ${r.staged} of ${r.storageCode}-${r.size} in Aisle ${entry.locationAisle ?? '?'}`,
      ]);
    }

    case 'HOLD_PLACE':
      return [loc ? [`Placed ${holdCategoryName(d.holdType)} on `, loc] : ['Placed a hold']];

    case 'HOLD_CLEAR':
      return [loc ? [`Removed ${holdCategoryName(d.clearedHoldType)} from `, loc] : ['Removed a hold']];

    case 'RANGE_HOLD': {
      const placed = (d.placed as number | undefined) ?? 0;
      const upgraded = (d.upgraded as number | undefined) ?? 0;
      const blocked = (d.blocked as number | undefined) ?? 0;
      const parts = [`Placed ${holdCategoryName(d.holdType)} on ${placed} locations`];
      if (upgraded > 0) parts.push(`upgraded ${upgraded} to Hold Both`);
      if (blocked > 0) parts.push(`${blocked} blocked`);
      return [[`${parts.join(', ')} — ${rangeDesc(entry.locationAisle, d)}`]];
    }

    case 'RANGE_REL': {
      const released = (d.released as number | undefined) ?? 0;
      return [[`Released holds on ${released} locations — ${rangeDesc(entry.locationAisle, d)}`]];
    }

    case 'EDIT_PAL': {
      const oldVals = (d.old ?? {}) as Record<string, unknown>;
      const newVals = (d.new ?? {}) as Record<string, unknown>;
      const reasonCode = (d.reasonCode as string | undefined) ?? '';
      const changed = EDIT_FIELD_ORDER.filter((f) => f in oldVals);

      const headerLine: DetailLine = loc ? ['Modified Pallet in ', loc] : ['Modified Pallet'];

      const oldStr = changed.map((f) => `${EDIT_FIELD_LABELS[f]}: ${fmtEditValue(f, oldVals[f])}`).join(', ');
      const newStr = changed.map((f) => `${EDIT_FIELD_LABELS[f]}: ${fmtEditValue(f, newVals[f])}`).join(', ');
      const diffLine: DetailLine = [
        pallet ?? '?',
        ` ${oldStr} changed to ${newStr}. Reason ${reasonCode}`,
      ];

      return [headerLine, diffLine];
    }

    case 'REINSTATE':
      return [['Reinstated pallet ', pallet ?? '?']];

    default:
      return [loc ? [`${entry.actionType} at `, loc] : [entry.actionType]];
  }
}
