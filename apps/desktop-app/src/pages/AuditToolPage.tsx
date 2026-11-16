import { useEffect, useState } from 'react';
import type { AuditRef } from '@shared/audit';
import { AuditPane } from '../components/audit/AuditPane';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { auditFileSlug, buildAuditWorkbook, saveBlobAsFile } from '../lib/auditExport';
import type { AuditSheet } from '../lib/auditExport';
import { useAuditPanes } from '../lib/useAuditPanes';

/** Which panes a print job covers: one pane by index, or every pane. */
type PrintScope = number | 'all';

const headerButton =
  'h-9 rounded-md border border-[var(--border-strong)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-5)] disabled:opacity-40';

/**
 * Universal Audit / Cross-Reference (#148). Three panes side by side, each looking up a
 * Location, Pallet ID, DPCI, Container ID, zNumber or Aisle on its own. Identifiers in a
 * pane are chips that can be dragged onto, or sent to, any pane — so a pallet, the
 * location it sat in and the item on it can be read next to each other. Read-only.
 *
 * Print and Export exist per pane and for all panes together. Printing works by marking
 * which panes are in scope and letting the print stylesheet (index.css) hide the rest.
 */
export function AuditToolPage() {
  const { panes, lookup } = useAuditPanes();
  const [printScope, setPrintScope] = useState<PrintScope | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  // Print once the scope has been rendered into the DOM, then clear it when the print
  // dialog closes (afterprint fires for both "printed" and "cancelled").
  useEffect(() => {
    if (printScope === null) return;
    const clear = () => setPrintScope(null);
    window.addEventListener('afterprint', clear);
    window.print();
    return () => window.removeEventListener('afterprint', clear);
  }, [printScope]);

  /** Opens a cross-referenced record in the chosen pane. */
  function send(paneIndex: number, target: AuditRef) {
    lookup(paneIndex, target);
  }

  /** Builds and downloads a workbook for the given sheets; reports failure in the banner. */
  async function exportSheets(sheets: AuditSheet[], fileName: string) {
    setExportFailed(false);
    try {
      saveBlobAsFile(await buildAuditWorkbook(sheets), fileName);
    } catch {
      setExportFailed(true);
    }
  }

  const readySheets: AuditSheet[] = panes.flatMap((pane, index) =>
    pane.status === 'ready' ? [{ name: `Pane ${index + 1}`, result: pane.result }] : []
  );
  const anyReady = readySheets.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 print:h-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Audit Tool</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Look up three records side by side. Drag a highlighted identifier onto a pane, or click
            it, to open that record.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPrintScope('all')}
            disabled={!anyReady}
            className={headerButton}
          >
            Print All
          </button>
          <button
            type="button"
            onClick={() =>
              void exportSheets(readySheets, `audit-${new Date().toISOString().slice(0, 10)}.xlsx`)
            }
            disabled={!anyReady}
            className={headerButton}
          >
            Export All
          </button>
        </div>
      </div>

      {exportFailed && <ErrorBanner message="The export could not be created." />}

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 print:block">
        {panes.map((pane, index) => {
          // While printing, a pane outside the scope — or with nothing to print — is hidden.
          const hiddenInPrint =
            printScope !== null &&
            ((printScope !== 'all' && printScope !== index) || pane.status !== 'ready');
          return (
            <div
              key={index}
              className={[
                'flex min-h-0 min-w-0 flex-col print:mb-8',
                hiddenInPrint ? 'print:hidden' : '',
              ].join(' ')}
            >
              <AuditPane
                index={index}
                state={pane}
                onLookup={(query) => lookup(index, query)}
                onSend={send}
                onPrint={() => setPrintScope(index)}
                onExport={() => {
                  if (pane.status !== 'ready') return;
                  void exportSheets(
                    [{ name: `Pane ${index + 1}`, result: pane.result }],
                    `audit-${auditFileSlug(pane.result)}.xlsx`
                  );
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
