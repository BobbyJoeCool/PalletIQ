import { useState } from 'react';
import type { FormEvent } from 'react';
import { AUDIT_ENTITY_TYPES } from '@shared/audit';
import type { AuditEntityType } from '@shared/audit';
import type { AuditQuery } from '../../lib/auditApi';
import { AUDIT_ID_PLACEHOLDERS, AUDIT_TYPE_LABELS } from '../../lib/auditFormat';

interface AuditLookupFormProps {
  /** 1-based pane number, used to give each pane's controls a distinct accessible name. */
  paneNumber: number;
  /** The query this pane is currently showing, if any — the form follows it. */
  current: AuditQuery | null;
  busy: boolean;
  onLookup: (query: AuditQuery) => void;
}

const inputClass =
  'h-9 min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 font-data text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-disabled)] focus:border-[var(--info)]';

/** The form's editable values: a query with every range field present as text. */
type Draft = Required<AuditQuery>;

/** @returns a draft for the given query, or a blank Pallet ID lookup if there is none */
function draftFor(query: AuditQuery | null): Draft {
  return {
    type: query?.type ?? 'PALLET',
    id: query?.id ?? '',
    binStart: query?.binStart ?? '',
    binEnd: query?.binEnd ?? '',
    levelStart: query?.levelStart ?? '',
    levelEnd: query?.levelEnd ?? '',
  };
}

/**
 * A pane's lookup control (#148): entity type, identifier, and — for an Aisle lookup —
 * optional bin and level ranges. Submits on Enter or the Look up button.
 *
 * When the pane is filled some other way (a chip dragged or sent to it), the form is
 * re-keyed by the parent so it shows what the pane is actually displaying.
 */
export function AuditLookupForm({ paneNumber, current, busy, onLookup }: AuditLookupFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(current));

  /** Updates one field of the draft. */
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.id.trim()) return;
    // Range fields only mean something for an aisle; never send them for anything else.
    onLookup(draft.type === 'AISLE' ? draft : { type: draft.type, id: draft.id });
  }

  const pane = `Pane ${paneNumber}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 print:hidden">
      <div className="flex gap-2">
        <select
          aria-label={`${pane} lookup type`}
          value={draft.type}
          onChange={(event) => set('type', event.target.value as AuditEntityType)}
          className={`${inputClass} font-ui shrink-0`}
        >
          {AUDIT_ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {AUDIT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <input
          aria-label={`${pane} identifier`}
          value={draft.id}
          onChange={(event) => set('id', event.target.value)}
          placeholder={AUDIT_ID_PLACEHOLDERS[draft.type]}
          spellCheck={false}
          autoCapitalize="none"
          className={`${inputClass} flex-1`}
        />
        <button
          type="submit"
          disabled={busy || !draft.id.trim()}
          className="h-9 shrink-0 rounded-md bg-[var(--red-primary)] px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Look up
        </button>
      </div>

      {draft.type === 'AISLE' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            Bins
            <input
              aria-label={`${pane} first bin`}
              value={draft.binStart}
              onChange={(e) => set('binStart', e.target.value)}
              inputMode="numeric"
              placeholder="from"
              className={`${inputClass} w-16`}
            />
            –
            <input
              aria-label={`${pane} last bin`}
              value={draft.binEnd}
              onChange={(e) => set('binEnd', e.target.value)}
              inputMode="numeric"
              placeholder="to"
              className={`${inputClass} w-16`}
            />
          </span>
          <span className="flex items-center gap-1.5">
            Levels
            <input
              aria-label={`${pane} first level`}
              value={draft.levelStart}
              onChange={(e) => set('levelStart', e.target.value)}
              inputMode="numeric"
              placeholder="from"
              className={`${inputClass} w-16`}
            />
            –
            <input
              aria-label={`${pane} last level`}
              value={draft.levelEnd}
              onChange={(e) => set('levelEnd', e.target.value)}
              inputMode="numeric"
              placeholder="to"
              className={`${inputClass} w-16`}
            />
          </span>
        </div>
      )}
    </form>
  );
}
