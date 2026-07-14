import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface RangeResult { total: number; placed?: number; upgraded?: number; blocked?: number; released?: number }

/**
 * WLH Range mode (issue #14) — places or releases a hold across every location in a
 * single-aisle bin range, instead of one location at a time. IM+ only (enforced server-side
 * too; this component is simply never mounted for sub-IM roles — see the mode toggle in
 * WLHPage). See DevNotes/DesignPrompts/Feature-3-WLH-Range-Hold.md for the full settled
 * design, including the Place-only hold hierarchy (HI = HO < HB < HP) applied server-side.
 */
function RangeHoldPanel() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const role = (user?.role ?? 'WORKER') as Role;

  // padOnSubmit: typing "5" and hitting OK is accepted as "005", matching every other
  // fixed-width Aisle/Bin field in the app (LocationEntryFields, ELZ, SDP, STG).
  const aisleField = useNumpadField('numpad', 3, true);
  const startBinField = useNumpadField('numpad', 3, true);
  const endBinField = useNumpadField('numpad', 3, true);

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
  function handleStartBin(v: string) { if (v.trim().length === 3) { setTimeout(() => focusEndBin(), 50); } }
  function handleEndBin(v: string) { if (v.trim().length === 3) hidePanel(); }

  const aisle = aisleField.value ? parseInt(aisleField.value, 10) : NaN;
  const startBin = startBinField.value ? parseInt(startBinField.value, 10) : NaN;
  const endBin = endBinField.value ? parseInt(endBinField.value, 10) : NaN;
  const rangeValid = Number.isInteger(aisle) && Number.isInteger(startBin) && Number.isInteger(endBin) && startBin <= endBin;
  const canReview = rangeValid && (action === 'RELEASE' || (holdType != null && reasonCode !== ''));

  /** Fetches the range's matching location count and opens the confirmation modal. */
  async function review() {
    if (!canReview || submitting) return;
    try {
      const params = new URLSearchParams({ aisle: String(aisle), startBin: String(startBin), endBin: String(endBin), binSide });
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
      const body = { aisle, startBin, endBin, binSide, ...(action === 'PLACE' ? { holdType, reasonCode } : {}) };
      const result = await apiFetch<RangeResult>('/api/locations/range-hold', token!, {
        method: action === 'PLACE' ? 'PATCH' : 'DELETE',
        body: JSON.stringify(body),
      });
      playAlert('info');
      const rangeDesc = `Aisle ${aisle}, Bin ${startBin}–${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''}`;
      if (action === 'PLACE') {
        const parts = [`Placed ${holdType ? HOLD_LABELS[holdType].name : ''} on ${result.placed} locations`];
        if ((result.upgraded ?? 0) > 0) parts.push(`Upgraded ${result.upgraded} to Hold Both`);
        if ((result.blocked ?? 0) > 0) parts.push(`${result.blocked} blocked (existing higher-priority hold)`);
        setMessage({ type: 'success', text: `${parts.join(' · ')} — ${rangeDesc}` });
      } else {
        setMessage({ type: 'success', text: `Holds released on ${result.released} locations (${rangeDesc})` });
      }
      aisleField.clear();
      startBinField.clear();
      endBinField.clear();
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
    <div className="flex flex-col gap-4 max-w-[720px]">
      <div className="flex gap-3">
        <RangeNumBox label="Aisle" field={aisleField} onFocus={focusAisle} />
        <RangeNumBox label="Start Bin" field={startBinField} onFocus={focusStartBin} />
        <RangeNumBox label="End Bin" field={endBinField} onFocus={focusEndBin} />
      </div>

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
            <div className="flex flex-col gap-2">
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
              ? `Place a ${holdType ? HOLD_LABELS[holdType].name : ''} hold on Aisle ${aisle}, Bin ${startBin} through Bin ${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''} — ${preview.total} locations in range.`
              : `Release holds on Aisle ${aisle}, Bin ${startBin} through Bin ${endBin}${binSide !== 'ALL' ? ` (${binSide === 'ODD' ? 'Odd' : 'Even'} bins only)` : ''} — ${preview.total} locations in range.`
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
  const [entryKey, setEntryKey] = useState(0);

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
      setLocationId(null);
      setEntryKey((k) => k + 1);
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

  // ── Helper bar: find a held / unheld location (issue #15) ──────────────────

  /**
   * Picks one location at random — either currently on hold, or currently free of any
   * hold — and loads it the same way resolveLocation loads a typed/scanned one. Tapping
   * again re-rolls a new random pick; not filtered by anything currently in the entry
   * fields. See DevNotes/DesignPrompts/Feature-4-WLH-Find-Held-Location.md.
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

  /** Footer demo-button slot content: a good load and a bad location trigger. Hidden in
   *  Range mode (issue #14) — these act on a single resolved locationId, which Range mode
   *  has no equivalent of; the Review/Confirm flow there is already fully manually testable. */
  const demoSlot = useMemo(() => (
    mode === 'range' ? null : (
      <>
        <button type="button" onClick={demoLoad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
          ✓ Load Location
        </button>
        <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
          ✗ Bad Location
        </button>
      </>
    )
  ), [mode, demoLoad, demoBad]);

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

      {mode === 'range' ? (
        <RangeHoldPanel />
      ) : (
        <>
          <LocationEntryFields key={entryKey} onResolved={resolveLocation} />

          {/* Helper bar (issue #15) — quick-find a held or unheld location without typing one in blind. */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void findLocation('held')}
              className="h-[44px] px-5 rounded-[10px] font-ui text-[15px] font-medium border border-[#3A3A3A] text-white hover:border-[#555] transition-colors"
            >
              Find Held Location
            </button>
            <button
              type="button"
              onClick={() => void findLocation('unheld')}
              className="h-[44px] px-5 rounded-[10px] font-ui text-[15px] font-medium border border-[#3A3A3A] text-white hover:border-[#555] transition-colors"
            >
              Find Available Location
            </button>
          </div>

          {checking && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

          {locationId && !checking && (
            <div className="flex-1 flex flex-col overflow-y-auto max-w-[720px] gap-4">
              <div className="flex items-center gap-3">
                <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">Location</span>
                <LiveId type="location" id={locationId} className="!text-[28px] !font-bold" />
              </div>
              <HoldPanel locationId={locationId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
