import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataRow } from '../components/shared/DataRow';
import { DemoPicker } from '../components/shared/DemoPicker';
import { type DpciValue } from '../components/shared/DpciField';
import { ReasonCodeField } from '../components/shared/ReasonCodeField';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LiveId } from '../components/ui/LiveId';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { usePII, type PIIPalletData, type UserStamp } from '../context/PIIContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { EDIT_REASON_CODES } from '../lib/editReasonCodes';
import { fmtDpci } from '../lib/fmt';
import { INVALID_WASH } from '../lib/invalidWash';
import { useNumpadField } from '../lib/useNumpadField';
import type { PalletStatus } from '@shared/index';

/** Every `PalletStatus` value (see `shared/index.ts`), with a human-readable label, for
 *  PII's "Find by Status" demo picker (v1.7.0, direct instruction). */
const STATUS_PICKER_OPTIONS: { key: PalletStatus; label: string }[] = [
  { key: 'PUT_PENDING', label: 'Put Pending' },
  { key: 'STORED', label: 'Stored' },
  { key: 'CA_PULL_PEND', label: 'CA Pull Pending' },
  { key: 'FP_PULL_PEND', label: 'FP Pull Pending' },
  { key: 'PULLED', label: 'Pulled' },
  { key: 'CANCELED', label: 'Canceled' },
  { key: 'CONSOLIDATED', label: 'Consolidated' },
];

/** Formats a location object as its canonical 8-digit id (Aisle+Bin+Level). */
function location8(loc: { aisle: number; bin: number; level: number }): string {
  return String(loc.aisle).padStart(3, '0') + String(loc.bin).padStart(3, '0') + String(loc.level).padStart(2, '0');
}

/** Formats a "who/when" audit stamp for display, showing the zNumber (issue #7 — not the name), or an em dash if the pallet hasn't reached that stage yet. */
function fmtUser(u: UserStamp | null, at: string | null): string {
  if (!u || !at) return '—';
  return `${u.zNumber} — ${new Date(at).toLocaleString()}`;
}

/** Formats a date-only value (`expirationDate`) for display, or an em dash if unset. */
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

/** Converts an ISO datetime/date string to the `YYYY-MM-DD` shape `<input type="date">` needs. */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Client-side mirror of `PATCH /api/pallets/:id`'s own VCP/SSP checks — direct instruction:
 * flag a warning immediately on defocus without blocking further editing (the server
 * re-validates authoritatively at Save time regardless, via the exact same rule). Returns
 * the warning text, or null if the given values are fine (or not yet resolvable, e.g. SSP
 * not entered yet — never warns on an incomplete field).
 */
function vcpSspWarning(vcpStr: string, sspStr: string, sspsStr: string): string | null {
  const vcp = parseInt(vcpStr, 10);
  const ssp = parseInt(sspStr, 10);
  if (isNaN(vcp) || isNaN(ssp) || ssp <= 0) return null;
  if (vcp % ssp !== 0) return 'SSP must divide evenly into VCP';
  const ssps = parseInt(sspsStr, 10);
  if (!isNaN(ssps) && ssps >= vcp / ssp) return 'SSPs on Pallet must be less than a full carton (VCP ÷ SSP)';
  return null;
}

/**
 * Wires a numpad field to an Edit-mode string state slot — syncs the field's displayed
 * value from `value` (e.g. when entering Edit mode, or a sibling field's change indirectly
 * affects it), and commits back into state (trimmed) via `setValue` on confirm, dismissing
 * the numpad panel. `onCommit` (if given) fires with the freshly-committed value straight
 * after — used by VCP/SSP/SSPs-on-Pallet to run `vcpSspWarning` immediately on defocus.
 * Shared by every numpad-driven box in PII's Edit mode (DPCI/VCP/SSP/Cartons/SSPs/Pallets),
 * per direct instruction that all of them should open the numpad rather than a native input.
 */
function useEditField(
  value: string,
  setValue: (v: string) => void,
  opts?: { maxLength?: number; padOnSubmit?: boolean; onCommit?: (v: string) => void },
) {
  const { hidePanel } = useNumpad();
  const field = useNumpadField('numpad', opts?.maxLength, opts?.padOnSubmit);
  useEffect(() => { field.set(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Not memoized — always closes over the current render's `value`/`setValue`/`onCommit`,
   *  which matters here since `onCommit` needs fresh sibling-field values (see vcpEdit/
   *  sspEdit/sspsEdit below); a fresh function identity per render is harmless for a plain
   *  onClick handler like this. */
  function focus() {
    field.focus((v) => {
      const trimmed = v.trim();
      setValue(trimmed);
      hidePanel();
      opts?.onCommit?.(trimmed);
    });
  }

  return { field, focus };
}

/** A numpad-driven Edit-mode entry box — tap to open the numpad, active state gets the red
 *  border/caret treatment matching every other numpad field in this app. `invalid` applies
 *  the app-wide red-wash treatment (v1.7.0) — invalid wins over active, same precedence as
 *  every other washed field. */
function EditBox({ value, active, onFocus, width = 'w-[140px]', invalid = false }: { value: string; active: boolean; onFocus: () => void; width?: string; invalid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`flex items-center justify-center h-[44px] ${width} px-3 rounded-[8px] border-2 transition-colors ${
        invalid ? INVALID_WASH : active ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
      }`}
    >
      <span className="font-data text-[20px] text-white">{value || <span className="text-[#444]">—</span>}</span>
      {active && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
    </button>
  );
}

/** The pre-edit value shown to the right of an Edit-mode box, per direct instruction. */
function CurrentValue({ children }: { children: React.ReactNode }) {
  return <span className="font-ui text-[13px] text-[#9A9A9A] whitespace-nowrap">Current: {children}</span>;
}

type ScreenState = 'ready' | 'loaded' | 'edit';

/**
 * PII — Pallet ID Info. Read-only pallet lookup for all roles; IM+ can enter Edit mode
 * (explicit keypress required — role alone doesn't unlock it) to correct DPCI/VCP/SSP/
 * quantity fields. Accessible via Home, HotJump, or tapping any `<LiveId type="pallet">`
 * (which routes here via `?id=`). See DevNotes/Screen-Specs/PII.md.
 */
export function PIIPage() {
  const { token, user } = useAuth();
  const { setMessage, clearMessage } = useMessageBar();
  const { hidePanel } = useNumpad();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  // PII#05: the loaded pallet lives in PIIProvider (mounted above the route tree, see
  // App.tsx), not local state, so it survives navigating away and back. screenState starts
  // at 'loaded' rather than 'ready' when a pallet is already there from a previous visit —
  // any unsaved Edit Mode changes are never persisted here, so it never restores into 'edit'.
  const { pallet, setPallet } = usePII();
  const [screenState, setScreenState] = useState<ScreenState>(() => (pallet ? 'loaded' : 'ready'));
  const [loading, setLoading] = useState(false);
  // Red-wash invalid state (App-Wide item 9, v1.7.0) — Pallet ID stays visible as-typed on a
  // not-found error (issue PII#01), so it's a genuine individual-wash candidate like PAR's
  // UPC/ISI's UPC.
  const [palletInvalid, setPalletInvalid] = useState(false);

  const palletField = useNumpadField();
  // Seeds the Pallet ID field's displayed value from a persisted pallet on mount (a fresh
  // page load never ran the focus-and-type flow that would normally populate it).
  useEffect(() => {
    if (pallet) palletField.set(String(pallet.pid));
    // Only on mount — this field's value afterward is owned by loadPallet/user typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edit-mode field values, seeded from the loaded pallet on entering edit mode.
  // DPCI is three separate fields (issue #21).
  const [editDpci, setEditDpci] = useState<DpciValue>({ dept: '', class: '', item: '' });
  const [editVcp, setEditVcp] = useState('');
  const [editSsp, setEditSsp] = useState('');
  const [editCartons, setEditCartons] = useState('');
  const [editSSPs, setEditSSPs] = useState('');
  const [editPallets, setEditPallets] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [saving, setSaving] = useState(false);
  // Red-wash invalid state (App-Wide item 9, v1.7.0) — VCP/SSP is a cross-validated pair,
  // same group-wash treatment as PAR's own VCP/SSP (a rule that needs both values at once,
  // not attributable to either field alone).
  const [vcpSspInvalid, setVcpSspInvalid] = useState(false);

  /** Runs `vcpSspWarning` against whatever the three fields currently hold and, if it finds
   *  a problem, warns immediately (non-blocking — Save's own server-side check is still the
   *  one that actually blocks, per direct instruction) and washes VCP/SSP red. */
  const checkVcpSspWarning = useCallback((vcp: string, ssp: string, ssps: string) => {
    const warning = vcpSspWarning(vcp, ssp, ssps);
    setVcpSspInvalid(!!warning);
    if (warning) {
      playAlert('warning');
      setMessage({ type: 'warning', text: warning });
    }
  }, [setMessage]);

  // Every Edit-mode box is numpad-driven, including Expiration Date (v1.7.0 — rebuilt as
  // the same Month/Day/Year chain PAR uses, replacing the native `<input type="date">` this
  // screen used before). VCP/SSP/SSPs on Pallet each re-check the trio on their own commit,
  // using the other two's current state — whichever one the worker just defocused is
  // always included via its own fresh value.
  const deptEdit = useEditField(editDpci.dept, (v) => setEditDpci((p) => ({ ...p, dept: v })), { maxLength: 3, padOnSubmit: true });
  const classEdit = useEditField(editDpci.class, (v) => setEditDpci((p) => ({ ...p, class: v })), { maxLength: 2, padOnSubmit: true });
  const itemEdit = useEditField(editDpci.item, (v) => setEditDpci((p) => ({ ...p, item: v })), { maxLength: 4, padOnSubmit: true });
  const vcpEdit = useEditField(editVcp, setEditVcp, { onCommit: (v) => checkVcpSspWarning(v, editSsp, editSSPs) });
  const sspEdit = useEditField(editSsp, setEditSsp, { onCommit: (v) => checkVcpSspWarning(editVcp, v, editSSPs) });
  const cartonsEdit = useEditField(editCartons, setEditCartons);
  const sspsEdit = useEditField(editSSPs, setEditSSPs, { onCommit: (v) => checkVcpSspWarning(editVcp, editSsp, v) });
  const palletsEdit = useEditField(editPallets, setEditPallets);
  // Set when the server rejects a save with EXPIRATION_NEEDS_CONFIRM (the date is 1-3
  // months out) — showing the confirm popup below; confirming re-submits the exact same
  // body with confirmNearExpiration added.
  const [expirationConfirmPending, setExpirationConfirmPending] = useState(false);

  // Expiration Date — numpad-driven Month/Day/Year chain (v1.7.0, matching PAR's exact
  // format — direct instruction). Month/Day use padOnSubmit (typing "5" and confirming
  // becomes "05"); Year has no padOnSubmit, same reasoning as PAR's own chain (a partial
  // year has no sensible padded meaning). Only the entry-format-level checks (Month 1-12,
  // Day exists in the entered month) are mirrored here — PAR's additional whole-date
  // "too soon" group wash is a business-rule check, not a format one, and PII already
  // surfaces that separately via the server's EXPIRATION_NEEDS_CONFIRM confirm popup below.
  const monthField = useNumpadField('numpad', 2, true);
  const dayField = useNumpadField('numpad', 2, true);
  const yearField = useNumpadField('numpad', 4);
  const [monthInvalid, setMonthInvalid] = useState(false);
  const [dayInvalid, setDayInvalid] = useState(false);

  /** Days in a given month, 1-indexed — see PARPage.tsx's identical helper for the leap-year reasoning. */
  function daysInMonth(month: number, year?: number): number {
    if (month === 2) {
      if (year == null) return 29;
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return isLeap ? 29 : 28;
    }
    const table = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[month - 1] ?? 31;
  }

  function focusMonthField() { monthField.focus(handleMonthConfirm); }
  function focusDayField() { dayField.focus(handleDayConfirm); }
  function focusYearField() { yearField.focus(handleYearConfirm); }

  /** Month field submit: validates the 1-12 range and advances to Day, same as PAR's chain. */
  function handleMonthConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    const n = parseInt(v, 10);
    setMonthInvalid(n < 1 || n > 12);
    setTimeout(() => focusDayField(), 50);
  }
  /** Day field submit: validates the day exists in the entered month, skipped if Month is
   *  already out of range. Advances to Year regardless, same as PAR's chain. */
  function handleDayConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    const monthNum = parseInt(monthField.value, 10);
    const dayNum = parseInt(v, 10);
    const monthOk = monthNum >= 1 && monthNum <= 12;
    setDayInvalid(monthOk && (dayNum < 1 || dayNum > daysInMonth(monthNum)));
    setTimeout(() => focusYearField(), 50);
  }
  /** Year field submit: once exactly 4 digits are entered, re-checks Day against the real
   *  year (leap-year precision), composes Month+Day+Year into the ISO value this screen's
   *  own Save already expects, and hides the panel (chain's terminal step). */
  function handleYearConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 4) return;
    hidePanel();
    const monthNum = parseInt(monthField.value, 10);
    const dayNum = parseInt(dayField.value, 10);
    const yearNum = parseInt(v, 10);
    const monthOk = monthNum >= 1 && monthNum <= 12;
    const dayOk = monthOk && dayNum >= 1 && dayNum <= daysInMonth(monthNum, yearNum);
    setDayInvalid(monthOk && !dayOk);
    setEditExpirationDate(`${v}-${monthField.value}-${dayField.value}`);
  }

  /** Looks up a pallet by id via the API and transitions to the loaded state; resets to ready on failure. */
  const loadPallet = useCallback(async (idStr: string) => {
    hidePanel();
    clearMessage();
    const pid = parseInt(idStr, 10);
    if (isNaN(pid)) {
      playAlert('error');
      setMessage({ type: 'error', text: 'Pallet not found' });
      // Field intentionally left as-typed (issue PII#01) — the worker should be able to
      // see and correct what they actually entered, not have it silently wiped.
      setPalletInvalid(true);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<PIIPalletData>(`/api/pallets/${pid}`, token!);
      setPallet(data);
      setScreenState('loaded');
      palletField.set(String(pid));
      setPalletInvalid(false);
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'Pallet not found' });
      // Same as above — left as-typed rather than cleared (issue PII#01).
      setPallet(null);
      setScreenState('ready');
      setPalletInvalid(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidePanel, clearMessage]);

  /** Registers the Pallet ID field's numpad handler; a scan while editing discards unsaved changes and re-loads. */
  const focusPalletField = useCallback(() => {
    palletField.focus((v) => {
      const trimmed = v.trim();
      if (!trimmed) return;
      if (screenState === 'edit') {
        // A new scan while editing discards unsaved changes without a confirmation
        // prompt — this is a demo-scope simplification of PII.md's confirm-before-discard.
        setScreenState('loaded');
      }
      void loadPallet(trimmed);
    });
  }, [palletField, screenState, loadPallet]);

  useEffect(() => {
    // React re-runs this effect whenever the dependency's value changes in *either*
    // direction — including the very first successful scan, which flips it true→false
    // (ready→loaded). Without this guard that transition re-scheduled a focus call too,
    // reopening the numpad right after `loadPallet`'s own `hidePanel()` had just closed it
    // (issue #55 — only ever visible on the first scan of a session, since every load
    // after that starts from 'loaded' already, so the dependency stays false→false and
    // the effect doesn't re-run at all).
    if (screenState !== 'ready') return;
    const id = setTimeout(() => focusPalletField(), 50);
    return () => clearTimeout(id);
    // Only re-run when returning to the ready state — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenState === 'ready']);

  // Pre-population via ?id= (LiveId taps navigate to /pallet?id=<pid>).
  const idParam = searchParams.get('id');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount effect (URL ?id= pre-population)
    if (idParam) void loadPallet(idParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam]);

  /** Seeds the edit-mode fields from the currently loaded pallet and switches to the edit state. */
  function enterEditMode() {
    if (!pallet) return;
    setEditDpci({
      dept: String(pallet.dpci.dept).padStart(3, '0'),
      class: String(pallet.dpci.class).padStart(2, '0'),
      item: String(pallet.dpci.item).padStart(4, '0'),
    });
    setEditVcp(String(pallet.vcp));
    setEditSsp(String(pallet.ssp));
    setEditCartons(String(pallet.currentCartons));
    setEditSSPs(String(pallet.currentSSPs));
    setEditPallets(String(pallet.currentPallets));
    setEditExpirationDate(toDateInputValue(pallet.expirationDate));
    const [y, m, d] = toDateInputValue(pallet.expirationDate).split('-');
    monthField.set(m ?? '');
    dayField.set(d ?? '');
    yearField.set(y ?? '');
    setMonthInvalid(false);
    setDayInvalid(false);
    setReasonCode('');
    setExpirationConfirmPending(false);
    setVcpSspInvalid(false);
    setScreenState('edit');
  }

  /** Discards edit-mode changes and returns to the loaded (read-only) state. */
  function cancelEdit() {
    setScreenState('loaded');
  }

  /** Submits only the edit-mode fields that actually changed via PATCH /api/pallets/:pid, then re-loads the pallet. */
  /**
   * The PATCH body fields that actually differ from the loaded pallet — parsed/semantic
   * comparison (e.g. VCP typed as "012" counts as unchanged if it was already 12), not a
   * raw string comparison. Recomputed as the worker edits; also drives the Save button's
   * disabled state (issue #66 — Save used to go through with an empty body, silently
   * "succeeding" without changing anything, as long as a reason code happened to be picked).
   */
  const changedFields = useMemo(() => {
    if (!pallet) return {};
    const body: Record<string, unknown> = {};

    const dept = parseInt(editDpci.dept, 10);
    const cls = parseInt(editDpci.class, 10);
    const itm = parseInt(editDpci.item, 10);
    if (!isNaN(dept) && !isNaN(cls) && !isNaN(itm) &&
        (dept !== pallet.dpci.dept || cls !== pallet.dpci.class || itm !== pallet.dpci.item)) {
      body.dpci = { dept, class: cls, item: itm };
    }
    const vcp = parseInt(editVcp, 10);
    if (!isNaN(vcp) && vcp !== pallet.vcp) body.vcp = vcp;
    const ssp = parseInt(editSsp, 10);
    if (!isNaN(ssp) && ssp !== pallet.ssp) body.ssp = ssp;
    const cartons = parseInt(editCartons, 10);
    if (!isNaN(cartons) && cartons !== pallet.currentCartons) body.currentCartons = cartons;
    const ssps = parseInt(editSSPs, 10);
    if (!isNaN(ssps) && ssps !== pallet.currentSSPs) body.currentSSPs = ssps;
    const pallets = parseInt(editPallets, 10);
    if (!isNaN(pallets) && pallets !== pallet.currentPallets) body.currentPallets = pallets;
    if (editExpirationDate !== toDateInputValue(pallet.expirationDate)) {
      body.expirationDate = editExpirationDate || null;
    }

    return body;
  }, [pallet, editDpci, editVcp, editSsp, editCartons, editSSPs, editPallets, editExpirationDate]);

  const hasChanges = Object.keys(changedFields).length > 0;

  /** Submits the edit body via PATCH; `confirmNearExpiration` is only set on the resend after the worker accepts the within-3-months warning. */
  async function submitEdit(confirmNearExpiration?: boolean) {
    if (!pallet) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...changedFields, reasonCode };
      if (confirmNearExpiration) body.confirmNearExpiration = true;

      await apiFetch(`/api/pallets/${pallet.pid}`, token!, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      playAlert('info');
      setMessage({ type: 'success', text: `Pallet ${pallet.pid} updated` });
      setExpirationConfirmPending(false);
      setScreenState('loaded');
      await loadPallet(String(pallet.pid));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'EXPIRATION_NEEDS_CONFIRM') {
        // Not a failure — surfaces the confirm popup below instead of an error message.
        setExpirationConfirmPending(true);
        return;
      }
      playAlert('error');
      const text = code === 'EXPIRATION_TOO_SOON'
        ? 'Expiration Date must be at least 1 month out'
        : code === 'INVALID_VCP_SSP_RATIO'
        ? 'SSP must divide evenly into VCP'
        : code === 'SSPS_EXCEED_CARTON'
        ? 'SSPs on Pallet must be less than a full carton (VCP ÷ SSP)'
        : `Update failed — ${code || 'please try again'}`;
      setMessage({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  }

  function saveEdit() {
    if (!pallet || saving || !hasChanges) return;
    if (!reasonCode) {
      setMessage({ type: 'error', text: 'A reason code is required to save changes' });
      return;
    }
    void submitEdit();
  }

  /** Worker accepted the "expiration within 3 months" warning — resend with the confirm flag. */
  function confirmNearExpirationAndSave() {
    void submitEdit(true);
  }

  /** Navigates to LII for the pallet's current location. */
  function goToLocation() {
    if (!pallet?.location) return;
    navigate(`/location?id=${location8(pallet.location)}`);
  }

  // ── Demo buttons ────────────────────────────────────────────────────────────

  /** Fetches a random real pallet id from the API and loads it, simulating a successful scan. */
  const demoScan = useCallback(async () => {
    try {
      const { palletId } = await apiFetch<{ palletId: number }>('/api/demo/pallet', token!);
      void loadPallet(String(palletId));
    } catch {
      setMessage({ type: 'error', text: 'Demo scan unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Looks up a pallet id that doesn't exist, simulating a not-found scan. */
  const demoBad = useCallback(() => void loadPallet('999999999'), [loadPallet]);

  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  /** Dispatches the shared DemoPicker's choice — fetches a random pallet with the chosen
   *  literal `status` value (v1.7.0, direct instruction: "a helper button that finds pallet
   *  ID on PII by status, with each of those statuses"). */
  const pickStatus = useCallback(async (status: PalletStatus) => {
    setStatusPickerOpen(false);
    try {
      const { palletId } = await apiFetch<{ palletId: number }>(`/api/demo/pallet-status?status=${status}`, token!);
      void loadPallet(String(palletId));
    } catch (err) {
      setMessage({ type: 'error', text: `Demo pallet: ${err instanceof Error ? err.message : 'unavailable'}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadPallet]);

  /** Footer demo-button slot content: a good scan, the status picker, and a bad scan trigger. */
  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={demoScan} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors">
        ✓ Scan PID
      </button>
      <button type="button" onClick={() => setStatusPickerOpen(true)} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
        Find by Status
      </button>
      <button type="button" onClick={demoBad} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors">
        ✗ Bad PID
      </button>
    </>
  ), [demoScan, demoBad]);

  useDemoSlot(demoSlot);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-4 select-none">
      <div className="w-[260px]">
        <span className="font-ui text-[14px] font-medium text-[#9A9A9A] uppercase tracking-wider">Pallet ID</span>
        <button
          type="button"
          onClick={focusPalletField}
          className={`flex items-center h-[64px] w-full px-5 mt-1 rounded-[12px] border-2 transition-colors ${
            palletInvalid ? INVALID_WASH : palletField.isActive ? 'border-[#CC0000] bg-[#0D0D0D]' : 'border-[#3A3A3A] bg-[#0D0D0D] hover:border-[#555]'
          }`}
        >
          <span className="font-data text-[26px] font-medium text-white">
            {palletField.value || <span className="text-[#444]">—</span>}
          </span>
          {palletField.isActive && <span className="inline-block w-[2px] h-[28px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
        </button>
      </div>

      {loading && <p className="font-ui text-[16px] text-[#9A9A9A] animate-pulse">Loading…</p>}

      {pallet && screenState !== 'ready' && (
        <div className={`flex-1 flex flex-col overflow-y-auto ${screenState === 'edit' ? 'max-w-[720px]' : 'max-w-[1100px]'}`}>
          <DataRow label="Pallet ID"><LiveId type="pallet" id={String(pallet.pid)} /></DataRow>

          {screenState === 'edit' ? (
            <>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">DPCI</span>
                <div className="flex items-center gap-2">
                  <EditBox value={deptEdit.field.value} active={deptEdit.field.isActive} onFocus={deptEdit.focus} width="w-[76px]" />
                  <span className="text-[#555]">-</span>
                  <EditBox value={classEdit.field.value} active={classEdit.field.isActive} onFocus={classEdit.focus} width="w-[64px]" />
                  <span className="text-[#555]">-</span>
                  <EditBox value={itemEdit.field.value} active={itemEdit.field.isActive} onFocus={itemEdit.focus} width="w-[92px]" />
                </div>
                <CurrentValue>{fmtDpci(pallet.dpci)}</CurrentValue>
              </div>
              <DataRow label="Description">{pallet.descShort}</DataRow>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">VCP / SSP</span>
                <div className={`flex items-center gap-3 rounded-[10px] ${vcpSspInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
                  <EditBox value={vcpEdit.field.value} active={vcpEdit.field.isActive} onFocus={vcpEdit.focus} width="w-[90px]" />
                  <span className="text-[#555]">/</span>
                  <EditBox value={sspEdit.field.value} active={sspEdit.field.isActive} onFocus={sspEdit.focus} width="w-[90px]" />
                </div>
                <CurrentValue>{pallet.vcp}/{pallet.ssp}</CurrentValue>
              </div>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Total Cartons</span>
                <EditBox value={cartonsEdit.field.value} active={cartonsEdit.field.isActive} onFocus={cartonsEdit.focus} />
                <CurrentValue>{pallet.currentCartons}</CurrentValue>
              </div>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">SSPs on Pallet</span>
                <EditBox value={sspsEdit.field.value} active={sspsEdit.field.isActive} onFocus={sspsEdit.focus} />
                <CurrentValue>{pallet.currentSSPs}</CurrentValue>
              </div>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">Full Pallets</span>
                <EditBox value={palletsEdit.field.value} active={palletsEdit.field.isActive} onFocus={palletsEdit.focus} />
                <CurrentValue>{pallet.currentPallets}</CurrentValue>
              </div>
              <div className="flex items-center gap-3 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider">
                  Expiration Date
                  {pallet.requiresExpirationDate && !editExpirationDate && (
                    <span className="ml-2 font-ui text-[11px] font-semibold text-[#FF6666] normal-case tracking-normal">Required for this item</span>
                  )}
                </span>
                {/* Month/Day/Year numpad chain (v1.7.0), matching PAR's exact format. */}
                <div className="flex items-center gap-2">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Month</span>
                  <EditBox value={monthField.value} active={monthField.isActive} onFocus={focusMonthField} width="w-[64px]" invalid={monthInvalid} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Day</span>
                  <EditBox value={dayField.value} active={dayField.isActive} onFocus={focusDayField} width="w-[64px]" invalid={dayInvalid} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Year</span>
                  <EditBox value={yearField.value} active={yearField.isActive} onFocus={focusYearField} width="w-[84px]" />
                </div>
                <CurrentValue>{fmtDate(pallet.expirationDate)}</CurrentValue>
              </div>
              <div className="flex items-start gap-2 py-2 border-b border-[#1A1A1A]">
                <span className="w-[180px] shrink-0 font-ui text-[15px] font-medium text-[#9A9A9A] uppercase tracking-wider pt-3">Reason Code</span>
                <div className="w-[280px]">
                  <ReasonCodeField codes={EDIT_REASON_CODES} value={reasonCode} onChange={setReasonCode} label="" size="compact" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-8">
              <div className="flex-1 flex flex-col">
                <DataRow label="DPCI"><LiveId type="dpci" id={fmtDpci(pallet.dpci)} /></DataRow>
                <DataRow label="Description">{pallet.descShort}</DataRow>
                <DataRow label="UPC"><LiveId type="upc" id={pallet.upc} /></DataRow>
                <DataRow label="VCP / SSP">
                  {pallet.vcp} / {pallet.ssp}
                  <span className="ml-3 font-ui text-[13px] text-[#9A9A9A]">
                    {pallet.vcp / pallet.ssp} SSPs per Carton
                  </span>
                </DataRow>
                <DataRow label="Total Cartons">{pallet.currentCartons}</DataRow>
                <DataRow label="SSPs on Pallet">{pallet.currentSSPs}</DataRow>
                <DataRow label="Full Pallets">{pallet.currentPallets}</DataRow>
                <DataRow label="PO Number">{pallet.poNumber ?? '—'}</DataRow>
                <DataRow label="Appointment Number">{pallet.apptNumber ?? '—'}</DataRow>
                <DataRow label="Expiration Date">
                  {fmtDate(pallet.expirationDate)}
                  {pallet.requiresExpirationDate && !pallet.expirationDate && (
                    <span className="ml-2 font-ui text-[12px] font-semibold text-[#FF6666]">Required for this item</span>
                  )}
                </DataRow>
              </div>
              <div className="flex-1 flex flex-col">
                <DataRow label="Status"><StatusBadge status={pallet.status} /></DataRow>
                <DataRow label="Current Location">
                  {pallet.location ? <LiveId type="location" id={location8(pallet.location)} /> : '—'}
                </DataRow>
                <DataRow label="Received By">{fmtUser(pallet.receivedBy, pallet.receivedAt)}</DataRow>
                <DataRow label="Put By">{fmtUser(pallet.putBy, pallet.putAt)}</DataRow>
                <DataRow label="Last Pulled By">{fmtUser(pallet.lastPulledBy, pallet.lastPulledAt)}</DataRow>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            {screenState === 'edit' ? (
              <>
                <button type="button" onClick={cancelEdit} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-medium border border-[#3A3A3A] text-white">
                  Cancel
                </button>
                <button type="button" onClick={saveEdit} disabled={saving || !hasChanges} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40">
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={goToLocation}
                  disabled={!pallet.location}
                  className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold bg-[#003366] hover:bg-[#004488] text-white disabled:opacity-40 transition-colors"
                >
                  Go to Location ID
                </button>
                {isIM && (
                  <button type="button" onClick={enterEditMode} className="h-[56px] px-6 rounded-[12px] font-ui text-[16px] font-semibold border border-[#3A3A3A] text-white hover:border-[#555] transition-colors">
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Expiration Date within 3 months — direct-instruction confirm step, not an error.
       *  No full backdrop, positioned in the screen's upper half — same reasoning as STG's
       *  RejectHoldDialog: nothing here needs the on-screen keyboard, but keeping clear of
       *  the bottom-right numpad/keyboard corner is this app's general modal convention. */}
      {expirationConfirmPending && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          <div className="absolute left-1/2 -translate-x-1/2 top-8 w-[480px] bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 flex flex-col gap-4 shadow-[0_0_60px_20px_rgba(0,0,0,0.6)] pointer-events-auto">
            <h3 className="font-ui text-[19px] font-semibold text-white">Expiration date is coming up soon</h3>
            <p className="font-ui text-[14px] text-[#9A9A9A]">
              This date is within 3 months. Continue saving it anyway?
            </p>
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() => setExpirationConfirmPending(false)}
                className="flex-1 h-[52px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmNearExpirationAndSave}
                disabled={saving}
                className="flex-1 h-[52px] rounded-[10px] font-ui text-[15px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {statusPickerOpen && (
        <DemoPicker
          title="Find a pallet with which status?"
          options={STATUS_PICKER_OPTIONS}
          onPick={pickStatus}
          onCancel={() => setStatusPickerOpen(false)}
        />
      )}
    </div>
  );
}
