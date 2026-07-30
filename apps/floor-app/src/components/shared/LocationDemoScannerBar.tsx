import { useState } from 'react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import { useStorageCodes } from '../../lib/useStorageCodes';
import { useSizes } from '../../lib/useSizes';
import {
  INVALID_LOCATION_ID, LOCATION_STATUS_OPTIONS, HOLD_OPTIONS, CONTRACTION_OPTIONS, MULTI_OCCUPANT_OPTIONS,
  fetchValidLocation, fetchLocationByFilter, fetchWrongTypeLocation, fetchConsolidateLocation,
  type LocationStatusFilter, type HoldFilter, type ContractionFilter, type MultiOccupantFilter,
} from '../../lib/demoScanner';

const ANY = '';

interface LocationDemoScannerBarProps {
  /** Fills the resolved location — a 6-digit Aisle+Bin id plus the exact level of the row
   *  actually picked (both real results), or an already-complete 8-digit id with `level`
   *  omitted (the Invalid sentinel, which needs no assembly). Owned internally by
   *  `LocationEntryFields` (`demoScanner` opt-in), which decides how to splice `level` in
   *  based on its own `levelOptional` — mirrors Pallet ID's `onFill` contract, one field
   *  further in since Location's demo endpoint never returns a full id itself. */
  onFill: (locationId: string, level?: number) => void;
  /** PAR's own "Wrong Storage Type" option (direct instruction) — only rendered when the
   *  host screen supplies the already-resolved item's own Storage Code; omitted (LII/MNP/
   *  WLH) hides the option entirely rather than showing something that can't run. */
  itemStorageCode?: string;
  /** MNP's own "Consolidate" option — only rendered when the host screen supplies the
   *  already-scanned pallet's own id; omitted (LII/PAR/WLH) hides the option entirely. */
  scannedPalletId?: number;
}

/**
 * Location ID's Demo Scanner (Feature 9, Phase 2) — the generalized pattern (Valid /
 * Filter popup / Invalid, plus two screen-supplied escape-hatch options) replacing every
 * screen's own hand-rolled Location ID demo buttons (WLH/LII/MNP/PAR — PIP/SDP's own
 * Location ✓/✗ buttons stay screen-owned, see Feature-9-AppWide-Demo-Scanner.md's
 * Implementation-detail resolutions: they test "does this scan match what's already
 * loaded," not "find a location matching these filters," a fundamentally different
 * semantic no filter combination can express).
 *
 * The Filter popup's four axes (Status/Hold/Contraction/Multi-Occupant) are independent
 * and combine freely, plus Storage Code/Size/Zone/Aisle/Level filters — matching the
 * design doc's Location ID section exactly. Storage Code/Size options come from the real
 * lookup tables (`useStorageCodes`/`useSizes`), per the design doc's Real-Data Principle;
 * Zone/Aisle/Level are free-text numeric filters since there's no small fixed set to
 * choose from.
 */
export function LocationDemoScannerBar({ onFill, itemStorageCode, scannedPalletId }: LocationDemoScannerBarProps) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const storageCodes = useStorageCodes();
  const sizes = useSizes();

  const [popupOpen, setPopupOpen] = useState(false);
  const [status, setStatus] = useState<LocationStatusFilter>('any');
  const [hold, setHold] = useState<HoldFilter>('any');
  const [contraction, setContraction] = useState<ContractionFilter>('any');
  const [multiOccupant, setMultiOccupant] = useState<MultiOccupantFilter>('any');
  const [storageCode, setStorageCode] = useState(ANY);
  const [size, setSize] = useState(ANY);
  const [zone, setZone] = useState('');
  const [aisle, setAisle] = useState('');
  const [level, setLevel] = useState('');

  function fail(text = 'Demo location unavailable') {
    setMessage({ type: 'error', text });
  }

  async function fillValid() {
    try {
      const { locationId, level } = await fetchValidLocation(token!);
      onFill(locationId, level);
    } catch { fail(); }
  }

  function fillInvalid() {
    onFill(INVALID_LOCATION_ID);
  }

  async function find() {
    try {
      const result = await fetchLocationByFilter(token!, {
        status, hold, contraction, multiOccupant,
        storageCode: storageCode || undefined,
        size: size || undefined,
        zone: zone || undefined,
        aisle: aisle || undefined,
        level: level || undefined,
      });
      onFill(result.locationId, result.level);
      setPopupOpen(false);
    } catch { fail(); }
  }

  async function fillWrongType() {
    if (!itemStorageCode) return;
    try {
      const { locationId, level } = await fetchWrongTypeLocation(token!, itemStorageCode);
      onFill(locationId, level);
    } catch { fail(); }
  }

  async function fillConsolidate() {
    if (scannedPalletId == null) return;
    try {
      const { locationId, level } = await fetchConsolidateLocation(token!, scannedPalletId);
      onFill(locationId, level);
    } catch { fail('No consolidate match found'); }
  }

  const storageCodeOptions = [
    { value: ANY, label: 'Any' },
    ...(storageCodes ?? []).map((c) => ({ value: c.code, label: c.desc })),
  ];
  const sizeOptions = [
    { value: ANY, label: 'Any' },
    ...(sizes ?? []).map((s) => ({ value: s.code, label: s.desc })),
  ];

  const numberInputClass = 'w-full h-[44px] px-4 rounded-[8px] bg-[#0D0D0D] border border-[#3A3A3A] font-data text-[18px] font-medium text-white focus:outline-none focus:border-[#555]';

  return (
    <>
      <button
        type="button"
        onClick={() => void fillValid()}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors"
      >
        ✓ Valid Location
      </button>
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors"
      >
        Location by Filter
      </button>
      {itemStorageCode && (
        <button
          type="button"
          onClick={() => void fillWrongType()}
          className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#664400] hover:bg-[#775500] text-white transition-colors"
        >
          Wrong Storage Type
        </button>
      )}
      {scannedPalletId != null && (
        <button
          type="button"
          onClick={() => void fillConsolidate()}
          className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors"
        >
          ⇄ Consolidate
        </button>
      )}
      <button
        type="button"
        onClick={fillInvalid}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors"
      >
        ✗ Invalid Location
      </button>

      {popupOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[460px] shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-ui text-[19px] font-semibold text-white text-center">Find a Location</h2>

            <div className="flex flex-col gap-3">
              <Dropdown label="Status" value={status} onChange={setStatus} options={LOCATION_STATUS_OPTIONS} />
              <Dropdown label="Hold" value={hold} onChange={setHold} options={HOLD_OPTIONS} />
              <Dropdown label="Contraction" value={contraction} onChange={setContraction} options={CONTRACTION_OPTIONS} />
              <Dropdown label="Multi-Occupant" value={multiOccupant} onChange={setMultiOccupant} options={MULTI_OCCUPANT_OPTIONS} />
              <Dropdown label="Storage Code" value={storageCode} onChange={setStorageCode} options={storageCodeOptions} disabled={!storageCodes} />
              <Dropdown label="Size" value={size} onChange={setSize} options={sizeOptions} disabled={!sizes} />

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Zone</span>
                  <input type="text" inputMode="numeric" value={zone} onChange={(e) => setZone(e.target.value.replace(/\D/g, ''))} placeholder="Any" className={numberInputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Aisle</span>
                  <input type="text" inputMode="numeric" value={aisle} onChange={(e) => setAisle(e.target.value.replace(/\D/g, ''))} placeholder="Any" className={numberInputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-ui text-[13px] font-medium text-[#9A9A9A] uppercase tracking-wider">Level</span>
                  <input type="text" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))} placeholder="Any" className={numberInputClass} />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void find()}
              className="h-[48px] rounded-[10px] bg-[#CC0000] hover:bg-[#DD0000] font-ui text-[16px] font-semibold text-white transition-colors"
            >
              Find
            </button>
            <button
              type="button"
              onClick={() => setPopupOpen(false)}
              className="h-[44px] rounded-[10px] border border-[#3A3A3A] font-ui text-[15px] font-medium text-white hover:bg-[#1A1A1A] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
