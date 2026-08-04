import { useState } from 'react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import { useStorageCodes } from '../../lib/useStorageCodes';
import { useSizes } from '../../lib/useSizes';
import {
  INVALID_PALLET_ID, PALLET_STATUS_OPTIONS,
  fetchPalletByStatus, fetchValidPallet, fetchValidPalletForAisle,
} from '../../lib/demoScanner';
import type { PalletStatus } from '@shared/index';

const ANY = '';

interface DemoScannerBarProps {
  /** Fills the resolved value into the owning field — exactly like a real scanner
   *  delivery. For a self-validating consumer (`usePalletIdField`) this also triggers the
   *  field's own resolve; for a plain render-only consumer (`PalletIdField`'s `onChange`)
   *  the screen's own handler decides what happens next, same as any other scan. */
  onFill: (value: string) => void;
  /** SDP's own aisle-aware "Valid Pallet ID" (direct instruction) — when given, that button
   *  fetches a Put Pending pallet whose own Storage Code/Size will actually fit *this*
   *  aisle instead of the generic unfiltered pick every other Pallet ID field's "Valid"
   *  button uses. Omitted by every other consumer (PII/MNP have no aisle context). */
  aisle?: string;
}

/**
 * Pallet ID's Demo Scanner (Feature 9, Phase 1) — the generalized 3-button pattern (Valid /
 * by-status / Invalid) replacing every screen's own hand-rolled Pallet ID demo buttons.
 * Owned internally by the Pallet ID field itself (`usePalletIdField` / `PalletIdField`'s
 * `demoScanner` opt-in), not wired per screen — see
 * `DevNotes/DesignPrompts/Feature-9-AppWide-Demo-Scanner.md`'s Integration section.
 *
 * Deliberately Pallet-ID-specific (not parameterized over a scan-type registry) — Phase 1
 * only has one scan type in scope; generalizing the shell before a second scan type
 * actually needs it would be speculative. Storage Code/Size options come from the real
 * lookup tables (`useStorageCodes`/`useSizes`), not a hardcoded list, per the design doc's
 * Real-Data Principle.
 */
export function DemoScannerBar({ onFill, aisle }: DemoScannerBarProps) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();
  const storageCodes = useStorageCodes();
  const sizes = useSizes();

  const [popupOpen, setPopupOpen] = useState(false);
  // Defaults to Put Pending, not Stored — direct instruction, once PUT_PENDING pallets
  // reliably carry a real Storage Code/Size at creation (see `reinstatePallet`/
  // `reseedTestData`'s own fixes), a not-yet-placed pallet is the more useful default
  // starting point for SDP/MNP's own put-oriented flows than an already-stored one.
  const [status, setStatus] = useState<PalletStatus>('PUT_PENDING');
  const [storageCode, setStorageCode] = useState(ANY);
  const [size, setSize] = useState(ANY);

  function fail() {
    setMessage({ type: 'error', text: 'Demo pallet unavailable' });
  }

  async function fillValid() {
    try {
      const palletId = aisle
        ? await fetchValidPalletForAisle(token!, aisle)
        : await fetchValidPallet(token!);
      onFill(String(palletId));
    } catch { fail(); }
  }

  function fillInvalid() {
    onFill(INVALID_PALLET_ID);
  }

  async function find() {
    try {
      onFill(String(await fetchPalletByStatus(token!, status, storageCode || undefined, size || undefined)));
      setPopupOpen(false);
    } catch { fail(); }
  }

  const storageCodeOptions = [
    { value: ANY, label: 'Any' },
    ...(storageCodes ?? []).map((c) => ({ value: c.code, label: c.desc })),
  ];
  const sizeOptions = [
    { value: ANY, label: 'Any' },
    ...(sizes ?? []).map((s) => ({ value: s.code, label: s.desc })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => void fillValid()}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors"
      >
        ✓ Valid Pallet ID
      </button>
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors"
      >
        Pallet ID by Status
      </button>
      <button
        type="button"
        onClick={fillInvalid}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors"
      >
        ✗ Invalid Pallet ID
      </button>

      {popupOpen && (
        // z-[65] (2026-08-03) — above Numpad/Keyboard's z-[60], same fix as
        // LocationDemoScannerBar's identical popup; see its own comment for why.
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[65]">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[420px] shadow-2xl flex flex-col gap-4">
            <h2 className="font-ui text-[19px] font-semibold text-white text-center">Find a Pallet ID</h2>

            <div className="flex flex-col gap-3">
              <Dropdown label="Status" value={status} onChange={setStatus} options={PALLET_STATUS_OPTIONS} />
              <Dropdown label="Storage Code" value={storageCode} onChange={setStorageCode} options={storageCodeOptions} disabled={!storageCodes} />
              <Dropdown label="Size" value={size} onChange={setSize} options={sizeOptions} disabled={!sizes} />
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
