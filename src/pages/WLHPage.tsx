import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hasMinRole, type Role } from '@shared/index';
import { HOLD_LABELS, HoldPanel, type HoldCategory } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { ReasonCodeField } from '../components/shared/ReasonCodeField';
import { LiveId } from '../components/ui/LiveId';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { HOLD_REASON_CODES } from '../lib/holdReasonCodes';
import { useNumpadField } from '../lib/useNumpadField';

type BinSide = 'ALL' | 'ODD' | 'EVEN';
type RangeAction = 'PLACE' | 'RELEASE';

/** A single labeled 3-digit numeric entry box (Aisle/Start Bin/End Bin), styled to match
 *  LocationEntryFields' boxes. Range mode doesn't reuse LocationEntryFields itself — that
 *  component's fixed Aisle/Bin/Level shape and 8-digit full-barcode-scan override don't
 *  fit a Start/End Bin pair — but matches its visual language for consistency. */
function RangeNumBox({ label, field, onFocus }: {
  label: string;
  field: ReturnType<typeof useNumpadField>;
  onFocus: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 w-[120px]">
      <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={onFocus}
        className={`flex items-center h-[56px] px-4 rounded-[10px] bg-[#0D0D0D] border-2 transition-colors ${field.isActive ? 'border-[#CC0000]' : 'border-[#3A3A3A] hover:border-[#555]'}`}
      >
        <span className="font-data text-[22px] font-medium text-white">{field.value || <span className="text-[#444]">—</span>}</span>
        {field.isActive && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}

/** A row of mutually-exclusive text buttons (Bin Side: All/Odd/Even; Action: Place/Release). */
function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`h-[44px] px-5 rounded-[10px] font-ui text-[15px] font-medium border-2 transition-colors ${
            value === opt.value ? 'border-[#CC0000] bg-[#CC0000]/10 text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const BIN_SIDE_OPTIONS: { value: BinSide; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ODD', label: 'Odd only' },
  { value: 'EVEN', label: 'Even only' },
];
const ACTION_OPTIONS: { value: RangeAction; label: string }[] = [
  { value: 'PLACE', label: 'Place' },
  { value: 'RELEASE', label: 'Release' },
];

interface PlaceBreakdownRow { existing: HoldCategory | null; next: HoldCategory; outcome: 'placed' | 'upgraded' | 'blocked'; count: number }
interface ReleaseBreakdownRow { existing: HoldCategory; released: boolean; count: number }
interface RangeResult {
  total: number; placed?: number; upgraded?: number; blocked?: number; released?: number;
  breakdown?: (PlaceBreakdownRow | ReleaseBreakdownRow)[];
}

/** "Hold Inbound" for a real type, "None" for the null (no prior hold) bucket. */
function holdName(type: HoldCategory | null): string {
  return type ? HOLD_LABELS[type].name : 'None';
}

/**
 * WLH Range mode (issue #14) — places or releases a hold across every location in a
 * single-aisle bin range, instead of one location at a time. IM+ only (enforced server-side
 * too; this component is simply never mounted for sub-IM roles — see the mode toggle in
 * WLHPage). See DevNotes/DesignPrompts/Feature-3-WLH-Range-Hold.md for the full settled
 * design, including the Place-only hold hierarchy (HI = HO < HB < HP) applied server-side.
 */
function RangeHoldPanel({ onLog }: { onLog: (summary: string) => void }) {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const role = (user?.role ?? 'WORKER') as Role;

  // padOnSubmit: typing "5" and hitting OK is accepted as "005", matching every other
  // fixed-width Aisle/Bin field in the app (LocationEntryFields, ELZ, SDP, STG).
  const aisleField = useNumpadField('numpad', 3, true);
  const startBinField = useNumpadField('numpad', 3, true);
  const endBinField = useNumpadField('numpad', 3, true);
  // Level range (WLH fix item 03) — optional, 2-digit like every other Level field in the
  // app (LocationEntryFields, etc). Left blank on both ends means "every level," matching
  // the original single-aisle-and-bins-only design's default.
  const startLevelField = useNumpadField('numpad', 2, true);
  const endLevelField = useNumpadField('numpad', 2, true);

  const [binSide, setBinSide] = useState<BinSide>('ALL');
  const [action, setAction] = useState<RangeAction>('PLACE');
  const [holdType, setHoldType] = useState<HoldCategory | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [preview, setPreview] = useState<{ total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped after every successful submit to force ReasonCodeField to remount — unlike
  // HoldPanel's usage (which unmounts/remounts the field between placements by only
  // rendering it while `placing` is truthy), this panel keeps it permanently mounted, so
  // clearing `reasonCode` alone wouldn't reset the field's own internal dropdown selection.
  const [reasonCodeKey, setReasonCodeKey] = useState(0);

  const placeableTypes = (Object.keys(HOLD_LABELS) as HoldCategory[]).filter((t) => hasMinRole(role, HOLD_LABELS[t].placeRole));

  function focusAisle() { aisleField.focus((v) => { if (v.trim().length === 3) startBinField.focus(handleStartBin); }); }
  function focusStartBin() { startBinField.focus(handleStartBin); }
  function focusEndBin() { endBinField.focus(handleEndBin); }
  function focusStartLevel() { startLevelField.focus(() => {}); }
  function focusEndLevel() { endLevelField.focus(() => {}); }
  function handleStartBin(v: string) { if (v.trim().length === 3) { setTimeout(() => focusEndBin(), 50); } }
  function handleEndBin(v: string) { if (v.trim().length === 3) hidePanel(); }

  const aisle = aisleField.value ? parseInt(aisleField.value, 10) : NaN;
  const startBin = startBinField.value ? parseInt(startBinField.value, 10) : NaN;
  const endBin = endBinField.value ? parseInt(endBinField.value, 10) : NaN;
  // Level range (WLH fix item 03) is optional — either both boxes are blank (no filter, the
  // original "every level" default) or both are filled with a valid Start<=End pair. One
  // filled and the other blank is treated as invalid, same as any half-entered range.
  const startLevel = startLevelField.value ? parseInt(startLevelField.value, 10) : NaN;
  const endLevel = endLevelField.value ? parseInt(endLevelField.value, 10) : NaN;
  const hasLevelRange = startLevelField.value !== '' && endLevelField.value !== '';
  const levelRangeValid = startLevelField.value === '' && endLevelField.value === ''
    ? true
    : hasLevelRange && Number.isInteger(startLevel) && Number.isInteger(endLevel) && startLevel <= endLevel;
  const rangeValid = Number.isInteger(aisle) && Number.isInteger(startBin) && Number.isInteger(endBin) && startBin <= endBin && levelRangeValid;
  const canReview = rangeValid && (action === 'RELEASE' || (holdType != null && reasonCode !== ''));

  /** Human-readable summary of the current range, e.g. "Aisle 318, Bin 1–32 (Odd bins
   *  only), Levels 4–5" — shared by the success message and the confirmation modal. */
  function rangeDescription(): string {
    const binPart = `Aisle ${aisle}, Bin ${startBin}–${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''}`;
    return hasLevelRange ? `${binPart}, Levels ${startLevel}–${endLevel}` : binPart;
  }

  /** Fetches the range's matching location count and opens the confirmation modal. */
  async function review() {
    if (!canReview || submitting) return;
    try {
      const params = new URLSearchParams({ aisle: String(aisle), startBin: String(startBin), endBin: String(endBin), binSide });
      if (hasLevelRange) { params.set('startLevel', String(startLevel)); params.set('endLevel', String(endLevel)); }
      const { total } = await apiFetch<{ total: number }>(`/api/locations/range-count?${params}`, token!);
      setPreview({ total });
    } catch {
      setMessage({ type: 'error', text: 'Could not preview this range — please try again' });
    }
  }

  /** Submits the Place or Release range action after confirmation. */
  async function submit() {
    setSubmitting(true);
    try {
      const body = {
        aisle, startBin, endBin, binSide,
        ...(hasLevelRange ? { startLevel, endLevel } : {}),
        ...(action === 'PLACE' ? { holdType, reasonCode } : {}),
      };
      const result = await apiFetch<RangeResult>('/api/locations/range-hold', token!, {
        method: action === 'PLACE' ? 'PATCH' : 'DELETE',
        body: JSON.stringify(body),
      });
      playAlert('info');
      const rangeDesc = rangeDescription();
      // Message Bar stays short (v1.6.10) — the full per-bucket breakdown (what got
      // upgraded from what, what got blocked and why) now goes to the session Log instead
      // of being crammed into the transient Message Bar text.
      if (action === 'PLACE') {
        setMessage({ type: 'success', text: `Placed ${holdType ? HOLD_LABELS[holdType].name : ''} on ${result.total} locations — ${rangeDesc}` });
        const lines = [`Place ${holdType ? HOLD_LABELS[holdType].name : ''} — ${rangeDesc}`];
        for (const row of (result.breakdown ?? []) as PlaceBreakdownRow[]) {
          if (row.outcome === 'upgraded') lines.push(`${row.count} upgraded ${holdName(row.existing)} → ${holdName(row.next)}`);
          else if (row.outcome === 'blocked') lines.push(`${row.count} blocked (existing ${holdName(row.existing)})`);
          else lines.push(`${row.count} placed (was ${holdName(row.existing)})`);
        }
        onLog(lines.join('\n'));
      } else {
        setMessage({ type: 'success', text: `Holds released on ${result.total} locations — ${rangeDesc}` });
        const lines = [`Release — ${rangeDesc}`];
        for (const row of (result.breakdown ?? []) as ReleaseBreakdownRow[]) {
          lines.push(row.released ? `${row.count} released (was ${holdName(row.existing)})` : `${row.count} blocked (still ${holdName(row.existing)}, insufficient role)`);
        }
        onLog(lines.join('\n'));
      }
      aisleField.clear();
      startBinField.clear();
      endBinField.clear();
      startLevelField.clear();
      endLevelField.clear();
      setBinSide('ALL');
      setAction('PLACE');
      setHoldType(null);
      setReasonCode('');
      setReasonCodeKey((k) => k + 1);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Range action failed — please try again' });
    } finally {
      setSubmitting(false);
      setPreview(null);
    }
  }

  return (
    // flex-1/min-h-0/overflow-y-auto (WLH fix item 01): this panel's content can run long
    // enough (Level range + Hold Type + Reason Code, all inline) to push "Review Hold" past
    // the viewport with no way to reach it — scrolling within the panel itself, instead of
    // relying on the page never overflowing, keeps the button reachable regardless.
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 max-w-[720px] pr-1">
      <div className="flex items-stretch gap-3">
        <RangeNumBox label="Aisle" field={aisleField} onFocus={focusAisle} />
        <div className="w-px bg-[#3A3A3A]" />
        <RangeNumBox label="Start Bin" field={startBinField} onFocus={focusStartBin} />
        <RangeNumBox label="End Bin" field={endBinField} onFocus={focusEndBin} />
        <div className="w-px bg-[#3A3A3A]" />
        <RangeNumBox label="Start Level" field={startLevelField} onFocus={focusStartLevel} />
        <RangeNumBox label="End Level" field={endLevelField} onFocus={focusEndLevel} />
      </div>
      {!levelRangeValid && (
        <span className="font-ui text-[13px] text-[#CC0000] -mt-3">Enter both a Start and End Level, or leave both blank.</span>
      )}

      <div className="flex flex-col gap-1">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Bin Side</span>
        <SegmentedControl options={BIN_SIDE_OPTIONS} value={binSide} onChange={setBinSide} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Action</span>
        <SegmentedControl options={ACTION_OPTIONS} value={action} onChange={setAction} />
      </div>

      {action === 'PLACE' && (
        <>
          <div className="flex flex-col gap-2">
            <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Hold Type</span>
            <div className="grid grid-cols-2 gap-2">
              {placeableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHoldType(t)}
                  className={`flex flex-col items-start gap-0.5 px-4 py-3 rounded-[10px] border text-left transition-colors ${
                    holdType === t ? 'border-[#CC0000] bg-[#CC0000]/10' : 'border-[#3A3A3A] hover:border-[#555]'
                  }`}
                >
                  <span className="font-ui text-[16px] font-semibold text-white">{HOLD_LABELS[t].name}</span>
                  <span className="font-ui text-[13px] text-[#9A9A9A]">{HOLD_LABELS[t].blocks}</span>
                </button>
              ))}
            </div>
          </div>
          <ReasonCodeField key={reasonCodeKey} codes={HOLD_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="Reason Code" />
        </>
      )}

      <button
        type="button"
        onClick={() => void review()}
        disabled={!canReview}
        className="h-[56px] px-5 rounded-[12px] font-ui text-[16px] font-semibold text-white bg-[#003366] hover:bg-[#004488] disabled:opacity-40 transition-colors self-start"
      >
        Review {action === 'PLACE' ? 'Hold' : 'Release'}
      </button>

      {preview && (
        <ConfirmDialog
          title={action === 'PLACE' ? 'Place range hold?' : 'Release range holds?'}
          message={
            action === 'PLACE'
              ? `Place a ${holdType ? HOLD_LABELS[holdType].name : ''} hold on Aisle ${aisle}, Bin ${startBin} through Bin ${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''}${hasLevelRange ? `, Levels ${startLevel}–${endLevel}` : ''} — ${preview.total} locations in range.`
              : `Release holds on Aisle ${aisle}, Bin ${startBin} through Bin ${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''}${hasLevelRange ? `, Levels ${startLevel}–${endLevel}` : ''} — ${preview.total} locations in range.`
          }
          confirmLabel={submitting ? 'Working…' : 'Confirm'}
          variant={action === 'RELEASE' ? 'primary' : 'danger'}
          onConfirm={() => void submit()}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  );
}

interface HoldLogEntry { id: number; time: string; summary: string }

/**
 * Right-side session log of every hold action taken this visit to WLH, both modes
 * (v1.6.10, direct instruction). Single Location entries are one line each; Range entries
 * carry the full per-bucket breakdown (upgraded/blocked "from → to" detail) that the
 * Message Bar itself no longer shows in full — Message Bar stays a short summary, this
 * panel is where the complete picture lives. Session-only, in-memory (resets on navigating
 * away and back) — not a replacement for the Activity Log, which remains the durable
 * cross-session record.
 */
function HoldLogPanel({ entries }: { entries: HoldLogEntry[] }) {
  return (
    <div className="w-[340px] shrink-0 flex flex-col gap-3 rounded-[12px] border border-[#3A3A3A] bg-[#0D0D0D] p-4 overflow-y-auto">
      <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Hold Log</span>
      {entries.length === 0 ? (
        <p className="font-ui text-[14px] text-[#666]">No hold actions yet this session.</p>
      ) : (
        entries.map((entry) => {
          const [header, ...rest] = entry.summary.split('\n');
          return (
            <div key={entry.id} className="flex flex-col gap-1 pb-3 border-b border-[#2A2A2A] last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <span className="font-ui text-[14px] font-semibold text-white">{header}</span>
                <span className="font-ui text-[11px] text-[#666] shrink-0 mt-0.5">{entry.time}</span>
              </div>
              {rest.map((line, i) => (
                <span key={i} className="font-ui text-[13px] text-[#9A9A9A]">{line}</span>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * WLH — Warehouse Location Hold. Same three-field Aisle/Bin/Level entry pattern as LII;
 * once a location is resolved, renders the shared HoldPanel (place/replace/remove).
 * Accessible from Home, HotJump, LII's "Hold" button, or the quick-hold panels on
 * PIP/SDP/MNP (which render HoldPanel directly rather than navigating here). Also offers
 * a Range mode (issue #14, IM+ only) that places/releases a hold across a whole aisle's
 * bin range at once, via the mode toggle below. See DevNotes/Screen-Specs/WLH.md.
 */
export function WLHPage() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel: hideModeSwitchPanel } = useNumpad();
  const [searchParams] = useSearchParams();
  const role = (user?.role ?? 'WORKER') as Role;
  const canUseRangeMode = hasMinRole(role, 'IM');

  const [mode, setModeState] = useState<'single' | 'range'>('single');
  // Switching modes unmounts whichever field currently holds the numpad's active
  // registration (LocationEntryFields' Aisle field auto-focuses on mount) without ever
  // running its own cleanup — clearing it explicitly here avoids leaving the numpad open
  // and "bound" to a field that no longer exists on screen.
  const setMode = useCallback((m: 'single' | 'range') => { hideModeSwitchPanel(); setModeState(m); }, [hideModeSwitchPanel]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Session hold log (v1.6.10) — shared by both modes, so it's lifted up here rather than
  // owned by RangeHoldPanel or HoldPanel individually.
  const [logEntries, setLogEntries] = useState<HoldLogEntry[]>([]);
  const logIdRef = useRef(0);
  const addLogEntry = useCallback((summary: string) => {
    logIdRef.current += 1;
    setLogEntries((prev) => [
      { id: logIdRef.current, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), summary },
      ...prev,
    ]);
  }, []);

  /** Looks up a location (by 6- or 8-digit id) via the API and reconstructs the canonical 8-digit id from the resolved fields. */
  const resolveLocation = useCallback(async (id: string) => {
    setChecking(true);
    try {
      const data = await apiFetch<{ aisle: number; bin: number; level: number }>(`/api/locations/${id}`, token!);
      // Reconstruct the canonical 8-digit id from the resolved fields — a 6-digit lookup
      // (the demo button only knows Aisle+Bin) would otherwise leave locationId
      // level-ambiguous, and the Hold endpoints require an exact 8-digit id.
      setLocationId(
        String(data.aisle).padStart(3, '0') + String(data.bin).padStart(3, '0') + String(data.level).padStart(2, '0'),
      );
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Location not found' });
      // Deliberately does NOT clear/remount the Aisle/Bin/Level entry boxes (direct
      // instruction) — a bad scan/entry should stay visible so the worker can see and
      // correct what they typed, matching PII's v1.6.7 "field clears on failed scan" fix.
      setLocationId(null);
    } finally {
      setChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pre-population via ?id= (LII's "Hold" button, or a future quick-hold navigation).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void resolveLocation(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real location id from the API and resolves it, simulating a successful scan. */
  const demoLoad = useCallback(async () => {
    try {
      const { locationId: id } = await apiFetch<{ locationId: string }>('/api/demo/location', token!);
      void resolveLocation(id);
    } catch {
      setMessage({ type: 'error', text: 'Demo load unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a location id that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void resolveLocation('99999999'), [resolveLocation]);

  // ── Find a held / unheld location (issue #15) ───────────────────────────────

  /**
   * Picks one location at random — either currently on hold, or currently free of any
   * hold — and loads it the same way resolveLocation loads a typed/scanned one. Tapping
   * again re-rolls a new random pick; not filtered by anything currently in the entry
   * fields. Rendered through the shared footer demo-slot (see demoSlot below, WLH fix
   * item 04) rather than as its own in-content helper bar. See
   * DevNotes/DesignPrompts/Feature-4-WLH-Find-Held-Location.md.
   */
  const findLocation = useCallback(async (kind: 'held' | 'unheld') => {
    try {
      const { locationId: id } = await apiFetch<{ locationId: string }>(`/api/locations/random-${kind}`, token!);
      void resolveLocation(id);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'NOT_FOUND') {
        setMessage({
          type: 'warning',
          text: kind === 'held' ? 'No locations currently on hold.' : 'No locations currently available without a hold.',
        });
      } else {
        setMessage({ type: 'error', text: 'Lookup failed — please try again' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Footer demo-button slot content: a good load, a bad location trigger, and the
   *  Find Held/Find Available helpers (WLH fix item 04 — these previously rendered as
   *  hand-placed JSX in the main content area instead of through this shared demo-slot
   *  system every other screen's helper/demo buttons use). Hidden in Range mode (issue
   *  #14) — these all act on a single resolved locationId, which Range mode has no
   *  equivalent of; the Review/Confirm flow there is already fully manually testable. */
  const demoSlot = useMemo(() => (
    mode === 'range' ? null : (
      <>
        <button type="button" onClick={demoLoad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
          ✓ Load Location
        </button>
        <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
          ✗ Bad Location
        </button>
        <button type="button" onClick={() => void findLocation('held')} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
          Find Held Location
        </button>
        <button type="button" onClick={() => void findLocation('unheld')} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
          Find Available Location
        </button>
      </>
    )
  ), [mode, demoLoad, demoBad, findLocation]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none">
      {/* Mode toggle (issue #14) — IM+ only; Range mode is never mounted for sub-IM roles,
          matching the server-side IM+ floor enforced on every range endpoint. */}
      {canUseRangeMode && (
        <SegmentedControl
          options={[{ value: 'single' as const, label: 'Single Location' }, { value: 'range' as const, label: 'Range' }]}
          value={mode}
          onChange={setMode}
        />
      )}

      {/* Two-column layout (v1.6.10): main content on the left, session Hold Log always
          visible on the right — not gated on a scan/action having happened yet, per direct
          instruction (the log itself renders its own "No hold actions yet" empty state). */}
      <div className="flex-1 min-h-0 flex gap-6">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-5">
          {mode === 'range' ? (
            <RangeHoldPanel onLog={addLogEntry} />
          ) : (
            <>
              <LocationEntryFields onResolved={resolveLocation} />

              {/* Always visible from navigation (v1.6.10, direct instruction) — the
                  Location indicator and HoldPanel no longer wait for a resolved location;
                  HoldPanel itself renders an inert "—"/disabled-controls state until one
                  exists. `checking` only adds a "Loading…" note next to the indicator,
                  it doesn't hide the structure while a lookup is in flight. */}
              <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">Location</span>
                  {locationId ? (
                    <LiveId type="location" id={locationId} className="!text-[28px] !font-bold" />
                  ) : (
                    <span className="font-data text-[28px] font-bold text-[#666]">—</span>
                  )}
                  {checking && <span className="font-ui text-[14px] text-[#9A9A9A] animate-pulse">Loading…</span>}
                </div>
                <HoldPanel locationId={locationId} onAction={addLogEntry} />
              </div>
            </>
          )}
        </div>

        <HoldLogPanel entries={logEntries} />
      </div>
    </div>
  );
}
