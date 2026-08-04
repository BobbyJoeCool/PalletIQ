import { useState } from 'react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import {
  INVALID_CONTAINER_ID, CONTAINER_STATUS_OPTIONS, PULL_FUNCTIONS,
  fetchContainerByStatus, fetchValidContainer,
} from '../../lib/demoScanner';
import type { ContainerStatus } from '@shared/index';

const ANY = '';

interface ContainerDemoScannerBarProps {
  /** Fills the resolved value into the owning field — exactly like a real scanner
   *  delivery (PIP passes `deliverScan`). */
  onFill: (value: string) => void;
  /** PIP's currently-selected Pull Function — required, not optional, since PIP only
   *  accepts a container whose own `pullFunction` matches it; unlike Pallet ID's aisle
   *  filter (SDP-only, everyone else omits it), every Container ID consumer has this
   *  context, so there's no "omitted" case to design around. */
  fn: string;
}

/**
 * Container ID's Demo Scanner (Feature 9, CID phase) — the generalized 3-button pattern
 * (Valid / by-status / Invalid) replacing PIP's old bespoke "✓/✗ Scan Label" pair plus its
 * dedicated "⚠ Invalid Label" picker (Wrong Function/Pulled/Canceled/Purged). Per the Core
 * Concept section's already-settled "Invalid is strictly not-found" rule, those four
 * picker options are now just Status picks in the by-status popup below — Invalid Label is
 * a plain not-found sentinel, same as every other scan type.
 *
 * PIP is the only consumer today (CII, #136, will be the second once built) — matches
 * `DemoScannerBar`'s own precedent of building a real per-scan-type component rather than
 * a per-consumer one, even before a second consumer exists.
 */
export function ContainerDemoScannerBar({ onFill, fn }: ContainerDemoScannerBarProps) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();

  const [popupOpen, setPopupOpen] = useState(false);
  // Defaults to Printed — the normal scannable state (matches `sampleContainer`'s own
  // default), the most useful starting point for a worker demoing a real pull.
  const [status, setStatus] = useState<ContainerStatus>('PRINTED');
  const [pullFunction, setPullFunction] = useState(ANY);

  function fail() {
    setMessage({ type: 'error', text: 'Demo label unavailable' });
  }

  async function fillValid() {
    try {
      onFill(await fetchValidContainer(token!, fn));
    } catch { fail(); }
  }

  function fillInvalid() {
    onFill(INVALID_CONTAINER_ID);
  }

  async function find() {
    try {
      onFill(await fetchContainerByStatus(token!, status, pullFunction || undefined));
      setPopupOpen(false);
    } catch { fail(); }
  }

  const pullFunctionOptions = [
    { value: ANY, label: 'Any' },
    ...PULL_FUNCTIONS.map((f) => ({ value: f.code, label: `${f.code} — ${f.desc}` })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => void fillValid()}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#006600] hover:bg-[#007700] text-white transition-colors"
      >
        ✓ Valid Label
      </button>
      <button
        type="button"
        onClick={() => setPopupOpen(true)}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#003366] hover:bg-[#004488] text-white transition-colors"
      >
        Label by Status
      </button>
      <button
        type="button"
        onClick={fillInvalid}
        className="h-[38px] px-4 rounded-[8px] font-ui text-[15px] font-medium bg-[#660000] hover:bg-[#770000] text-white transition-colors"
      >
        ✗ Invalid Label
      </button>

      {popupOpen && (
        // z-[65] (2026-08-03) — above Numpad/Keyboard's z-[60], same fix as
        // LocationDemoScannerBar's identical popup; see its own comment for why.
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[65]">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[420px] shadow-2xl flex flex-col gap-4">
            <h2 className="font-ui text-[19px] font-semibold text-white text-center">Find a Label</h2>

            <div className="flex flex-col gap-3">
              <Dropdown label="Status" value={status} onChange={setStatus} options={CONTAINER_STATUS_OPTIONS} />
              <Dropdown label="Pull Function" value={pullFunction} onChange={setPullFunction} options={pullFunctionOptions} />
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
