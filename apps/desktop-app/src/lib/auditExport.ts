import type { AuditResult } from '@shared/audit';
import { detailPairs, displayRefId, formatAuditTime, summaryValueText } from './auditFormat';

/**
 * Excel export for the Audit Tool (#148). One worksheet per pane: the record's summary
 * at the top, then its trail as a table. A single-pane export is a one-sheet workbook;
 * Export All puts every open pane in the same workbook as its own sheet.
 */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const TRAIL_COLUMNS = [
  'Time',
  'Source',
  'Action',
  'User',
  'Pallet',
  'Location',
  'DPCI',
  'Container ID',
  'Reason',
  'Details',
];
const TRAIL_COLUMN_WIDTHS = [20, 11, 16, 10, 10, 13, 13, 30, 8, 60];

/** One pane's contribution to a workbook. */
export interface AuditSheet {
  /** Worksheet tab name (e.g. "Pane 1"). */
  name: string;
  result: AuditResult;
}

/**
 * Builds an .xlsx file from one or more panes.
 *
 * @param sheets - the panes to include, in order
 * @returns the workbook as a Blob
 */
export async function buildAuditWorkbook(sheets: AuditSheet[]): Promise<Blob> {
  // Loaded on demand: the library is large and only needed when someone exports.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  for (const { name, result } of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = TRAIL_COLUMN_WIDTHS.map((width) => ({ width }));

    sheet.addRow([result.title]).font = { bold: true, size: 14 };
    for (const field of result.fields) sheet.addRow([field.label, summaryValueText(field)]);
    if (result.truncated) {
      sheet.addRow([`Trail limited to the most recent ${result.trail.length} entries.`]);
    }
    sheet.addRow([]);

    sheet.addRow(TRAIL_COLUMNS).font = { bold: true };
    for (const entry of result.trail) {
      sheet.addRow([
        formatAuditTime(entry.timestamp),
        entry.source,
        entry.action,
        entry.userId ?? '',
        entry.palletId ?? '',
        entry.location ? displayRefId({ type: 'LOCATION', id: entry.location }) : '',
        entry.dpci ?? '',
        entry.cid ?? '',
        entry.reason ?? '',
        detailPairs(entry)
          .map((pair) => `${pair.key}: ${pair.value}`)
          .join('; '),
      ]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

/**
 * Hands a file to the browser/Electron download flow under the given name.
 *
 * @param blob - file contents
 * @param fileName - suggested file name
 */
export function saveBlobAsFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been handed off, not during it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * @param result - a looked-up record
 * @returns a file-name-safe slug for it (e.g. `pallet-4471203`)
 */
export function auditFileSlug(result: AuditResult): string {
  return `${result.type}-${result.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
