import { useState } from 'react';
import { Dropdown } from './Dropdown';
import { useAuth } from '../../context/AuthContext';
import { useMessageBar } from '../../context/MessageBarContext';
import {
  INVALID_CONTAINER_ID, CONTAINER_STATUS_OPTIONS, PULL_FUNCTIONS,
  fetchContainerByStatus, fetchValidContainer,
} from '../../lib/demoScanner';
import { CID_TYPE_LABELS, type CidTypeCode } from '@shared/index';
import type { ContainerStatus } from '@shared/index';

const ANY = '';

const CID_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: ANY, label: 'Any' },
  ...(['91', '92', '93', '94', '95'] as CidTypeCode[]).map((code) => ({
    value: code,
    label: `${code} — ${CID_TYPE_LABELS[code]}`,
  })),
];

interface ContainerDemoScannerBarProps {
  onFill: (value: string) => void;
  fn: string;
}

export function ContainerDemoScannerBar({ onFill, fn }: ContainerDemoScannerBarProps) {
  const { token } = useAuth();
  const { setMessage } = useMessageBar();

  const [popupOpen, setPopupOpen] = useState(false);
  const [status, setStatus] = useState<ContainerStatus>('PRINTED');
  const [pullFunction, setPullFunction] = useState(ANY);
  const [containerType, setContainerType] = useState(ANY);

  const showTypeFilter = !fn;

  function fail() {
    setMessage({ type: 'error', text: 'Demo label unavailable' });
  }

  async function fillValid() {
    try {
      onFill(await fetchValidContainer(token!, fn, containerType || undefined));
    } catch { fail(); }
  }

  function fillInvalid() {
    onFill(INVALID_CONTAINER_ID);
  }

  async function find() {
    try {
      onFill(await fetchContainerByStatus(token!, status, pullFunction || undefined, containerType || undefined));
      setPopupOpen(false);
    } catch { fail(); }
  }

  const pullFunctionOptions = [
    { value: ANY, label: 'Any' },
    ...PULL_FUNCTIONS.map((f) => ({ value: f.code, label: `${f.code} — ${f.desc}` })),
  ];

  return (
    <>
      {showTypeFilter && (
        <Dropdown value={containerType} onChange={setContainerType} options={CID_TYPE_OPTIONS} />
      )}
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[65]">
          <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[420px] shadow-2xl flex flex-col gap-4">
            <h2 className="font-ui text-[19px] font-semibold text-white text-center">Find a Label</h2>

            <div className="flex flex-col gap-3">
              {showTypeFilter && (
                <Dropdown label="Container Type" value={containerType} onChange={setContainerType} options={CID_TYPE_OPTIONS} />
              )}
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
