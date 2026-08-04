import { useState } from 'react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import { useStorageCodes } from '../../lib/useStorageCodes';
import {
  INVALID_DPCI, INVALID_UPC, EXPIRATION_OPTIONS, HANDLING_OPTIONS,
  fetchItemByFilter, fetchValidItem,
} from '../../lib/demoScanner';
import type { ExpirationFilter, HandlingFilter } from '../../lib/demoScanner';

const ANY = '';

interface ItemDemoScannerBarProps {
  /** Which identifier this instance fills — `fetchValidItem`/`fetchItemByFilter` always
   *  resolve both `dpci` and `upc` together (one Item row), `idType` just picks which one
   *  to hand to `onFill`. */
  idType: 'dpci' | 'upc';
  /** Fills the resolved value into the owning field — exactly like a real scanner delivery. */
  onFill: (value: string) => void;
  /** Overrides the button/popup text (defaults to "DPCI"/"UPC" from `idType`) — PAR passes
   *  "Item" for its single combined group (direct instruction) rather than two separate
   *  DPCI/UPC groups, since it shows this bar unconditionally instead of gating on which of
   *  its two fields currently has focus. */
  label?: string;
}

/**
 * DPCI/UPC's Demo Scanner (Feature 9, DPCI/UPC phase) — the generalized 3-button pattern
 * (**Valid** / **by Filter** / **Invalid**) replacing IID/ISI's old unfiltered good/bad
 * pair and PAR's old 4-option `DemoPicker` (Valid/Valid w/ Expiration/Valid w/o
 * Expiration/Invalid). See `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md`'s
 * "DPCI / UPC" section for the full design — this doc covers the component's own mechanics.
 *
 * No Status dropdown — `Item` has no status column (confirmed, not worked around); the
 * middle button is **"{label} by Filter"**, matching `LocationDemoScannerBar`'s own
 * naming for the same reason.
 */
export function ItemDemoScannerBar({ idType, onFill, label }: ItemDemoScannerBarProps) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const storageCodes = useStorageCodes();

  const displayLabel = label ?? (idType === 'dpci' ? 'DPCI' : 'UPC');

  const [popupOpen, setPopupOpen] = useState(false);
  const [storageCode, setStorageCode] = useState(ANY);
  const [requiresExpirationDate, setRequiresExpirationDate] = useState<ExpirationFilter>('any');
  const [conveyable, setConveyable] = useState<HandlingFilter>('any');

  function fail() {
    setMessage({ type: 'error', text: 'Demo item unavailable' });
  }

  async function fillValid() {
    try {
      const item = await fetchValidItem(token!);
      onFill(idType === 'dpci' ? item.dpci : item.upc);
    } catch { fail(); }
  }

  function fillInvalid() {
    onFill(idType === 'dpci' ? INVALID_DPCI : INVALID_UPC);
  }

  async function find() {
    try {
      const item = await fetchItemByFilter(token!, { storageCode: storageCode || undefined, requiresExpirationDate, conveyable });
      onFill(idType === 'dpci' ? item.dpci : item.upc);
      setPopupOpen(false);
    } catch { fail(); }
  }

  const storageCodeOptions = [
    { value: ANY, label: 'Any' },
    ...(storageCodes ?? []).map((c) => ({ value: c.code, label: c.desc })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => void fillValid()}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors"
      >
        ✓ Valid {displayLabel}
      </button>
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors"
      >
        {displayLabel} by Filter
      </button>
      <button
        type="button"
        onClick={fillInvalid}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors"
      >
        ✗ Invalid {displayLabel}
      </button>

      {popupOpen && (
        // z-[65] (2026-08-03) — above Numpad/Keyboard's z-[60], same fix as
        // LocationDemoScannerBar's identical popup; see its own comment for why.
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[65]">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[420px] shadow-2xl flex flex-col gap-4">
            <h2 className="font-ui text-[19px] font-semibold text-white text-center">Find a {displayLabel}</h2>

            <div className="flex flex-col gap-3">
              <Dropdown label="Storage Code" value={storageCode} onChange={setStorageCode} options={storageCodeOptions} disabled={!storageCodes} />
              <Dropdown label="Requires Expiration" value={requiresExpirationDate} onChange={setRequiresExpirationDate} options={EXPIRATION_OPTIONS} />
              <Dropdown label="Handling Code" value={conveyable} onChange={setConveyable} options={HANDLING_OPTIONS} />
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
