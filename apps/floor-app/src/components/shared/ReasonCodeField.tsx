import { useEffect, useState } from 'react';
import { CodePickerField } from './CodePickerField';
import { useReasonCodeSession } from '../../context/ReasonCodeSessionContext';
import { combineReasonCode, splitReasonCode } from '../../lib/reasonCode';
import { useReasonCodes, type ReasonCodeDomain } from '../../lib/useReasonCodes';

interface ReasonCodeFieldProps {
  /** Which feature this reason code is for (issue #84) — determines which reason numbers
   *  are offered via `ReasonCodeDomain`. `HOLD` for WLH/PIP/SDP/MNP/STG; `PALLET_ADJUST`
   *  for PII's Edit Mode. */
  domain: ReasonCodeDomain;
  /** The resolved combined code (e.g. "W01"), or '' if none chosen yet. Splits into its
   *  prefix/number parts internally via `splitReasonCode`. */
  value: string;
  onChange: (value: string) => void;
  /** `compact` for denser forms (e.g. an already-a-popup confirm dialog); `default` matches
   *  HoldPanel/PII's original sizing. */
  size?: 'compact' | 'default';
  label?: string;
  /** Disables the field — e.g. WLH's Single Location panel, before a location is loaded
   *  (v1.6.10). Default false; every other caller is unaffected. */
  disabled?: boolean;
  /** Pre-fills the reason number once a default prefix resolves and `value` is still empty
   *  (issue #84 follow-up, direct instruction) — the prefix itself always defaults to the
   *  worker's own home department (or the session-sticky one), never a hardcoded letter;
   *  only the number is caller-supplied, since it's the one part that's actually specific
   *  to *why* a given screen's Hold/Adjust button exists (e.g. PIP's quick-hold defaults to
   *  `'02'`/Incorrect Count, SDP's to `'70'`/Blocked Location). Omit for a field with no
   *  sensible number default — WLH's own general-purpose Hold button, and MNP's own
   *  general "Hold" quick-action (as opposed to its occupied-location gate, which pre-fills
   *  a full `value` instead — see MNPPage.tsx), both intentionally have none. */
  defaultNumber?: string;
  /** Where the resolved description text renders relative to the two code pickers. `'below'`
   *  (default) matches every original caller. `'above'` (2026-08-03, direct instruction,
   *  "the Hold Reason should appear above the reason code when it is selected") — used by
   *  `LockedHoldConfirmDialog`, so the resolved description reads as a heading over the
   *  pickers rather than a footnote under them. `'none'` (2026-08-03 follow-up) — suppresses
   *  the internal display entirely; used by `HoldPanel`, which instead hoists the text via
   *  `onResolvedDescriptionChange` below to render it once, prominently, at the very top of
   *  the whole popup rather than tucked inside this one field. */
  descriptionPosition?: 'above' | 'below' | 'none';
  /** Fires whenever the resolved department/reason description changes (including to
   *  `null`, once neither a prefix nor number is fully selected yet) — lets a caller
   *  display the text somewhere outside this field's own layout instead of via
   *  `descriptionPosition`. Split into its two parts (rather than the single joined
   *  "{department} — {reason}" string `descriptionPosition` itself renders) so a caller can
   *  lay them out across two lines — `HoldPanel` (2026-08-03 follow-up) is the only caller
   *  today; every other caller leaves it unset. */
  onResolvedDescriptionChange?: (resolved: { department: string; reason: string } | null) => void;
}

/**
 * Shared reason-code entry (issue #84 full redesign) — three parts: a department/role
 * letter selector (always defaults to the worker's own home department once options load,
 * locked/non-interactive if that's their only accessible prefix; otherwise a small
 * dropdown, session-sticky across every ReasonCodeField for the rest of the login session
 * via `ReasonCodeSessionContext` — change it once anywhere and it stays changed everywhere
 * until next login), a 2-digit reason-number entry with a dropdown helper (same
 * `CodePickerField` pattern as Storage Code/Size, now `strict` so an unrecognized value is
 * rejected instead of silently accepted — closes the old free-text
 * bypass this component used to have), and a read-only resolved-description display.
 * Options are fetched live per-user from `GET /api/reason-codes` (`useReasonCodes`) —
 * replaces the previous flat, unvalidated hardcoded-list design entirely.
 *
 * External contract is unchanged from before this redesign (a single combined string
 * value/onChange, e.g. "W01") — minimal disruption for every existing caller's own
 * `useState('')`. The two-part split only happens internally and at the API boundary
 * (write paths accept `reasonPrefix`/`reasonNumber` separately — see each caller).
 */
export function ReasonCodeField({ domain, value, onChange, size = 'default', label = 'Reason Code', disabled = false, defaultNumber, descriptionPosition = 'below', onResolvedDescriptionChange }: ReasonCodeFieldProps) {
  const data = useReasonCodes(domain);
  const { selectedPrefix, setSelectedPrefix } = useReasonCodeSession();

  const initial = value ? splitReasonCode(value) : null;
  const [prefix, setPrefix] = useState(initial?.prefix ?? selectedPrefix ?? '');
  const [number, setNumber] = useState(initial?.number ?? '');

  // A caller can hand in a fresh pre-filled `value` after this field already mounted (e.g.
  // MNP's/STG's own defaults) — resync local state when that happens.
  useEffect(() => {
    if (!value) return;
    const split = splitReasonCode(value);
    setPrefix(split.prefix);
    setNumber(split.number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const prefixOptions = (data?.prefixes ?? []).map((p) => ({ code: p.letter, desc: p.desc }));
  const locked = prefixOptions.length === 1;

  // Default the prefix to the worker's own home department once the fetch resolves,
  // whenever nothing else has already set one (issue #84 follow-up, direct instruction) —
  // not just when locked to a single option. `GET /api/reason-codes` sorts the home
  // department first specifically so index 0 is always the right default here. If a
  // `defaultNumber` was also supplied, pre-fill it at the same time and report the full
  // combined default up to the caller — otherwise the parent's own `value` stays empty
  // even though this field now visibly shows a default.
  useEffect(() => {
    if (prefix || prefixOptions.length === 0) return;
    const defaultPrefix = prefixOptions[0].code;
    setPrefix(defaultPrefix);
    setSelectedPrefix(defaultPrefix);
    if (defaultNumber) {
      setNumber(defaultNumber);
      onChange(combineReasonCode(defaultPrefix, defaultNumber));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixOptions.length]);

  const reasonOptions = (data?.reasons ?? [])
    .filter((r) => r.restrictedToPrefixes == null || (!!prefix && r.restrictedToPrefixes.includes(prefix)))
    .map((r) => ({ code: r.number, desc: r.desc }));

  function handlePrefixChange(newPrefix: string) {
    setPrefix(newPrefix);
    setSelectedPrefix(newPrefix);
    setNumber('');
  }

  function handleNumberChange(newNumber: string) {
    setNumber(newNumber);
    if (prefix) onChange(combineReasonCode(prefix, newNumber));
  }

  const resolvedParts = (() => {
    const p = data?.prefixes.find((x) => x.letter === prefix);
    const r = data?.reasons.find((x) => x.number === number);
    return p && r ? { department: p.desc, reason: r.desc } : null;
  })();
  const resolvedDesc = resolvedParts ? `${resolvedParts.department} — ${resolvedParts.reason}` : null;

  useEffect(() => {
    onResolvedDescriptionChange?.(resolvedParts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParts?.department, resolvedParts?.reason]);

  const gap = size === 'compact' ? 'gap-1.5' : 'gap-2';

  return (
    <div className={`flex flex-col ${gap}`}>
      {label && (
        <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">
          {label}
        </span>
      )}
      {descriptionPosition === 'above' && resolvedDesc && (
        <span className="font-ui text-[13px] text-[#CFCFCF]">{resolvedDesc}</span>
      )}
      <div className={`flex items-end ${gap}`}>
        {/* Wider than a bare single-letter box would need, but ~20px narrower than the
            reason-number box beside it (2026-08-03, direct instruction after an initial
            ~3x-wider pass ran too big) — a better touch target on a kiosk without
            dominating the pair. */}
        <CodePickerField
          value={prefix}
          onChange={handlePrefixChange}
          options={prefixOptions}
          optionsLoading={data === null}
          panel="keyboard"
          maxLength={1}
          transform={(v) => v.toUpperCase()}
          size={size}
          width={size === 'compact' ? 'w-[100px]' : 'w-[140px]'}
          ariaLabel="Reason Prefix"
          disabled={disabled || locked}
          strict
          onInvalid={() => setPrefix('')}
        />
        <CodePickerField
          value={number}
          onChange={handleNumberChange}
          options={reasonOptions}
          optionsLoading={data === null}
          panel="numpad"
          maxLength={2}
          size={size}
          width={size === 'compact' ? 'w-[120px]' : 'w-[160px]'}
          ariaLabel="Reason Number"
          disabled={disabled || !prefix}
          strict
          onInvalid={() => setNumber('')}
        />
      </div>
      {descriptionPosition === 'below' && resolvedDesc && (
        <span className="font-ui text-[13px] text-[#CFCFCF]">{resolvedDesc}</span>
      )}
    </div>
  );
}
