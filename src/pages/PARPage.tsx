import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DemoPicker } from '../components/shared/DemoPicker';
import { HOLD_LABELS, type HoldCategory } from '../components/shared/HoldPanel';
import { LocationEntryFields } from '../components/shared/LocationEntryFields';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useDemoSlot } from '../context/FooterDemoContext';
import { useMessageBar } from '../context/MessageBarContext';
import { useNumpad } from '../context/NumpadContext';
import { apiFetch } from '../lib/api';
import { playAlert } from '../lib/audio';
import { fmtLocation } from '../lib/fmt';
import { INVALID_WASH } from '../lib/invalidWash';
import { useNumpadField } from '../lib/useNumpadField';

/** Splits a formatted "078-01-0004" DPCI string into its 3 parts, for `.set()`-ing the
 *  Dept/Class/Item numpad fields directly (demo fills, ?dpci= pre-population). PAR uses
 *  its own numpad-driven Dept/Class/Item chain (v1.6.11, direct instruction — this whole
 *  screen stays numpad-driven, unlike the shared `DpciField`'s plain-native-input design
 *  built for infrequent admin edits) rather than the shared `DpciField` component. */
function splitDpciString(s: string): { dept: string; class: string; item: string } {
  const [dept, cls, item] = s.split('-');
  return { dept: dept ?? '', class: cls ?? '', item: item ?? '' };
}

type Mode = 'single' | 'multiple';

interface ItemLookup { dpci: string; descShort: string; requiresExpirationDate: boolean }
interface ReinstateRowResult { palletId: number; cartons: number; ssps: number; cartonsPerPallet: number; status: 'PUT_PENDING' | 'STORED'; locationId: string | null }
interface ReinstateResult { pallets: ReinstateRowResult[] }
interface SampleReinstate { dpci: string; upc: string; vcp: number; ssp: number; cartons: number; ssps: number }
interface LocationStatusInfo { status: string; holdCategory: HoldCategory | null; contraction: boolean }

// INVALID_WASH (v1.6.11 invalid-field treatment) now lives in src/lib/invalidWash.ts,
// shared with LocationEntryFields.tsx — see that file's own doc comment for the full spec.
const NORMAL_BG = 'bg-[#0D0D0D] border-[#3A3A3A] hover:border-[#555]';

/** Labeled numpad-driven entry box. `invalid` applies the new red-wash treatment (v1.6.11);
 *  `active` (currently focused) still gets the plain red border alone, matching every
 *  other numpad field in the app — the wash is reserved for an actual validation failure. */
// Row height driver, shared by every entry box on this screen (FieldBox, PrinterField) so
// they all line up — shrunk 10% from the first pass (60px) per direct instruction, once
// seen on screen.
const ENTRY_BOX_HEIGHT = 'h-[54px]';

/** Labeled numpad-driven entry box. `invalid` applies the new red-wash treatment (v1.6.11);
 *  `active` (currently focused) still gets the plain red border alone, matching every
 *  other numpad field in the app — the wash is reserved for an actual validation failure. */
function FieldBox({
  label, value, onFocus, active = false, invalid = false, width = 'w-[144px]', disabled = false,
}: { label: string; value: string; onFocus: () => void; active?: boolean; invalid?: boolean; width?: string; disabled?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      {label && <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">{label}</span>}
      <button
        type="button"
        onClick={onFocus}
        disabled={disabled}
        className={`flex items-center ${ENTRY_BOX_HEIGHT} px-4 rounded-[10px] border-2 transition-colors disabled:opacity-40 ${
          invalid ? INVALID_WASH : active ? 'border-[#CC0000] bg-[#0D0D0D]' : NORMAL_BG
        }`}
      >
        <span className="font-data text-[20px] font-medium text-white">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] ml-2 animate-pulse rounded-sm" />}
      </button>
    </div>
  );
}

/** Always-visible read-only display — label never disappears, value blanks to "—". Plain
 *  text, deliberately not boxed like an entry field (direct instruction — Description,
 *  SSPs per Carton, and every Row 4 summary line read as pure information, not something
 *  tappable). Core PAR redesign principle still holds: the label is visible even while
 *  the value is blank. */
function PlainText({
  label, value, width = 'w-[220px]', compact = false,
}: { label: string; value: string; width?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col ${compact ? 'gap-0' : 'gap-1'} ${width}`}>
      <span className={`font-ui font-medium text-[#9A9A9A] uppercase tracking-wider ${compact ? 'text-[11px]' : 'text-[13px]'}`}>{label}</span>
      <span className={`flex items-center font-data font-medium text-[#CFCFCF] ${compact ? 'h-[22px] text-[14px]' : 'h-[60px] text-[20px]'}`}>
        {value || <span className="text-[#444]">—</span>}
      </span>
    </div>
  );
}

/** Preview of a future Printer selector — the box itself is real (typeable, via the
 *  on-screen Keyboard, not the Numpad, since a printer id is free text) and defaults to
 *  "PR01," but the dropdown chevron beside it stays inert (direct instruction — no real
 *  printer-picker popup exists yet, no code-list to pick from, so there's nothing for it
 *  to open). No format/existence validation on the typed value (direct instruction — "no
 *  typechecking"); this app has no printer concept anywhere else (no field on
 *  `Pallet`/`Label`, no endpoint) for a typed value to be checked against yet. Visually
 *  matches the entry-box + dropdown-helper shape used elsewhere in the app (e.g.
 *  `CodePickerField`) without wiring up any actual popup/selection logic on the dropdown
 *  half. */
function PrinterField({ value, onFocus, active }: { value: string; onFocus: () => void; active: boolean }) {
  return (
    <div className="flex flex-col gap-1 w-[144px]">
      <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Printer</span>
      <button
        type="button"
        onClick={onFocus}
        className={`flex items-center ${ENTRY_BOX_HEIGHT} rounded-[10px] border-2 overflow-hidden transition-colors ${active ? 'border-[#CC0000] bg-[#0D0D0D]' : NORMAL_BG}`}
      >
        <span className="flex-1 px-4 font-data text-[18px] font-medium text-white text-left">
          {value || <span className="text-[#444]">—</span>}
        </span>
        {active && <span className="inline-block w-[2px] h-[20px] bg-[#CC0000] animate-pulse rounded-sm" />}
        <span aria-hidden className="h-full px-3 flex items-center justify-center border-l-2 border-[#3A3A3A] text-[#666]">▾</span>
      </button>
    </div>
  );
}

/** Small vertical two-option toggle for Row 3's Single/Multiple Pallet selector — stacked
 *  rather than the app's usual horizontal SegmentedControl, per direct instruction ("a
 *  smaller selection, stacked on the left of the screen for this row"). */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: 'single', label: 'Single Pallet' },
    { value: 'multiple', label: 'Multiple Pallets' },
  ];
  return (
    <div className="flex flex-col gap-2 w-[144px] shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`h-[47px] px-4 rounded-[10px] font-ui text-[14px] font-semibold border-2 transition-colors text-left ${
            mode === opt.value ? 'border-[#CC0000] bg-[#CC0000]/10 text-white' : 'border-[#3A3A3A] text-[#9A9A9A] hover:border-[#555]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * PAR — Pallet Reinstate. IM+ only (Worker sees access denied). Creates one or more new
 * pallet records from scratch for physical inventory with no system record — v1.6.11
 * redesign (`DevNotes/DesignPrompts/Feature-7-PAR-Redesign.md`). Every entry and display
 * field is visible at all times; nothing is gated behind typing. See
 * Documentation/ScreenSpecs/PAR.md.
 */
export function PARPage() {
  const { token, user } = useAuth();
  const { setMessage } = useMessageBar();
  const { hidePanel, showNumpad } = useNumpad();
  const [searchParams] = useSearchParams();
  const isIM = ['IM', 'LEAD', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');

  // Keeps the on-screen Numpad panel visible at all times on this screen (direct
  // instruction) — every field here is numpad-driven except Printer, a free-text field
  // that calls up the Keyboard panel instead while it's focused (direct instruction: "you
  // are typing in a printer, which needs the keyboard"); Printer's own onFocus calls
  // resetToNumpad() on commit just like every numpad field does, so the screen falls back
  // to its default Numpad-visible state the moment the worker's done typing a printer id.
  // hidePanel() (called by every field's own onSubmit, per the app-wide convention of
  // closing the panel once a field resolves) closes the panel as a side effect of clearing
  // the active-field highlight — resetToNumpad clears that highlight the normal way, then
  // immediately reopens the numpad so it never actually disappears between fields.
  const resetToNumpad = useCallback(() => { hidePanel(); showNumpad(); }, [hidePanel, showNumpad]);
  useEffect(() => {
    showNumpad();
  }, [showNumpad]);

  // Screen-wide auto-advance (v1.6.11, direct instruction — DPCI/UPC → VCP → SSP →
  // Cartons → SSPs → Month→Day→Year (if the item requires an Expiration Date) or straight
  // to Location's Aisle box otherwise). `locationAutoFocus` is declared up here (rather
  // than alongside the rest of Location's own state, further down) because both branches
  // of that fork — Expiration Date's own `handleYearConfirm` and Cartons/SSPs' own
  // `handleSspsConfirm` — need to set it, and both are declared before Location's section;
  // a plain `useState` setter has no dependencies of its own, so relocating just this one
  // declaration is enough to satisfy the project's React Compiler lint integration, which
  // (unlike a plain closure at runtime) requires a value to be textually declared before
  // any code that references it, even inside a deferred callback body.
  const [locationAutoFocus, setLocationAutoFocus] = useState(false);
  // Same reasoning, for the two forward-referenced *functions* below (DPCI/UPC's resolve
  // handlers need to call VCP's own focus function; VCP/SSP's SSP handler needs to call
  // Cartons' own focus function) — unlike a bare state setter, these can't simply be
  // hoisted by relocating a single line, since each closes over its own section's field
  // hooks, which stay declared in their natural reading-order position. A ref updated
  // after every render (mirroring NumpadContext's own onActiveChangeRef pattern, via
  // useEffect rather than a direct render-body assignment — see LocationEntryFields.tsx's
  // own pre-existing "Cannot access refs during render" lint error, which that pattern
  // trips and this one is written to avoid) gives the compiler something it can verify
  // statically, in place of a plain forward reference it can't.
  const focusVcpRef = useRef(() => {});
  const focusCartonsRef = useRef(() => {});

  // ── Row 1: DPCI / UPC / Description (Expiration Date state lives here too,
  // rendered just before Location further down) ─────────────────────
  // Numpad-driven Dept/Class/Item chain (v1.6.11, direct instruction — replaces the
  // shared DpciField's plain-native-input design, which was deliberately built for
  // infrequent admin edits, not this screen's now-fully-numpad-driven kiosk flow).
  // Mirrors IID's own identical Dept→Class→Item chain shape, with one deliberate
  // deviation from IID's own value-ref pattern: `handleItemConfirm` below reads
  // `deptField.value`/`classField.value` directly (the hook's own reactive state) instead
  // of parallel `deptValueRef`/`classValueRef` refs populated only by the chain's own
  // handlers. Those refs were the suspected root cause of "hand-entering a DPCI comes back
  // invalid" (v1.6.11 bugfix, 2026-07-20) — they're never updated by any *other* path that
  // sets these fields (a demo picker's `.set()` calls, the `?dpci=` URL pre-population, a
  // UPC lookup's DPCI auto-fill), so a worker retyping just one box after any of those,
  // or tapping directly into Class/Item without going through Dept first (each box is
  // independently tappable — nothing enforces in-order entry), would silently read a
  // stale/empty ref instead of what's actually on screen. Reading `.value` directly is
  // always correct by construction — whatever's displayed is exactly what gets looked up,
  // regardless of how it got there.
  const deptField = useNumpadField('numpad', 3, true);
  const classField = useNumpadField('numpad', 2, true);
  const itemField = useNumpadField('numpad', 4, true);
  const upcField = useNumpadField('numpad');

  // Printer preview — typeable (direct instruction: "selectable and typeable but the
  // dropdown be disabled... calls the Keyboard"), unlike every other field on this screen
  // which is Numpad-driven: a printer id is free text, not a quantity/code. Defaults to
  // "PR01" (the old hardcoded display value) so the box isn't empty on load, but the
  // worker can retype it; no format/existence validation on whatever's typed (direct
  // instruction — "no typechecking"), since this app has no real printer concept yet for
  // a typed value to be checked against.
  const printerField = useNumpadField('keyboard');
  useEffect(() => {
    printerField.set('PR01');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const focusPrinterField = useCallback(
    () => printerField.focus((v) => { printerField.set(v.trim()); resetToNumpad(); }),
    [printerField, resetToNumpad],
  );

  const [item, setItem] = useState<ItemLookup | null>(null);
  const [dpciInvalid, setDpciInvalid] = useState(false);
  const [upcInvalid, setUpcInvalid] = useState(false);
  const [expirationDate, setExpirationDate] = useState(''); // ISO YYYY-MM-DD, or ''
  const [expirationInvalid, setExpirationInvalid] = useState(false);
  const [expirationConfirmPending, setExpirationConfirmPending] = useState(false);

  const dpciDigits = `${deptField.value}${classField.value}${itemField.value}`;

  /** Looks up the item by DPCI, populating Description/Expiration-required state, and
   *  clears the UPC field (v1.6.11 revised, direct instruction — "if the DPCI is entered,
   *  it should clear the UPC field," matching IID's own `loadByDpci`). Asymmetric with the
   *  reverse direction: resolving via UPC still populates the DPCI boxes (see loadByUpc),
   *  but DPCI is the anchor identifier everywhere else in the app, so entering one directly
   *  supersedes whatever was in UPC rather than leaving a now-mismatched value visible. */
  const loadByDpci = useCallback(async (digits: string) => {
    upcField.clear();
    setUpcInvalid(false);
    try {
      const data = await apiFetch<ItemLookup>(`/api/items/dpci/${digits}`, token!);
      setItem(data);
      setDpciInvalid(false);
      // Screen-wide auto-advance (v1.6.11, direct instruction): "after entering the DPCI
      // or UPC, the VCP box should focus." Via focusVcpRef, not focusVcp directly — see
      // that ref's own declaration comment (near the top of the component) for why.
      focusVcpRef.current();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'DPCI not found' });
      setItem(null);
      setDpciInvalid(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function focusDeptField() { deptField.focus(handleDeptConfirm); }
  function focusClassField() { classField.focus(handleClassConfirm); }
  function focusItemField() { itemField.focus(handleItemConfirm); }

  /** Dept field submit: advances to Class once exactly 3 digits are entered. */
  function handleDeptConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 3) return;
    setTimeout(() => focusClassField(), 50);
  }
  /** Class field submit: advances to Item once exactly 2 digits are entered. */
  function handleClassConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    setTimeout(() => focusItemField(), 50);
  }
  /** Item field submit: once exactly 4 digits are entered, resolves the full DPCI lookup
   *  directly (IID's own pattern) rather than a separate "watch for 9 complete digits"
   *  effect — the chain's own completion is the one moment that matters. Reads
   *  deptField.value/classField.value directly rather than refs — see this chain's own
   *  declaration comment above for why. */
  function handleItemConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 4) return;
    resetToNumpad();
    void loadByDpci(`${deptField.value}${classField.value}${v}`);
  }

  /** Looks up the item by UPC; on success also populates the DPCI boxes (the confirmed
   *  asymmetric behavior — UPC never gets populated back, DPCI always does). */
  const loadByUpc = useCallback(async (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    resetToNumpad();
    try {
      const data = await apiFetch<ItemLookup>(`/api/items/upc/${encodeURIComponent(trimmed)}`, token!);
      setItem(data);
      setUpcInvalid(false);
      const parsed = splitDpciString(data.dpci);
      deptField.set(parsed.dept);
      classField.set(parsed.class);
      itemField.set(parsed.item);
      setDpciInvalid(false);
      focusVcpRef.current();
    } catch {
      playAlert('error');
      setMessage({ type: 'error', text: 'UPC not found' });
      setUpcInvalid(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, resetToNumpad]);

  const focusUpcField = useCallback(() => upcField.focus(loadByUpc), [upcField, loadByUpc]);

  // ── Expiration Date — numpad-driven Month/Day/Year chain (v1.6.11 — restored as 3
  // separate boxes, matching the native date input this replaced, direct instruction:
  // "split the expiration date into day month year just like it was before, but keep the
  // keypad call"). Same Dept/Class/Item chain shape DPCI itself uses. Month/Day use
  // padOnSubmit (typing "5" and confirming becomes "05" — a real, sensible date value,
  // unlike the old single 8-digit field where a partial value couldn't be safely padded
  // without guessing which digits were month vs. day). Year has no padOnSubmit — a
  // partial year has no sensible padded meaning — so an early/explicit Enter with fewer
  // than 4 digits just fails the length check in handleYearConfirm and drops silently.
  const monthField = useNumpadField('numpad', 2, true);
  const dayField = useNumpadField('numpad', 2, true);
  const yearField = useNumpadField('numpad', 4);
  const [monthInvalid, setMonthInvalid] = useState(false);
  const [dayInvalid, setDayInvalid] = useState(false);

  /** Days in a given month, 1-indexed (`month`: 1=Jan…12=Dec). `year` is optional and only
   *  affects February: omitted (Month/Day are validated against each other before Year is
   *  even typed, in this chain's order), February is treated permissively as 29 days, so a
   *  leap-only Feb 29 isn't flagged wrong before the year is known; once Year lands,
   *  `handleYearConfirm` re-checks Day with the real year for the precise leap/non-leap
   *  answer. Returns `31` for an out-of-range month (1-12 range itself is `monthInvalid`'s
   *  own separate check, not this function's job). */
  function daysInMonth(month: number, year?: number): number {
    if (month === 2) {
      if (year == null) return 29;
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return isLeap ? 29 : 28;
    }
    const table = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[month - 1] ?? 31;
  }

  /** Client-side mirror of the server's Expiration Date rule — checked live once the
   *  chain completes, so an obviously-bad date highlights before Create Pallet is even
   *  attempted. The server remains authoritative (including the 1-3-month confirm step,
   *  which can only really be driven by the actual submit attempt). Only meaningful once
   *  Month/Day are themselves in range — handleYearConfirm only calls this when they are,
   *  since composing an ISO string from an out-of-range month/day and parsing it with
   *  `Date` would silently roll over to a misleading different date instead of erroring. */
  function checkExpirationDate(value: string) {
    if (!value) {
      setExpirationInvalid(false);
      return;
    }
    const parsed = new Date(value);
    const oneMonthOut = new Date();
    oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
    setExpirationInvalid(parsed < oneMonthOut);
  }

  function focusMonthField() { monthField.focus(handleMonthConfirm); }
  function focusDayField() { dayField.focus(handleDayConfirm); }
  function focusYearField() { yearField.focus(handleYearConfirm); }

  /** Month field submit: validates the 1-12 range (direct instruction — "I can put 24 in
   *  the month, we should validate the month to be only 1-12") and advances to Day once
   *  exactly 2 digits are entered, regardless of whether the value itself was in range —
   *  same "length drives advance, correctness is checked separately" convention the DPCI
   *  chain uses. Reads live from `monthField.value` rather than a parallel ref (see
   *  `loadByDpci`'s own note on why this screen no longer tracks chain values in refs). */
  function handleMonthConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 2) return;
    const n = parseInt(v, 10);
    setMonthInvalid(n < 1 || n > 12);
    setTimeout(() => focusDayField(), 50);
  }
  /** Day field submit: validates the day actually exists in the entered month (direct
   *  instruction — "validate the day exists in the month (if entered)"), skipped if Month
   *  itself is already out of range (nothing meaningful to validate Day against). Advances
   *  to Year regardless, same convention as Month. */
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
   *  year (leap-year precision for a Feb 29 entered before Year was known), then combines
   *  Month+Day+Year into the ISO value this screen stores/submits — only running the
   *  server-mirroring "too soon" check when Month/Day are themselves valid, since an
   *  out-of-range value composed into an ISO string and parsed by `Date` would silently
   *  roll over to a different, misleading date rather than erroring. */
  function handleYearConfirm(value: string) {
    const v = value.trim();
    if (v.length !== 4) return;
    resetToNumpad();
    const monthNum = parseInt(monthField.value, 10);
    const dayNum = parseInt(dayField.value, 10);
    const yearNum = parseInt(v, 10);
    const monthOk = monthNum >= 1 && monthNum <= 12;
    const dayOk = monthOk && dayNum >= 1 && dayNum <= daysInMonth(monthNum, yearNum);
    setDayInvalid(monthOk && !dayOk);
    const iso = `${v}-${monthField.value}-${dayField.value}`;
    setExpirationDate(iso);
    if (monthOk && dayOk) {
      checkExpirationDate(iso);
    } else {
      setExpirationInvalid(false);
    }
    // Screen-wide auto-advance (v1.6.11, direct instruction) — Year is the terminal step
    // of the "expiration required" branch, so it continues on to Location next, same as
    // the "not required" branch does directly from SSPs (see handleSspsConfirm).
    setTimeout(() => setLocationAutoFocus(true), 50);
  }

  // ── Row 2: VCP / SSP ────────────────────────────────────────────────────────
  const vcpField = useNumpadField();
  const sspField = useNumpadField();
  const [vcpSspInvalid, setVcpSspInvalid] = useState(false);

  const vcpNum = vcpField.value ? parseInt(vcpField.value, 10) : NaN;
  const sspNum = sspField.value ? parseInt(sspField.value, 10) : NaN;
  const sspPerCarton = Number.isInteger(vcpNum) && Number.isInteger(sspNum) && sspNum > 0 && vcpNum % sspNum === 0
    ? vcpNum / sspNum
    : null;

  /** Checked whenever VCP or SSP commits — SSP must evenly divide VCP, same rule PII enforces. */
  const checkVcpSsp = useCallback((vcp: string, ssp: string) => {
    const v = vcp ? parseInt(vcp, 10) : NaN;
    const s = ssp ? parseInt(ssp, 10) : NaN;
    if (!Number.isInteger(v) || !Number.isInteger(s)) { setVcpSspInvalid(false); return; }
    const bad = s <= 0 || v % s !== 0;
    setVcpSspInvalid(bad);
    if (bad) setMessage({ type: 'error', text: 'SSP must divide evenly into VCP' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** VCP field submit: checks the ratio and advances to SSP — screen-wide auto-advance
   *  (v1.6.11, direct instruction): "after VCP, SSP should focus." */
  function handleVcpConfirm(value: string) {
    const v = value.trim();
    vcpField.set(v);
    checkVcpSsp(v, sspField.value);
    setTimeout(() => focusSsp(), 50);
  }
  /** SSP field submit: checks the ratio and advances to Cartons — Single Pallet mode only
   *  (direct instruction doesn't cover Multiple Pallets' own fields, which aren't part of
   *  this auto-advance flow). Via focusCartonsRef, not focusCartons directly — see that
   *  ref's own declaration comment (near the top of the component) for why. */
  function handleSspConfirm(value: string) {
    const v = value.trim();
    sspField.set(v);
    checkVcpSsp(vcpField.value, v);
    if (mode === 'single') setTimeout(() => focusCartonsRef.current(), 50);
    else resetToNumpad();
  }

  function focusVcp() { vcpField.focus(handleVcpConfirm); }
  function focusSsp() { sspField.focus(handleSspConfirm); }
  // Keeps focusVcpRef current for loadByDpci/loadByUpc (declared above) to call — see
  // that ref's own declaration comment.
  useEffect(() => { focusVcpRef.current = focusVcp; });

  // ── Row 3: Unit Entry (Single / Multiple Pallet) ────────────────────────────
  const [mode, setMode] = useState<Mode>('single');

  // 3a. Single Pallet
  const cartonsField = useNumpadField();
  const sspsField = useNumpadField();
  const [sspsInvalid, setSspsInvalid] = useState(false);

  // 3b. Multiple Pallets
  const fullPalletsField = useNumpadField();
  const cartonsPerPalletField = useNumpadField();
  const partialCartonsField = useNumpadField();
  const partialSspsField = useNumpadField();
  const [partialSspsInvalid, setPartialSspsInvalid] = useState(false);

  /** Checked whenever a loose-SSPs field commits — must stay below one full carton's
   *  worth (vcp/ssp), same rule PII enforces on currentSSPs. */
  const checkSspCap = useCallback((looseSSPsStr: string, setInvalid: (b: boolean) => void) => {
    const loose = looseSSPsStr ? parseInt(looseSSPsStr, 10) : 0;
    if (sspPerCarton == null || !Number.isInteger(loose)) { setInvalid(false); return; }
    const bad = loose >= sspPerCarton;
    setInvalid(bad);
    if (bad) setMessage({ type: 'error', text: `SSPs must be less than a full carton (${sspPerCarton} per carton)` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sspPerCarton]);

  /** Cartons field submit: advances to SSPs — screen-wide auto-advance (v1.6.11, direct
   *  instruction): "Then Cartons -> SSPS." */
  function handleCartonsConfirm(value: string) {
    cartonsField.set(value.trim());
    setTimeout(() => focusSsps(), 50);
  }
  /** SSPs field submit: checks the cap, then branches to Expiration Date's Month box (if
   *  the resolved item requires one) or straight to Location's Aisle box otherwise —
   *  screen-wide auto-advance (v1.6.11, direct instruction): "then, IF the expiration date
   *  is required, Month -> Day -> Year, otherwise -> Aisle -> Bin -> Level." focusMonthField
   *  is declared above (Expiration Date section); setLocationAutoFocus is declared near the
   *  top of the component (see its own declaration comment for why). */
  function handleSspsConfirm(value: string) {
    const v = value.trim();
    sspsField.set(v);
    checkSspCap(v, setSspsInvalid);
    if (item?.requiresExpirationDate) {
      setTimeout(() => focusMonthField(), 50);
    } else {
      setTimeout(() => setLocationAutoFocus(true), 50);
    }
  }

  function focusCartons() { cartonsField.focus(handleCartonsConfirm); }
  function focusSsps() { sspsField.focus(handleSspsConfirm); }
  // Keeps focusCartonsRef current for handleSspConfirm (declared above, in the VCP/SSP
  // section) to call — see that ref's own declaration comment.
  useEffect(() => { focusCartonsRef.current = focusCartons; });

  const focusFullPallets = useCallback(() => fullPalletsField.focus((v) => { fullPalletsField.set(v.trim()); resetToNumpad(); }), [fullPalletsField, resetToNumpad]);
  const focusCartonsPerPallet = useCallback(() => cartonsPerPalletField.focus((v) => { cartonsPerPalletField.set(v.trim()); resetToNumpad(); }), [cartonsPerPalletField, resetToNumpad]);
  const focusPartialCartons = useCallback(() => partialCartonsField.focus((v) => { partialCartonsField.set(v.trim()); resetToNumpad(); }), [partialCartonsField, resetToNumpad]);
  const focusPartialSsps = useCallback(() => partialSspsField.focus((v) => { partialSspsField.set(v.trim()); resetToNumpad(); checkSspCap(v.trim(), setPartialSspsInvalid); }), [partialSspsField, resetToNumpad, checkSspCap]);

  // ── Row 4: Summary (derived, read-only) ─────────────────────────────────────
  const cartonsNum = cartonsField.value ? parseInt(cartonsField.value, 10) : 0;
  const sspsNum = sspsField.value ? parseInt(sspsField.value, 10) : 0;
  const totalSspsSingle = sspPerCarton != null ? cartonsNum * sspPerCarton + sspsNum : null;

  const fullPalletsNum = fullPalletsField.value ? parseInt(fullPalletsField.value, 10) : 0;
  const cartonsPerPalletNum = cartonsPerPalletField.value ? parseInt(cartonsPerPalletField.value, 10) : 0;
  const partialCartonsNum = partialCartonsField.value ? parseInt(partialCartonsField.value, 10) : 0;
  const partialSspsNum = partialSspsField.value ? parseInt(partialSspsField.value, 10) : 0;
  const totalCartonsMulti = fullPalletsNum * cartonsPerPalletNum + partialCartonsNum;
  const totalSspsMulti = sspPerCarton != null ? totalCartonsMulti * sspPerCarton + partialSspsNum : null;

  // ── Row 5: Location (Single Pallet mode only) ───────────────────────────────
  const [location, setLocation] = useState('');
  // locationInvalid means "Level doesn't exist within this Aisle+Bin" specifically (the
  // full 3-box resolution) — passed to LocationEntryFields' levelInvalid prop below.
  // aisleInvalid/binInvalid (v1.6.11, new) are each box's own progressive existence check,
  // fired the moment that box completes rather than waiting for the whole chain — direct
  // instruction: "When Aisle is entered, should validate the Aisle exists, and Bin should
  // validate the Bin exists within the aisle (if entered) and Level should validate the
  // level exists in the Aisle/Bin (if selected)... if a single box is invalid, it should
  // be highlighted." Each box washes independently now (no more whole-group wash, which
  // also fixes the group wash extending past the last box — nothing to extend once the
  // wash lives on each box instead of a wrapper around all three).
  const [locationInvalid, setLocationInvalid] = useState(false);
  const [aisleInvalid, setAisleInvalid] = useState(false);
  const [binInvalid, setBinInvalid] = useState(false);
  const [locationStatusInfo, setLocationStatusInfo] = useState<LocationStatusInfo | null>(null);
  // Reset every time a new location resolves — the worker must re-acknowledge the warning
  // popup for each distinct location, not just once per screen visit.
  const [locationStatusConfirmed, setLocationStatusConfirmed] = useState(false);
  const [locationWarningPending, setLocationWarningPending] = useState(false);
  // locationAutoFocus itself is declared near the top of the component (see its own
  // comment there for why) — flipping it false→true re-triggers LocationEntryFields' own
  // existing `autoFocus` mount effect (its dependency array already includes `autoFocus`),
  // focusing its Aisle box without needing any new imperative plumbing into that shared
  // component. Reset to false by clearForm() so the next pallet's flow can trigger it
  // fresh (false→true) again.

  /** Live existence + status/hold/contraction check, direct instruction — fires once all
   *  three Location boxes are complete, mirroring DPCI's own existence-check effect
   *  rather than waiting until submit. Occupied/held/contracted locations are not
   *  rejected outright (see below) — only "not found" blocks Create Pallet. */
  const checkLocation = useCallback(async (id: string) => {
    try {
      const data = await apiFetch<LocationStatusInfo>(`/api/locations/${id}`, token!);
      setLocationInvalid(false);
      setLocationStatusInfo(data);
    } catch {
      setLocationInvalid(true);
      setLocationStatusInfo(null);
      setMessage({ type: 'error', text: 'Location not found' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Aisle box's own progressive check (v1.6.11) — fires the moment Aisle completes, before
   *  Bin is even typed. A stale Bin/Level result from a previously-entered, now-replaced
   *  Aisle is cleared, since it no longer means anything against the new Aisle. */
  const checkAisleExists = useCallback(async (aisle: string) => {
    setBinInvalid(false);
    try {
      const { exists } = await apiFetch<{ exists: boolean }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!);
      setAisleInvalid(!exists);
    } catch {
      setAisleInvalid(true);
    }
  }, [token]);

  /** Bin box's own progressive check (v1.6.11) — fires the moment Bin completes, reusing
   *  `getLocation`'s existing 6-digit (Aisle+Bin, level-agnostic) lookup rather than a new
   *  endpoint, since that's already exactly "does this Aisle+Bin combination exist." */
  const checkAisleBinExists = useCallback(async (aisle: string, bin: string) => {
    try {
      await apiFetch(`/api/locations/${aisle}${bin}`, token!);
      setBinInvalid(false);
    } catch {
      setBinInvalid(true);
    }
  }, [token]);

  /** `isOverride` is true for a value that bypassed the normal per-box typed sequence — a
   *  full-barcode scan (LocationEntryFields' own `wasScanned`) or a demo-picker prefill
   *  (`pickLocation` passes `true` explicitly, same reasoning) — in which case Aisle/Bin's
   *  own progressive checks never ran, so any invalid state left over from a previous
   *  manual entry attempt needs clearing; a normal in-sequence chain completion
   *  (`wasScanned: false`) already has accurate per-box state from onAisleEntered/
   *  onBinEntered as typing happened, so leaves it alone. */
  const handleLocationResolved = useCallback((v: string, isOverride = false) => {
    setLocation(v);
    setLocationStatusConfirmed(false);
    if (isOverride) {
      setAisleInvalid(false);
      setBinInvalid(false);
    }
    void checkLocation(v);
    // LocationEntryFields calls its own hidePanel() once the third box resolves — reopen
    // the numpad right after so it stays visible per this screen's persistent-panel rule,
    // without needing to modify that shared component.
    showNumpad();
  }, [checkLocation, showNumpad]);

  // Occupied (status !== EMPTY), on hold, or contracted — the pallet being reinstated is
  // very likely physically sitting here already, so this warns-then-allows rather than
  // blocking outright (direct instruction, a deliberate departure from a normal put).
  const locationNeedsWarning = locationStatusInfo != null && (
    locationStatusInfo.status !== 'EMPTY' || locationStatusInfo.holdCategory != null || locationStatusInfo.contraction
  );

  /** Builds the specific warning copy for whichever condition(s) actually apply, so the
   *  worker knows exactly what they're overriding before confirming. */
  function locationWarningMessage(): string {
    if (!locationStatusInfo) return '';
    const reasons: string[] = [];
    if (locationStatusInfo.status !== 'EMPTY') reasons.push(`currently ${locationStatusInfo.status}`);
    if (locationStatusInfo.holdCategory) reasons.push(`on ${HOLD_LABELS[locationStatusInfo.holdCategory].name}`);
    if (locationStatusInfo.contraction) reasons.push('under Contraction');
    return `Location ${fmtLocation(location)} is ${reasons.join(' and ')}. The pallet may already be physically here — continue anyway?`;
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasPartial = mode === 'multiple' && (partialCartonsNum > 0 || partialSspsNum > 0);
  // Bugfix (v1.6.11, 2026-07-20): a worker can tap directly into any box of the Month/Day/
  // Year chain, skipping ahead — e.g. Month → Year, never visiting Day. handleYearConfirm
  // composes `expirationDate` from whatever Month/Day currently hold with no check that
  // they're actually complete, so a skipped Day (or a Month/Day left mid-typed) could reach
  // Year and compose a malformed value like "2028-24-" that nothing else was blocking on —
  // monthInvalid/dayInvalid only reflect a box that was *fully entered and wrong*, not one
  // that was *never entered*. Re-derived directly from each box's own live length (already
  // current on every keystroke, no separate "commit" step needed) rather than trusting only
  // the incrementally-tracked flags, so Create Pallet stays disabled whenever the group has
  // been started but isn't actually all there.
  const expirationBoxesTouched = monthField.value.length > 0 || dayField.value.length > 0 || yearField.value.length > 0;
  const expirationBoxesComplete = monthField.value.length === 2 && dayField.value.length === 2 && yearField.value.length === 4;
  const canSubmit =
    item != null &&
    vcpField.value.trim() !== '' && sspField.value.trim() !== '' && !vcpSspInvalid &&
    (!item.requiresExpirationDate || expirationDate !== '') &&
    !expirationInvalid && !monthInvalid && !dayInvalid &&
    (!expirationBoxesTouched || expirationBoxesComplete) &&
    (mode !== 'single' || !location || (!locationInvalid && !aisleInvalid && !binInvalid)) &&
    (mode === 'single'
      // SSPs is optional (direct instruction — "if empty, it's 0"), matching Multiple
      // mode's own Partial SSPs field, which already defaults empty to 0 (sspsNum's own
      // derivation already treats a blank box as 0; this only removes the submit-blocking
      // "must be non-empty" requirement).
      ? cartonsField.value.trim() !== '' && !sspsInvalid
      : (fullPalletsNum > 0 || hasPartial) && !partialSspsInvalid && (fullPalletsNum === 0 || cartonsPerPalletNum > 0));

  /** Create Pallet: if the resolved location needs the warn-then-allow popup and hasn't
   *  been acknowledged yet for this specific location, show that first; otherwise go
   *  straight to the normal create-summary confirm dialog. */
  function handleCreateClick() {
    if (!canSubmit || submitting) return;
    if (mode === 'single' && location && locationNeedsWarning && !locationStatusConfirmed) {
      setLocationWarningPending(true);
      return;
    }
    setConfirming(true);
  }

  /** Worker accepted the location-status warning — remember it for this location and
   *  proceed to the normal create-summary confirm dialog. */
  function confirmLocationWarning() {
    setLocationStatusConfirmed(true);
    setLocationWarningPending(false);
    setConfirming(true);
  }

  /** Resets every field to a blank form after a successful create. */
  function clearForm() {
    deptField.clear();
    classField.clear();
    itemField.clear();
    upcField.clear();
    setItem(null);
    setDpciInvalid(false);
    setUpcInvalid(false);
    setExpirationDate('');
    setExpirationInvalid(false);
    monthField.clear();
    dayField.clear();
    yearField.clear();
    setMonthInvalid(false);
    setDayInvalid(false);
    vcpField.clear();
    sspField.clear();
    setVcpSspInvalid(false);
    setMode('single');
    cartonsField.clear();
    sspsField.clear();
    setSspsInvalid(false);
    fullPalletsField.clear();
    cartonsPerPalletField.clear();
    partialCartonsField.clear();
    partialSspsField.clear();
    setPartialSspsInvalid(false);
    setLocation('');
    setLocationInvalid(false);
    setAisleInvalid(false);
    setBinInvalid(false);
    setLocationStatusInfo(null);
    setLocationStatusConfirmed(false);
    setLocationAutoFocus(false);
  }

  /** Actually submits POST /api/pallets/reinstate; confirmNearExpiration is only set on
   *  the resend after the worker accepts the within-3-months warning. */
  async function doSubmit(confirmNearExpiration?: boolean) {
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        vcp: vcpNum, ssp: sspNum, mode,
        expirationDate: expirationDate || null,
      };
      if (confirmNearExpiration) body.confirmNearExpiration = true;
      if (mode === 'single') {
        body.cartons = cartonsNum;
        body.ssps = sspsNum;
        body.locationId = location || null;
        if (location && locationStatusConfirmed) body.confirmLocationStatus = true;
      } else {
        body.fullPallets = fullPalletsNum;
        body.cartonsPerPallet = cartonsPerPalletNum;
        body.partialCartons = partialCartonsNum;
        body.partialSsps = partialSspsNum;
      }
      if (dpciDigits.length === 9 && !upcInvalid) body.dpci = dpciDigits;
      else if (upcField.value) body.upc = upcField.value;
      else body.dpci = dpciDigits;

      const result = await apiFetch<ReinstateResult>('/api/pallets/reinstate', token!, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      playAlert('info');
      const first = result.pallets[0];
      const text = result.pallets.length === 1
        ? (first.locationId
          ? `Pallet ${first.palletId} created — stored at ${fmtLocation(first.locationId)}`
          : `Pallet ${first.palletId} created — PUT_PENDING`)
        : `${result.pallets.length} pallets created — PUT_PENDING`;
      setMessage({ type: 'success', text });
      setExpirationConfirmPending(false);
      setConfirming(false);
      clearForm();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'EXPIRATION_NEEDS_CONFIRM') {
        setExpirationConfirmPending(true);
        return;
      }
      // Shouldn't normally trigger — the client already pre-checks and shows the warning
      // dialog before ever submitting — but kept as a safety net for a stale live-check
      // (e.g. the location's status changed after it was fetched but before Confirm).
      if (code === 'LOCATION_NEEDS_CONFIRM') {
        setLocationWarningPending(true);
        return;
      }
      playAlert('error');
      setConfirming(false);
      if (code === 'DPCI_NOT_FOUND') {
        setDpciInvalid(true);
        setMessage({ type: 'error', text: 'DPCI not found' });
      } else if (code === 'UPC_NOT_FOUND') {
        setUpcInvalid(true);
        setMessage({ type: 'error', text: 'UPC not found' });
      } else if (code === 'LOCATION_NOT_FOUND') {
        setLocationInvalid(true);
        setMessage({ type: 'error', text: 'Location not found' });
      } else if (code === 'INVALID_VCP_SSP_RATIO') {
        setVcpSspInvalid(true);
        setMessage({ type: 'error', text: 'SSP must divide evenly into VCP' });
      } else if (code === 'SSPS_EXCEED_CARTON') {
        if (mode === 'single') setSspsInvalid(true); else setPartialSspsInvalid(true);
        setMessage({ type: 'error', text: `SSPs must be less than a full carton (${sspPerCarton ?? '?'} per carton)` });
      } else if (code === 'EXPIRATION_TOO_SOON') {
        setExpirationInvalid(true);
        setMessage({ type: 'error', text: 'Expiration Date must be at least 1 month out' });
      } else if (code === 'EXPIRATION_REQUIRED') {
        setExpirationInvalid(true);
        setMessage({ type: 'error', text: 'Expiration Date is required for this item' });
      } else if (code === 'INVALID_INPUT') {
        // Defense-in-depth (v1.6.11, 2026-07-20) — the client-side completeness checks
        // above (canSubmit's own expirationBoxesTouched/Complete, DPCI/Location's own
        // resolve-gated state) should mean this never actually fires in practice, but a
        // bare "Create failed" here would otherwise give the worker zero information that
        // something specific (not just "try again") was actually wrong with what they
        // entered — this at least names the category.
        setMessage({ type: 'error', text: 'Some entered values are invalid — check every field and try again' });
      } else {
        setMessage({ type: 'error', text: 'Create failed — please try again' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Worker accepted the "expiration within 3 months" warning — resend with the confirm flag. */
  function confirmNearExpirationAndSubmit() {
    void doSubmit(true);
  }

  // ── Demo buttons (v1.6.11) — one per identifier, each opens a DemoPicker popup instead
  // of a fixed good/bad pair, direct instruction. ───────────────────────────────

  /** requiresExpirationDate is passed through to `sampleReinstate`'s own optional filter
   *  (undefined = either, matching the plain "Valid" option's original random-pick
   *  behavior) so the DPCI/UPC pickers' "w/ Expiration"/"w/o Expiration" options can land
   *  deterministically on an item that does or doesn't require one, for exercising PAR's
   *  own required-Expiration-Date gate on demand instead of re-rolling "Valid" repeatedly. */
  const fillSample = useCallback(async (requiresExpirationDate?: boolean): Promise<SampleReinstate | null> => {
    try {
      const qs = requiresExpirationDate != null ? `?requiresExpirationDate=${requiresExpirationDate}` : '';
      return await apiFetch<SampleReinstate>(`/api/pallets/sample-reinstate${qs}`, token!);
    } catch {
      setMessage({ type: 'error', text: 'Demo fill unavailable' });
      return null;
    }
  }, [token, setMessage]);

  const [dpciPickerOpen, setDpciPickerOpen] = useState(false);
  const [upcPickerOpen, setUpcPickerOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  type IdentifierDemoKey = 'valid' | 'validWithExpiration' | 'validWithoutExpiration' | 'invalid';

  /** DPCI picker: "Valid" fills a random real, resolvable DPCI (either expiration
   *  behavior); "Valid w/ Expiration"/"Valid w/o Expiration" fill one guaranteed to
   *  require (or not require) an Expiration Date; "Invalid" fills one that doesn't exist. */
  const pickDpci = useCallback(async (key: IdentifierDemoKey) => {
    setDpciPickerOpen(false);
    if (key === 'invalid') {
      deptField.set('999');
      classField.set('99');
      itemField.set('9000');
      void loadByDpci('999999000');
      return;
    }
    const requiresExpirationDate = key === 'validWithExpiration' ? true : key === 'validWithoutExpiration' ? false : undefined;
    const sample = await fillSample(requiresExpirationDate);
    if (!sample) return;
    const parsed = splitDpciString(sample.dpci);
    deptField.set(parsed.dept);
    classField.set(parsed.class);
    itemField.set(parsed.item);
    void loadByDpci(sample.dpci.replace(/-/g, ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSample, loadByDpci]);

  /** UPC picker: same 4 options as the DPCI picker, filling the UPC field instead. */
  const pickUpc = useCallback(async (key: IdentifierDemoKey) => {
    setUpcPickerOpen(false);
    if (key === 'invalid') {
      upcField.set('999999999999');
      void loadByUpc('999999999999');
      return;
    }
    const requiresExpirationDate = key === 'validWithExpiration' ? true : key === 'validWithoutExpiration' ? false : undefined;
    const sample = await fillSample(requiresExpirationDate);
    if (!sample) return;
    upcField.set(sample.upc);
    void loadByUpc(sample.upc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSample, loadByUpc]);

  /** Location picker: fills the Location field with a real location matching the picked
   *  status (or a nonexistent one for "Invalid") — same as scanning/typing one in, nothing
   *  more; the live checkLocation() this triggers is what actually surfaces the result. */
  const pickLocation = useCallback(async (key: 'empty' | 'occupied' | 'invalid' | 'held' | 'contracted') => {
    setLocationPickerOpen(false);
    if (key === 'invalid') {
      handleLocationResolved('99999999', true);
      return;
    }
    try {
      const { locationId, level } = await apiFetch<{ locationId: string; level: number }>(`/api/demo/location?status=${key}`, token!);
      handleLocationResolved(locationId + String(level).padStart(2, '0'), true);
    } catch {
      setMessage({ type: 'error', text: 'Demo fill unavailable' });
    }
  }, [token, handleLocationResolved, setMessage]);

  const demoSlot = useMemo(() => (
    <>
      <button type="button" onClick={() => setDpciPickerOpen(true)} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
        DPCI
      </button>
      <button type="button" onClick={() => setUpcPickerOpen(true)} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
        UPC
      </button>
      <button type="button" onClick={() => setLocationPickerOpen(true)} className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors">
        Location
      </button>
    </>
  ), []);

  useDemoSlot(isIM ? demoSlot : null);

  // Pre-population via ?dpci= (IID's "Reinstate Pallet" hot button, IM+ only).
  const dpciParam = searchParams.get('dpci');
  useEffect(() => {
    if (!dpciParam) return;
    const parsed = splitDpciString(dpciParam);
    deptField.set(parsed.dept);
    classField.set(parsed.class);
    itemField.set(parsed.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpciParam]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isIM) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 select-none">
        <h2 className="font-ui text-[26px] font-semibold text-white">Access Denied</h2>
        <p className="font-ui text-[17px] text-[#555]">Pallet Reinstate requires Inventory Manager or higher.</p>
      </div>
    );
  }

  const dpciDisplay = `${deptField.value}-${classField.value}-${itemField.value}`;

  /** Create-summary confirm dialog content (v1.6.11 revised, direct instruction — a fixed
   *  5-line layout instead of one long sentence): DPCI - Description; a pallet-count/total
   *  summary line (trivial "1 Pallet" in Single mode, since there's nothing to aggregate;
   *  the actual total in Multiple mode); the mode-specific entry breakdown (Cartons/SSPs
   *  for Single, Full Pallets + Partial for Multiple); Expiration Date, only if one was
   *  entered; Location, only in Single mode (Multiple never has one — a structural
   *  constraint of that mode, not a per-transaction choice, so showing "PUT_PENDING" for
   *  every Multiple-mode confirmation would be redundant rather than informative). Joined
   *  with `\n` — `ConfirmDialog`'s own message paragraph renders each line on its own row
   *  via `whitespace-pre-line`. */
  const totalPalletCount = mode === 'single' ? 1 : fullPalletsNum + (hasPartial ? 1 : 0);
  const confirmSummaryLines = [
    `${dpciDisplay}${item ? ` — ${item.descShort}` : ''}`,
    mode === 'single'
      ? '1 Pallet'
      : `${totalPalletCount} Pallets — ${totalCartonsMulti} Cartons${totalSspsMulti != null ? `, ${totalSspsMulti} SSPs Total` : ''}`,
    mode === 'single'
      ? `Cartons: ${cartonsNum}  SSPs: ${sspsNum}${totalSspsSingle != null ? ` (${totalSspsSingle} SSPs Total)` : ''}`
      : `${fullPalletsNum > 0 ? `${fullPalletsNum} Full Pallet${fullPalletsNum === 1 ? '' : 's'} @ ${cartonsPerPalletNum} Cartons/Pallet` : ''}${fullPalletsNum > 0 && hasPartial ? ', ' : ''}${hasPartial ? `1 Partial Pallet @ ${partialCartonsNum} Cartons / ${partialSspsNum} SSPs` : ''}`,
  ];
  if (expirationDate) {
    const [y, m, d] = expirationDate.split('-');
    confirmSummaryLines.push(`Expiration: ${m}/${d}/${y}`);
  }
  if (mode === 'single') {
    confirmSummaryLines.push(location ? `Location: ${fmtLocation(location)}` : 'PUT_PENDING (no location)');
  }
  const confirmSummary = confirmSummaryLines.join('\n');

  return (
    <div className="absolute inset-0 flex flex-col p-6 gap-5 select-none overflow-y-auto">
      {/* Row 1 — DPCI / UPC entry + Description, Printer preview pushed to the right.
          DPCI is its own numpad-driven Dept/Class/Item chain of 3 FieldBoxes (v1.6.11,
          direct instruction — replaces the shared DpciField's native inputs so every field
          on this screen brings up the on-screen numpad), sized to land at the same 261px
          total width and ENTRY_BOX_HEIGHT height as the UPC box beside it. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 w-[261px]">
          <span className={`font-ui text-[13px] font-medium uppercase tracking-wider ${dpciInvalid ? 'text-[#FF6666]' : 'text-[#9A9A9A]'}`}>DPCI</span>
          <div className={`flex items-center gap-1 rounded-[10px] ${dpciInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
            <FieldBox label="" value={deptField.value} onFocus={focusDeptField} active={deptField.isActive} width="w-[76px]" />
            <span className="text-[#555]">-</span>
            <FieldBox label="" value={classField.value} onFocus={focusClassField} active={classField.isActive} width="w-[64px]" />
            <span className="text-[#555]">-</span>
            <FieldBox label="" value={itemField.value} onFocus={focusItemField} active={itemField.isActive} width="w-[92px]" />
          </div>
        </div>
        {/* Extra ml-8 beyond the row's own gap-4, direct instruction — DPCI and UPC read
            as two distinct entry methods, not one continuous group. */}
        <div className="ml-8">
          <FieldBox label="UPC" value={upcField.value} onFocus={focusUpcField} active={upcField.isActive} invalid={upcInvalid} width="w-[261px]" />
        </div>
        <div className="ml-auto">
          <PrinterField value={printerField.value} onFocus={focusPrinterField} active={printerField.isActive} />
        </div>
      </div>

      {/* Description — its own row, direct instruction */}
      <PlainText label="Description" value={item?.descShort ?? ''} width="w-[600px]" />

      {/* Row 2 — VCP / SSP entry. Group-washed together (direct instruction — "apply it to
          the VCP/SSP on this page as well," extending the DPCI/Expiration Date/Location
          group-wash treatment here too) rather than each box washing independently — VCP
          and SSP invalidate as a pair (the ratio-divides-evenly rule needs both), so one
          shared wash reads as "this pair is wrong together," not two separately-wrong
          numbers. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className={`flex items-end gap-4 rounded-[10px] ${vcpSspInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
          <FieldBox label="VCP" value={vcpField.value} onFocus={focusVcp} active={vcpField.isActive} width="w-[126px]" />
          <FieldBox label="SSP" value={sspField.value} onFocus={focusSsp} active={sspField.isActive} width="w-[126px]" />
        </div>
        <PlainText label="SSPs per Carton" value={sspPerCarton != null ? String(sspPerCarton) : ''} width="w-[160px]" />
      </div>

      {/* Row 3 — Unit Entry */}
      <div className="flex items-start gap-4">
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === 'single' ? (
          <div className="flex flex-wrap gap-4">
            <FieldBox label="Cartons" value={cartonsField.value} onFocus={focusCartons} active={cartonsField.isActive} width="w-[144px]" />
            <FieldBox label="SSPs" value={sspsField.value} onFocus={focusSsps} active={sspsField.isActive} invalid={sspsInvalid} width="w-[144px]" />
          </div>
        ) : (
          <div className="flex items-stretch gap-4">
            <FieldBox label="Full Pallets" value={fullPalletsField.value} onFocus={focusFullPallets} active={fullPalletsField.isActive} width="w-[144px]" />
            <FieldBox label="Cartons per Pallet" value={cartonsPerPalletField.value} onFocus={focusCartonsPerPallet} active={cartonsPerPalletField.isActive} width="w-[180px]" />
            <div className="w-px bg-[#3A3A3A]" />
            <FieldBox label="Partial: Carton Count" value={partialCartonsField.value} onFocus={focusPartialCartons} active={partialCartonsField.isActive} width="w-[180px]" />
            <FieldBox label="Partial: SSPs" value={partialSspsField.value} onFocus={focusPartialSsps} active={partialSspsField.isActive} invalid={partialSspsInvalid} width="w-[144px]" />
          </div>
        )}
      </div>

      {/* Row 4 — Summary (always visible, plain text, recalculates live, kept compact — direct instruction) */}
      <div className="flex flex-wrap gap-6 px-3 py-2 rounded-[8px] bg-[#0A0A0A] border border-[#222] self-start">
        {mode === 'single' ? (
          <>
            <PlainText compact label="Carton Count" value={cartonsField.value ? String(cartonsNum) : ''} width="w-[110px]" />
            {/* SSPs is optional (direct instruction — "if empty, it's 0") — shown as soon
                as Cartons is entered, same as an actually-typed 0 would read, rather than
                waiting on SSPs' own box to be non-empty. */}
            <PlainText compact label="Loose SSPs" value={cartonsField.value ? String(sspsNum) : ''} width="w-[110px]" />
            <PlainText compact label="Total SSPs on Pallet" value={totalSspsSingle != null ? String(totalSspsSingle) : ''} width="w-[150px]" />
          </>
        ) : (
          <>
            <PlainText compact label="Full Pallets" value={fullPalletsField.value ? `${fullPalletsNum} Pallets: ${cartonsPerPalletNum} cartons` : ''} width="w-[220px]" />
            <PlainText compact label="Partial Pallet" value={hasPartial ? `1 Pallet: ${partialCartonsNum} Cartons, ${partialSspsNum} SSPs` : ''} width="w-[220px]" />
            <PlainText compact label="Total Cartons" value={fullPalletsField.value || hasPartial ? String(totalCartonsMulti) : ''} width="w-[110px]" />
            <PlainText compact label="Total SSP" value={totalSspsMulti != null ? `${totalSspsMulti} (for ${sspPerCarton} per carton)` : ''} width="w-[200px]" />
          </>
        )}
      </div>

      {/* Expiration Date — lives just before Location (direct instruction). Restored as 3
          separate Month/Day/Year boxes (v1.6.11 — matches the native `<input type="date">`
          this screen used before the numpad-persistence round, direct instruction: "split
          the expiration date into day month year just like it was before, but keep the
          keypad call"). Each box has its own "Month"/"Day"/"Year" label rendered inline to
          its left (direct instruction — "should being inline with the boxes, not above"),
          not stacked above it the way FieldBox's own built-in label normally sits — so each
          is its own small label+box pair (`label=""` on FieldBox itself, with a plain span
          in front of it) rather than using FieldBox's label prop directly.

          Two levels of invalid, per direct instruction ("I can put 24 in the month...
          should validate the month to be only 1-12. Should validate the day exists in the
          month... If a single box is invalid, it should be highlighted"): a box-specific
          problem (Month out of 1-12 range, or Day not existing in that month) washes just
          that one box (`monthInvalid`/`dayInvalid`); a whole-value problem not attributable
          to one box (the composed date being under the 1-month-out floor) washes the whole
          group instead — "the 'Group' highlight like DPCI has," same
          `rounded-[10px] border-2 p-1` treatment DPCI's own 3-box group uses. `self-start`
          on the group wrapper keeps the wash sized to its own content — without it, this
          `flex-col` row (a child of the page's own top-level `flex-col`) stretches to the
          full row width by default, which is exactly why an earlier version of this wash
          extended well past the last box. Each box's own value persists after commit — no
          separate "active vs. formatted" display needed, since the three fields themselves
          are the always-visible state. */}
      <div className="flex flex-col gap-1">
        {/* whitespace-nowrap (direct instruction, kept from an earlier round) — the
            "Required for this item" suffix extends past the column instead of wrapping the
            label down to a second line; nothing clips it, so it just overflows into the
            row's own open space. */}
        <span className={`font-ui text-[13px] font-medium uppercase tracking-wider whitespace-nowrap ${expirationInvalid ? 'text-[#FF6666]' : 'text-[#9A9A9A]'}`}>
          Expiration Date
          {item?.requiresExpirationDate && !expirationDate && (
            <span className="ml-2 normal-case tracking-normal text-[#FF6666]">Required for this item</span>
          )}
        </span>
        <div className={`flex items-center gap-4 rounded-[10px] self-start ${expirationInvalid ? `${INVALID_WASH} border-2 p-1` : ''}`}>
          <div className="flex items-center gap-2">
            <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Month</span>
            <FieldBox label="" value={monthField.value} onFocus={focusMonthField} active={monthField.isActive} invalid={monthInvalid} width="w-[76px]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Day</span>
            <FieldBox label="" value={dayField.value} onFocus={focusDayField} active={dayField.isActive} invalid={dayInvalid} width="w-[76px]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Year</span>
            <FieldBox label="" value={yearField.value} onFocus={focusYearField} active={yearField.isActive} width="w-[100px]" />
          </div>
        </div>
      </div>

      {/* Row 5 — Location (Single Pallet mode only). Validated live, per box, as each one
          completes (v1.6.11 revised, direct instruction) — Aisle checked against
          `/api/locations/aisle-exists` the moment it's entered, Bin checked against a
          6-digit Aisle+Bin lookup once entered, Level checked against the full 8-digit
          resolution once selected — each box washes individually
          (`aisleInvalid`/`binInvalid`/`levelInvalid`) rather than the whole 3-box group
          washing as one unit (the prior treatment), so a specific wrong box is exactly
          what's highlighted. Occupied/held/contracted don't block entry, just flag via the
          amber note below, since Create Pallet's own warn-then-allow popup is where that's
          actually gated. */}
      <div className="flex flex-col gap-1">
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">
          Location (optional)
          {mode === 'multiple' && <span className="ml-2 normal-case tracking-normal text-[#666]">— not available for Multiple Pallets (Bulk locations not yet supported)</span>}
          {mode === 'single' && locationNeedsWarning && (
            <span className="ml-2 normal-case tracking-normal text-[#DDAA00]">
              {[
                locationStatusInfo!.status !== 'EMPTY' ? locationStatusInfo!.status : null,
                locationStatusInfo!.holdCategory ? HOLD_LABELS[locationStatusInfo!.holdCategory].name : null,
                locationStatusInfo!.contraction ? 'Contracted' : null,
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <div className={mode === 'multiple' ? 'opacity-40 pointer-events-none' : ''}>
          <LocationEntryFields
            value={location}
            onResolved={handleLocationResolved}
            autoFocus={locationAutoFocus}
            onAisleEntered={(aisle) => void checkAisleExists(aisle)}
            onBinEntered={(aisle, bin) => void checkAisleBinExists(aisle, bin)}
            aisleInvalid={aisleInvalid}
            binInvalid={binInvalid}
            levelInvalid={locationInvalid}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreateClick}
        disabled={!canSubmit || submitting}
        className="w-[240px] h-[64px] mt-2 rounded-[12px] font-ui text-[18px] font-semibold bg-[#CC0000] hover:bg-[#DD0000] text-white disabled:opacity-40 transition-colors"
      >
        Create Pallet
      </button>

      {locationWarningPending && (
        <ConfirmDialog
          title="Location isn't clear"
          message={locationWarningMessage()}
          confirmLabel="Continue"
          variant="danger"
          onConfirm={confirmLocationWarning}
          onCancel={() => setLocationWarningPending(false)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Create pallet(s)?"
          message={confirmSummary}
          confirmLabel={submitting ? 'Working…' : 'Confirm'}
          variant="danger"
          onConfirm={() => void doSubmit()}
          onCancel={() => setConfirming(false)}
        />
      )}

      {dpciPickerOpen && (
        <DemoPicker
          title="Simulate which DPCI?"
          options={[
            { key: 'valid', label: 'Valid' },
            { key: 'validWithExpiration', label: 'Valid w/ Expiration' },
            { key: 'validWithoutExpiration', label: 'Valid w/o Expiration' },
            { key: 'invalid', label: 'Invalid' },
          ]}
          onPick={(k) => void pickDpci(k)}
          onCancel={() => setDpciPickerOpen(false)}
        />
      )}

      {upcPickerOpen && (
        <DemoPicker
          title="Simulate which UPC?"
          options={[
            { key: 'valid', label: 'Valid' },
            { key: 'validWithExpiration', label: 'Valid w/ Expiration' },
            { key: 'validWithoutExpiration', label: 'Valid w/o Expiration' },
            { key: 'invalid', label: 'Invalid' },
          ]}
          onPick={(k) => void pickUpc(k)}
          onCancel={() => setUpcPickerOpen(false)}
        />
      )}

      {locationPickerOpen && (
        <DemoPicker
          title="Simulate which Location?"
          options={[
            { key: 'empty', label: 'Empty' },
            { key: 'occupied', label: 'Occupied' },
            { key: 'invalid', label: 'Invalid' },
            { key: 'held', label: 'Hold' },
            { key: 'contracted', label: 'Contraction' },
          ]}
          onPick={(k) => void pickLocation(k)}
          onCancel={() => setLocationPickerOpen(false)}
        />
      )}

      {expirationConfirmPending && (
        <ConfirmDialog
          title="Expiration date is within 3 months"
          message={`The entered expiration date is inside the 1-3 month warning window. Continue anyway?`}
          confirmLabel="Continue"
          variant="danger"
          onConfirm={confirmNearExpirationAndSubmit}
          onCancel={() => setExpirationConfirmPending(false)}
        />
      )}
    </div>
  );
}
