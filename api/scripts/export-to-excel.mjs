/**
 * Exports every table in the PalletIQ database to a single Excel workbook,
 * one sheet per table.  Run from the /api directory:
 *   node scripts/export-to-excel.mjs
 *
 * Output: scripts/palletiq-export-<YYYY-MM-DD>.xlsx
 */

import sql from 'mssql';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_CONFIG = {
  server:   'palletiq.database.windows.net',
  database: 'palletiq-db',
  user:     'z002p25',
  password: 'NukeUm85',
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

// Tables in the order we want them as sheets
const TABLES = [
  'StorageCode',
  'PackingZone',
  'Department',
  'HoldType',
  'Store',
  '[User]',
  'Item',
  'Location',
  'Pallet',
  'Label',
  'ActivityLog',
];

function sheetName(table) {
  return table.replace(/[\[\]]/g, '');
}

async function main() {
  console.log('Connecting to database…');
  const pool = await sql.connect(DB_CONFIG);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PalletIQ Export';
  workbook.created = new Date();

  for (const table of TABLES) {
    process.stdout.write(`  Exporting ${sheetName(table)}… `);
    let result;
    try {
      result = await pool.request().query(`SELECT * FROM ${table}`);
    } catch (err) {
      console.log(`SKIP (${err.message})`);
      continue;
    }

    const rows = result.recordset;
    const cols = result.recordset.columns
      ? Object.keys(result.recordset.columns)
      : rows.length ? Object.keys(rows[0]) : [];

    const sheet = workbook.addWorksheet(sheetName(table));

    // Header row
    sheet.addRow(cols);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.commit();

    // Data rows
    for (const row of rows) {
      const values = cols.map(c => {
        const v = row[c];
        if (v instanceof Date) return v.toISOString();
        return v;
      });
      sheet.addRow(values);
    }

    // Auto-fit columns (capped at 60)
    sheet.columns.forEach(col => {
      let max = 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 60);
    });

    // Freeze the header
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    console.log(`${rows.length} rows`);
  }

  await pool.close();

  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(__dirname, `palletiq-export-${today}.xlsx`);
  await workbook.xlsx.writeFile(outPath);
  console.log(`\nSaved: ${outPath}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
