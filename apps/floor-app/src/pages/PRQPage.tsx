import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NumpadFieldBox } from '../components/shared/NumpadFieldBox';
import { Dropdown } from '../components/shared/Dropdown';
import { StatusBadge } from '../components/shared/StatusBadge';
import { WorkstationField } from '../components/shared/WorkstationField';
import { useAuth } from '../context/AuthContext';
import { usePRQ, type PRQLevel } from '../context/PRQContext';
import { useMessageBar } from '../context/MessageBarContext';
import { apiFetch } from '../lib/api';
import { useAisleField } from '../lib/useAisleField';
import { useNumpadField } from '../lib/useNumpadField';

// ─── API response types ──────────────────────────────────────────────────────

interface SummaryRow {
  batchDate: number;
  pullFunction: string;
  aisle?: number;
  pallets: number;
  cartons: number;
  ssps: number;
  locations: number;
  density: number;
}

interface DetailLocation {
  aisle: number;
  bin: number;
  level: number;
  locationStatus: string | null;
  holdCategory: string | null;
  pid: number;
  palletStatus: string;
  dept: number;
  cls: number;
  item: number;
  upc: string;
  itemName: string;
  itemDesc: string;
  storageCode: string | null;
  palletVcp: number;
  palletSsp: number;
  palletCartons: number;
  palletPallets: number;
  palletSSPs: number;
  pullPallets: number;
  pullCartons: number;
  pullSSPs: number;
  containers: {
    cid: string;
    status: string;
    palletQuantity: number;
    cartonQuantity: number;
    sspQuantity: number;
    purgeDate: string;
  }[];
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Select —' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PRINTED', label: 'Printed' },
  { value: 'VERIFIED', label: 'Verified' },
];

const FUNCTION_LABELS: Record<string, string> = {
  CA: 'Carton Air',
  CF: 'Carton Floor',
  FP: 'Full Pallet',
  BK: 'Bulk',
};

function formatBatchDate(bd: number): string {
  const year = Math.floor(bd / 1000);
  const day = bd % 1000;
  const d = new Date(year, 0, day);
  return `${d.getMonth() + 1}/${d.getDate()}/${year}`;
}

function formatLocation(aisle: number, bin: number, level: number): string {
  return `${String(aisle).padStart(3, '0')}-${String(bin).padStart(3, '0')}-${String(level).padStart(2, '0')}`;
}

function formatDpci(dept: number, cls: number, item: number): string {
  return `${String(dept).padStart(3, '0')}-${String(cls).padStart(2, '0')}-${String(item).padStart(4, '0')}`;
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function PRQFilterBar() {
  const { token } = useAuth();
  const { filters, setFilters, currentLevel, setCurrentLevel, setSelectedIndex } = usePRQ();
  const { setMessage } = useMessageBar();

  const aisleStart = useAisleField({
    fetch: async (aisle) => {
      const res = await apiFetch<{ exists: boolean; breakdown: unknown[] }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!);
      return { exists: res.exists, breakdown: [] };
    },
    onResolved: (aisle) => {
      setFilters((f) => ({ ...f, aisleStart: aisle, workstation: '' }));
    },
    onNotFound: (aisle) => {
      setMessage({ type: 'error', text: `Aisle ${aisle} does not exist` });
    },
  });

  const aisleEnd = useAisleField({
    fetch: async (aisle) => {
      const res = await apiFetch<{ exists: boolean; breakdown: unknown[] }>(`/api/locations/aisle-exists?aisle=${aisle}`, token!);
      return { exists: res.exists, breakdown: [] };
    },
    onResolved: (aisle) => {
      if (filters.aisleStart && parseInt(aisle, 10) <= parseInt(filters.aisleStart, 10)) {
        setMessage({ type: 'error', text: 'End aisle must be higher than the start aisle.' });
        return;
      }
      setFilters((f) => ({ ...f, aisleEnd: aisle, workstation: '' }));
    },
    onNotFound: (aisle) => {
      setMessage({ type: 'error', text: `Aisle ${aisle} does not exist` });
    },
  });

  const binStartField = useNumpadField('numpad', 3, true);
  const binEndField = useNumpadField('numpad', 3, true);
  const levelField = useNumpadField('numpad', 2, true);

  const handleWorkstationChange = useCallback((ws: string) => {
    setFilters((f) => ({ ...f, workstation: ws, aisleStart: '', aisleEnd: '' }));
    if (ws) {
      aisleStart.clear();
      aisleEnd.clear();
    }
  }, [setFilters, aisleStart, aisleEnd]);

  const handleStatusChange = useCallback((s: string) => {
    setFilters((f) => ({ ...f, status: s }));
    setCurrentLevel(1);
    setSelectedIndex(null);
  }, [setFilters, setCurrentLevel, setSelectedIndex]);

  const handleBack = useCallback(() => {
    if (currentLevel > 1) {
      setCurrentLevel((currentLevel - 1) as PRQLevel);
      setSelectedIndex(null);
    }
  }, [currentLevel, setCurrentLevel, setSelectedIndex]);

  return (
    <div className="shrink-0 flex flex-wrap items-end gap-4">
      {/* Aisle fields */}
      <NumpadFieldBox
        value={filters.aisleStart || aisleStart.field.value}
        onFocus={() => aisleStart.focusField()}
        label="Aisle"
        active={aisleStart.field.isActive}
        invalid={aisleStart.invalid}
        width="w-[100px]"
        boxClass="h-[52px] px-3 rounded-[10px]"
        valueClass="text-[24px] font-semibold"
        caretClass="w-[2px] h-[28px]"
        labelClass="text-[12px]"
      />
      <NumpadFieldBox
        value={filters.aisleEnd || aisleEnd.field.value}
        onFocus={() => aisleEnd.focusField()}
        label="End Aisle"
        active={aisleEnd.field.isActive}
        invalid={aisleEnd.invalid}
        width="w-[100px]"
        boxClass="h-[52px] px-3 rounded-[10px]"
        valueClass="text-[24px] font-semibold"
        caretClass="w-[2px] h-[28px]"
        labelClass="text-[12px]"
      />

      <div className="flex flex-col gap-1">
        <span className="font-ui text-[12px] font-medium text-[#9A9A9A] uppercase tracking-wider">Or</span>
      </div>

      <WorkstationField
        value={filters.workstation}
        onChange={handleWorkstationChange}
        size="compact"
        label="Workstation"
      />

      <Dropdown
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={handleStatusChange}
        label="Status"
      />

      {/* Level indicators + back button */}
      {currentLevel > 1 && (
        <button
          type="button"
          onClick={handleBack}
          className="h-[52px] px-5 rounded-[10px] border border-[#3A3A3A] font-ui text-[14px] font-semibold text-[#9A9A9A] uppercase tracking-wider hover:border-[#555] hover:text-white transition-colors"
        >
          ← Back
        </button>
      )}

      {/* L3 filters */}
      {currentLevel === 3 && (
        <>
          <NumpadFieldBox
            value={binStartField.value}
            onFocus={() => binStartField.focus((v: string) => {
              setFilters((f) => ({ ...f, binStart: v }));
            })}
            label="Bin Start"
            active={binStartField.isActive}
            width="w-[90px]"
            boxClass="h-[52px] px-3 rounded-[10px]"
            valueClass="text-[24px] font-semibold"
            caretClass="w-[2px] h-[28px]"
            labelClass="text-[12px]"
          />
          <NumpadFieldBox
            value={binEndField.value}
            onFocus={() => binEndField.focus((v: string) => {
              setFilters((f) => ({ ...f, binEnd: v }));
            })}
            label="Bin End"
            active={binEndField.isActive}
            width="w-[90px]"
            boxClass="h-[52px] px-3 rounded-[10px]"
            valueClass="text-[24px] font-semibold"
            caretClass="w-[2px] h-[28px]"
            labelClass="text-[12px]"
          />
          <NumpadFieldBox
            value={levelField.value}
            onFocus={() => levelField.focus((v: string) => {
              setFilters((f) => ({ ...f, level: v }));
            })}
            label="Level"
            active={levelField.isActive}
            width="w-[70px]"
            boxClass="h-[52px] px-3 rounded-[10px]"
            valueClass="text-[24px] font-semibold"
            caretClass="w-[2px] h-[28px]"
            labelClass="text-[12px]"
          />
        </>
      )}
    </div>
  );
}

// ─── Summary line ────────────────────────────────────────────────────────────

function SummaryLine() {
  const { filters, currentLevel } = usePRQ();

  const scope = filters.workstation
    ? `Workstation ${filters.workstation}`
    : filters.aisleEnd
      ? `Aisles ${filters.aisleStart}–${filters.aisleEnd}`
      : `Aisle ${filters.aisleStart}`;

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status;

  const extra = currentLevel >= 2 && filters.batchDate
    ? ` — Batch: ${formatBatchDate(filters.batchDate)} — ${FUNCTION_LABELS[filters.pullFunction] ?? filters.pullFunction}`
    : '';

  return (
    <div className="shrink-0 font-ui text-[14px] text-[#9A9A9A] px-1">
      {scope} — Status: {statusLabel}{extra}
    </div>
  );
}

// ─── L1: Summary table ──────────────────────────────────────────────────────

function L1SummaryTable({ rows, onZoomIn }: { rows: SummaryRow[]; onZoomIn: (row: SummaryRow) => void }) {
  const { selectedIndex, setSelectedIndex } = usePRQ();

  const grouped = useMemo(() => {
    const map = new Map<number, SummaryRow[]>();
    for (const r of rows) {
      const existing = map.get(r.batchDate) ?? [];
      existing.push(r);
      map.set(r.batchDate, existing);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  let globalIdx = 0;

  return (
    <div className="flex-1 border border-[#2A2A2A] rounded-[12px] overflow-hidden overflow-y-auto">
      {grouped.map(([batchDate, fnRows]) => (
        <div key={batchDate}>
          <div className="sticky top-0 bg-[#0A0A0A] px-5 py-2 border-b border-[#2A2A2A]">
            <span className="font-ui text-[14px] font-semibold text-[#CFCFCF]">
              Batch Date: {formatBatchDate(batchDate)}
            </span>
          </div>
          {fnRows.map((row) => {
            const idx = globalIdx++;
            const selected = selectedIndex === idx;
            return (
              <button
                key={`${row.batchDate}-${row.pullFunction}`}
                type="button"
                onClick={() => setSelectedIndex(selected ? null : idx)}
                onDoubleClick={() => onZoomIn(row)}
                className={`w-full flex items-start gap-6 px-5 py-3 border-b border-[#1A1A1A] text-left transition-colors ${
                  selected ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'
                }`}
              >
                <span className="font-ui text-[15px] font-semibold text-white w-[120px] shrink-0">
                  {FUNCTION_LABELS[row.pullFunction] ?? row.pullFunction}
                </span>
                <div className="flex-1 font-data text-[15px] text-[#CFCFCF]">
                  {row.pullFunction === 'BK' ? (
                    <div className="flex flex-col gap-1">
                      <span>Full Pallets: {row.pallets}   Pallet Density: {row.locations > 0 ? (row.pallets / row.locations).toFixed(1) : '0.0'}</span>
                      <span>Loose Cartons: {row.cartons}   Carton Density: {row.locations > 0 ? (row.cartons / row.locations).toFixed(1) : '0.0'}</span>
                      <span>Locations: {row.locations}</span>
                    </div>
                  ) : (
                    <span>Cartons: {row.cartons}   Locations: {row.locations}   Density: {row.density.toFixed(1)}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
      {rows.length === 0 && (
        <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No pull data found for the current filters.</p>
      )}
    </div>
  );
}

// ─── L2: Per-aisle breakdown ─────────────────────────────────────────────────

function L2AisleTable({ rows, onZoomIn }: { rows: SummaryRow[]; onZoomIn: (row: SummaryRow) => void }) {
  const { selectedIndex, setSelectedIndex, filters } = usePRQ();

  return (
    <div className="flex-1 flex flex-col gap-2 overflow-hidden">
      {filters.batchDate && (
        <div className="shrink-0 px-1 font-ui text-[13px] text-[#9A9A9A]">
          Batch Date: {formatBatchDate(filters.batchDate)}   Function: {FUNCTION_LABELS[filters.pullFunction] ?? filters.pullFunction}
        </div>
      )}
      <div className="flex-1 border border-[#2A2A2A] rounded-[12px] overflow-hidden overflow-y-auto">
        {rows.map((row, idx) => {
          const selected = selectedIndex === idx;
          return (
            <button
              key={row.aisle}
              type="button"
              onClick={() => setSelectedIndex(selected ? null : idx)}
              onDoubleClick={() => onZoomIn(row)}
              className={`w-full flex items-start gap-6 px-5 py-3 border-b border-[#1A1A1A] text-left transition-colors ${
                selected ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'
              }`}
            >
              <span className="font-ui text-[15px] font-semibold text-white w-[100px] shrink-0">
                Aisle {row.aisle}
              </span>
              <div className="flex-1 font-data text-[15px] text-[#CFCFCF]">
                {row.pullFunction === 'BK' ? (
                  <div className="flex flex-col gap-1">
                    <span>Full Pallets: {row.pallets}   Pallet Density: {row.locations > 0 ? (row.pallets / row.locations).toFixed(1) : '0.0'}</span>
                    <span>Loose Cartons: {row.cartons}   Carton Density: {row.locations > 0 ? (row.cartons / row.locations).toFixed(1) : '0.0'}</span>
                    <span>Locations: {row.locations}</span>
                  </div>
                ) : (
                  <span>Cartons: {row.cartons}   Locations: {row.locations}   Density: {row.density.toFixed(1)}</span>
                )}
              </div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No aisles with data for this selection.</p>
        )}
      </div>
    </div>
  );
}

// ─── L3: Location-level table ────────────────────────────────────────────────

function L3LocationTable({ locations, onOpenDetail }: { locations: DetailLocation[]; onOpenDetail: (loc: DetailLocation) => void }) {
  const { selectedIndex, setSelectedIndex } = usePRQ();

  return (
    <div className="flex-1 border border-[#2A2A2A] rounded-[12px] overflow-hidden overflow-y-auto">
      {locations.map((loc, idx) => {
        const selected = selectedIndex === idx;
        return (
          <button
            key={`${loc.aisle}-${loc.bin}-${loc.level}`}
            type="button"
            onClick={() => setSelectedIndex(selected ? null : idx)}
            onDoubleClick={() => onOpenDetail(loc)}
            className={`w-full flex items-center gap-6 px-5 py-3 border-b border-[#1A1A1A] text-left transition-colors ${
              selected ? 'bg-[#1A2A3A]' : 'hover:bg-[#111111]'
            }`}
          >
            <span className="font-data text-[16px] font-semibold text-white w-[120px] shrink-0">
              {formatLocation(loc.aisle, loc.bin, loc.level)}
            </span>
            <span className="font-data text-[15px] text-[#CFCFCF]">
              Cartons: {loc.pullCartons}   Pallets: {loc.pullPallets}   SSPs: {loc.pullSSPs}
            </span>
          </button>
        );
      })}
      {locations.length === 0 && (
        <p className="px-5 py-4 font-ui text-[15px] text-[#555]">No locations with data for this selection.</p>
      )}
    </div>
  );
}

// ─── Pull Detail Popup ───────────────────────────────────────────────────────

function PullDetailPopup({ location, filters, onClose }: { location: DetailLocation; filters: { batchDate: number; pullFunction: string }; onClose: () => void }) {
  const navigate = useNavigate();
  const dpci = formatDpci(location.dept, location.cls, location.item);
  const locStr = formatLocation(location.aisle, location.bin, location.level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-[90%] max-w-[900px] max-h-[85vh] bg-[#0D0D0D] border border-[#3A3A3A] rounded-[16px] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-[#2A2A2A] flex items-start justify-between">
          <div className="flex gap-8">
            {/* Location column */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/location', { state: { fromPRQ: true, aisle: location.aisle, bin: location.bin, level: location.level } })}
                className="font-data text-[18px] font-semibold text-[#4499FF] hover:underline"
              >
                {locStr}
              </button>
              <span className="font-ui text-[12px] text-[#9A9A9A]">
                {location.locationStatus ?? '—'}{location.holdCategory ? ` (${location.holdCategory})` : ''}
              </span>
            </div>
            {/* DPCI column */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/item', { state: { fromPRQ: true, dept: location.dept, cls: location.cls, item: location.item } })}
                className="font-data text-[18px] font-semibold text-[#4499FF] hover:underline"
              >
                {dpci}
              </button>
              <span className="font-ui text-[12px] text-[#9A9A9A] max-w-[260px] truncate">{location.upc} — {location.itemDesc}</span>
              {location.storageCode && (
                <span className="font-ui text-[11px] text-[#666]">Storage: {location.storageCode}</span>
              )}
            </div>
            {/* Pallet column */}
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('/pallet', { state: { fromPRQ: true, pid: location.pid } })}
                className="font-data text-[18px] font-semibold text-[#4499FF] hover:underline"
              >
                PID {location.pid}
              </button>
              <span className="font-ui text-[12px] text-[#9A9A9A]">
                <StatusBadge status={location.palletStatus} /> — {location.palletCartons} ctns, VPC {location.palletVcp}/SSP {location.palletSsp}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-ui text-[20px] text-[#9A9A9A] hover:text-white px-2"
          >
            ✕
          </button>
        </div>

        {/* Pull metadata */}
        <div className="shrink-0 px-6 py-3 border-b border-[#1A1A1A] flex gap-8 font-data text-[14px] text-[#CFCFCF]">
          <span>Pull Type: {FUNCTION_LABELS[filters.pullFunction] ?? filters.pullFunction}</span>
          <span>Batch Date: {formatBatchDate(filters.batchDate)}</span>
          <span>Pull Qty: {location.pullPallets} plt / {location.pullCartons} ctn / {location.pullSSPs} ssp</span>
        </div>

        {/* Container list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-3">
            <h3 className="font-ui text-[13px] font-semibold text-[#9A9A9A] uppercase tracking-wider mb-2">Containers</h3>
            {location.containers.length === 0 ? (
              <p className="font-ui text-[14px] text-[#555]">No containers.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {location.containers.map((c) => (
                  <div key={c.cid} className="flex items-center gap-4 px-3 py-2 rounded-[8px] bg-[#0A0A0A] border border-[#1A1A1A]">
                    <button
                      type="button"
                      onClick={() => navigate('/container', { state: { fromPRQ: true, cid: c.cid } })}
                      className="font-data text-[14px] text-[#4499FF] hover:underline flex-1 text-left"
                    >
                      {c.cid}
                    </button>
                    <StatusBadge status={c.status} />
                    <span className="font-data text-[13px] text-[#9A9A9A]">
                      {c.cartonQuantity} ctn / {c.palletQuantity} plt / {c.sspQuantity} ssp
                    </span>
                    <span className="font-data text-[12px] text-[#666]">Purge: {c.purgeDate}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Zoom-in button ──────────────────────────────────────────────────────────

function ZoomInButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 h-[44px] px-6 rounded-[10px] font-ui text-[14px] font-semibold uppercase tracking-wider transition-colors ${
        disabled
          ? 'border border-[#2A2A2A] text-[#3A3A3A] cursor-default'
          : 'border border-[#3A6BB0] bg-[#3A6BB030] text-[#6BA3E0] hover:bg-[#3A6BB050]'
      }`}
    >
      Zoom In ▸
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function PRQPage() {
  const { token } = useAuth();
  const { filters, setFilters, currentLevel, setCurrentLevel, selectedIndex, setSelectedIndex } = usePRQ();

  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [aisleRows, setAisleRows] = useState<SummaryRow[]>([]);
  const [detailLocations, setDetailLocations] = useState<DetailLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [popupLocation, setPopupLocation] = useState<DetailLocation | null>(null);

  const hasValidFilter = (filters.aisleStart || filters.workstation) && filters.status;
  const isRange = !!(filters.aisleEnd || filters.workstation);

  // L1: fetch summary whenever top-level filters change
  useEffect(() => {
    if (!hasValidFilter) { setSummaryRows([]); return; }
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.workstation) {
      params.set('workstation', filters.workstation);
    } else {
      params.set('aisleStart', filters.aisleStart);
      if (filters.aisleEnd) params.set('aisleEnd', filters.aisleEnd);
    }
    params.set('status', filters.status);

    apiFetch<{ rows: SummaryRow[] }>(`/api/pulls/summary?${params}`, token!)
      .then((res) => { if (!cancelled) { setSummaryRows(res.rows); setCurrentLevel(1); setSelectedIndex(null); } })
      .catch(() => { if (!cancelled) setSummaryRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.aisleStart, filters.aisleEnd, filters.workstation, filters.status]);

  // L2: fetch per-aisle breakdown
  const fetchL2 = useCallback((batchDate: number, pullFunction: string) => {
    if (!hasValidFilter) return;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.workstation) {
      params.set('workstation', filters.workstation);
    } else {
      params.set('aisleStart', filters.aisleStart);
      if (filters.aisleEnd) params.set('aisleEnd', filters.aisleEnd);
    }
    params.set('status', filters.status);
    params.set('batchDate', String(batchDate));
    params.set('pullFunction', pullFunction);
    params.set('byAisle', 'true');

    apiFetch<{ rows: SummaryRow[] }>(`/api/pulls/summary?${params}`, token!)
      .then((res) => { setAisleRows(res.rows); })
      .catch(() => setAisleRows([]))
      .finally(() => setLoading(false));
  }, [filters, hasValidFilter, token]);

  // L3: fetch location detail
  const fetchL3 = useCallback((batchDate: number, pullFunction: string, aisle?: number) => {
    if (!hasValidFilter) return;
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.workstation) {
      params.set('workstation', filters.workstation);
    } else {
      params.set('aisleStart', filters.aisleStart);
      if (filters.aisleEnd) params.set('aisleEnd', filters.aisleEnd);
    }
    params.set('status', filters.status);
    params.set('batchDate', String(batchDate));
    params.set('pullFunction', pullFunction);
    if (aisle != null) params.set('aisle', String(aisle));
    if (filters.binStart) params.set('binStart', filters.binStart);
    if (filters.binEnd) params.set('binEnd', filters.binEnd);
    if (filters.level) params.set('level', filters.level);

    apiFetch<{ locations: DetailLocation[] }>(`/api/pulls/detail?${params}`, token!)
      .then((res) => setDetailLocations(res.locations))
      .catch(() => setDetailLocations([]))
      .finally(() => setLoading(false));
  }, [filters, hasValidFilter, token]);

  // L1 zoom-in handler
  const handleL1ZoomIn = useCallback((row: SummaryRow) => {
    setFilters((f) => ({ ...f, batchDate: row.batchDate, pullFunction: row.pullFunction }));
    setSelectedIndex(null);

    if (isRange) {
      setCurrentLevel(2);
      fetchL2(row.batchDate, row.pullFunction);
    } else {
      setCurrentLevel(3);
      fetchL3(row.batchDate, row.pullFunction);
    }
  }, [isRange, setFilters, setCurrentLevel, setSelectedIndex, fetchL2, fetchL3]);

  // L2 zoom-in handler
  const handleL2ZoomIn = useCallback((row: SummaryRow) => {
    if (row.aisle == null) return;
    setFilters((f) => ({ ...f, drillAisle: row.aisle! }));
    setSelectedIndex(null);
    setCurrentLevel(3);
    fetchL3(filters.batchDate!, filters.pullFunction, row.aisle);
  }, [setFilters, setCurrentLevel, setSelectedIndex, fetchL3, filters.batchDate, filters.pullFunction]);

  // Zoom-in from current selection
  const handleZoomIn = useCallback(() => {
    if (selectedIndex == null) return;

    if (currentLevel === 1) {
      const row = summaryRows[selectedIndex];
      if (row) handleL1ZoomIn(row);
    } else if (currentLevel === 2) {
      const row = aisleRows[selectedIndex];
      if (row) handleL2ZoomIn(row);
    } else if (currentLevel === 3) {
      const loc = detailLocations[selectedIndex];
      if (loc) setPopupLocation(loc);
    }
  }, [currentLevel, selectedIndex, summaryRows, aisleRows, detailLocations, handleL1ZoomIn, handleL2ZoomIn]);

  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-6 select-none">
      <PRQFilterBar />

      {!hasValidFilter ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-ui text-[16px] text-[#555]">
            Select an aisle or range and a container status to see information.
          </p>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-ui text-[15px] text-[#9A9A9A] animate-pulse">Loading…</p>
        </div>
      ) : (
        <>
          <SummaryLine />

          <div className="flex items-center gap-3 shrink-0">
            <span className="font-ui text-[13px] font-semibold text-[#666] uppercase tracking-wider">
              Level {currentLevel}
            </span>
            <ZoomInButton disabled={selectedIndex == null} onClick={handleZoomIn} />
          </div>

          {currentLevel === 1 && (
            <L1SummaryTable rows={summaryRows} onZoomIn={handleL1ZoomIn} />
          )}
          {currentLevel === 2 && (
            <L2AisleTable rows={aisleRows} onZoomIn={handleL2ZoomIn} />
          )}
          {currentLevel === 3 && (
            <L3LocationTable locations={detailLocations} onOpenDetail={setPopupLocation} />
          )}
        </>
      )}

      {popupLocation && filters.batchDate && (
        <PullDetailPopup
          location={popupLocation}
          filters={{ batchDate: filters.batchDate, pullFunction: filters.pullFunction }}
          onClose={() => setPopupLocation(null)}
        />
      )}
    </div>
  );
}
