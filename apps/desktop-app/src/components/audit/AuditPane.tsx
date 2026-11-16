import { useState } from 'react';
import type { AuditRef } from '@shared/audit';
import type { AuditQuery } from '../../lib/auditApi';
import { isAuditRefDrag, readAuditRefDrop } from '../../lib/auditDrag';
import { AUDIT_ERROR_MESSAGES, AUDIT_FALLBACK_ERROR } from '../../lib/auditFormat';
import type { AuditPaneState } from '../../lib/useAuditPanes';
import { AuditLookupForm } from './AuditLookupForm';
import { AuditSummary } from './AuditSummary';
import { AuditTrail } from './AuditTrail';

interface AuditPaneProps {
  /** 0-based pane position. */
  index: number;
  state: AuditPaneState;
  /** Runs a lookup in this pane. */
  onLookup: (query: AuditQuery) => void;
  /** Opens a cross-referenced record in the chosen pane (possibly this one). */
  onSend: (paneIndex: number, target: AuditRef) => void;
  onPrint: () => void;
  onExport: () => void;
}

const actionButton =
  'h-8 rounded-md border border-[var(--border-strong)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-5)] disabled:opacity-40';

/**
 * One of the Audit Tool's three panes (#148): its own lookup control, the looked-up
 * record's summary and trail, and its own Print / Export. It is also a drop target — a
 * chip dropped anywhere on it replaces what it shows, with no confirmation.
 */
export function AuditPane({ index, state, onLookup, onSend, onPrint, onExport }: AuditPaneProps) {
  const [dropActive, setDropActive] = useState(false);
  const paneNumber = index + 1;
  const query = state.status === 'empty' ? null : state.query;
  const ready = state.status === 'ready';

  return (
    <section
      aria-label={`Pane ${paneNumber}`}
      data-audit-pane={index}
      onDragOver={(event) => {
        if (!isAuditRefDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropActive(true);
      }}
      onDragLeave={(event) => {
        // Ignore leaves into this pane's own children.
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        setDropActive(false);
        const target = readAuditRefDrop(event);
        if (!target) return;
        event.preventDefault();
        onLookup(target);
      }}
      className={[
        'flex min-h-0 min-w-0 flex-col gap-3 rounded-lg border bg-[var(--surface-3)] p-3 print:border-0 print:p-0',
        dropActive ? 'border-[var(--info)]' : 'border-[var(--border-default)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 print:hidden">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Pane {paneNumber}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrint}
            disabled={!ready}
            aria-label={`Print Pane ${paneNumber}`}
            className={actionButton}
          >
            Print
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!ready}
            aria-label={`Export Pane ${paneNumber} to Excel`}
            className={actionButton}
          >
            Export
          </button>
        </div>
      </div>

      {/* Re-keyed by what the pane shows, so a chip sent here is reflected in the form. */}
      <AuditLookupForm
        key={query ? JSON.stringify(query) : 'empty'}
        paneNumber={paneNumber}
        current={query}
        busy={state.status === 'loading'}
        onLookup={onLookup}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 print:overflow-visible">
        {state.status === 'empty' && (
          <p className="text-sm text-[var(--text-muted)] print:hidden">
            Look something up, or drag a highlighted identifier here from another pane.
          </p>
        )}
        {state.status === 'loading' && (
          <p className="text-sm text-[var(--text-muted)]">Looking up…</p>
        )}
        {state.status === 'error' && (
          <p
            role="alert"
            className="rounded border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-2 text-sm text-[var(--error)]"
          >
            {AUDIT_ERROR_MESSAGES[state.errorCode] ?? AUDIT_FALLBACK_ERROR}
          </p>
        )}
        {state.status === 'ready' && (
          <div className="flex flex-col gap-4">
            <AuditSummary result={state.result} onSend={onSend} />
            <AuditTrail result={state.result} onSend={onSend} />
          </div>
        )}
      </div>
    </section>
  );
}
