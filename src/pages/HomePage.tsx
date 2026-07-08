import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMessageBar } from '../context/MessageBarContext';
import { JUMP_CODES } from '../lib/jumpCodes';

interface FunctionButton {
  code: string;
  label: string;
  route: string;
}

const COLUMNS: { heading: string; buttons: FunctionButton[] }[] = [
  {
    heading: 'Production',
    buttons: [
      { code: 'PIP', label: 'Pallet ID Pull',     route: '/pull' },
      { code: 'SDP', label: 'System Directed Put', route: '/put/directed' },
      { code: 'MNP', label: 'Manual Put',          route: '/put/manual' },
    ],
  },
  {
    heading: 'Inventory Management',
    buttons: [
      { code: 'PII', label: 'Pallet ID Info',   route: '/pallet' },
      { code: 'IID', label: 'Item ID Lookup',   route: '/item' },
      { code: 'PAR', label: 'Pallet Reinstate', route: '/pallet/reinstate' },
    ],
  },
  {
    heading: 'Location Management',
    buttons: [
      { code: 'LII', label: 'Location ID Info',         route: '/location' },
      { code: 'WLH', label: 'Warehouse Location Hold',  route: '/hold' },
      { code: 'ISI', label: 'Item Storage Inquiry',     route: '/storage-inquiry' },
    ],
  },
  {
    heading: 'GPM Functions',
    buttons: [
      { code: 'ELA', label: 'Empty Locations by Aisle', route: '/empty/aisle' },
      { code: 'ELZ', label: 'Empty Locations by Zone',  route: '/empty/zone' },
      { code: 'STG', label: 'Stage Aisle',              route: '/stage' },
    ],
  },
  {
    heading: 'Reporting Functions',
    buttons: [
      { code: 'SAR', label: 'Staged Aisle Report',         route: '/staged-aisle' },
      { code: 'IRP', label: 'Individual Reporting',        route: '/reporting/individual' },
      { code: 'PRQ', label: 'Pull Request by Label',       route: '/reporting/pull-request' },
    ],
  },
];

/**
 * App home screen — 5-column function grid (3 buttons per column, 15 total).
 * Columns: Production, Inventory Management, Location Management, GPM Functions, Reporting.
 * Tapping a button whose jump code is not yet built shows an error in the message bar
 * instead of navigating, keeping the worker on the home screen.
 * Shows a welcome info message on mount via the shell's MessageBarContext.
 */
export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setMessage } = useMessageBar();

  const displayName = user ? `${user.firstName} ${user.lastName.charAt(0)}.` : '';

  useEffect(() => {
    setMessage({ type: 'info', text: `Signed in as ${displayName} — select a function` });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName]);

  /**
   * Navigates to the tapped function's route, or shows an error if the function
   * is marked as not yet built in the JUMP_CODES registry.
   *
   * @param btn - The button definition (code, label, route) that was tapped
   */
  const handleSelect = (btn: FunctionButton) => {
    const entry = JUMP_CODES[btn.code];
    if (!entry?.built) {
      setMessage({ type: 'error', text: `${btn.label} — not available in this demo` });
      return;
    }
    navigate(btn.route);
  };

  return (
    <div className="w-full h-full flex flex-col px-10 pt-5 pb-4 gap-5">
      {/* Column headings */}
      <div className="flex gap-4 shrink-0">
        {COLUMNS.map((col, i) => (
          <div key={col.heading} className="flex-1 flex items-center gap-2">
            <span className="font-ui text-[14px] font-medium text-[#CC0000]">{i + 1}</span>
            <span className="font-ui text-[17px] font-semibold text-[#CFCFCF]">{col.heading}</span>
          </div>
        ))}
      </div>

      {/* Horizontal rule under headings */}
      <div className="flex gap-4 shrink-0 -mt-3">
        {COLUMNS.map((col) => (
          <div key={col.heading} className="flex-1 h-[1px] bg-[#2A2A2A]" />
        ))}
      </div>

      {/* Button grid: 3 rows × 5 columns */}
      <div className="flex gap-4 flex-1">
        {COLUMNS.map((col) => (
          <div key={col.heading} className="flex-1 flex flex-col gap-4">
            {col.buttons.map((btn) => (
              <button
                key={btn.code}
                type="button"
                onClick={() => handleSelect(btn)}
                className="flex-1 flex flex-col items-center justify-center gap-3 rounded-[14px] bg-[#0D0D0D] border border-[#2A2A2A] select-none hover:bg-[#111111] hover:border-[#3A3A3A] active:scale-[0.98] transition-all"
              >
                {/* Jump code badge */}
                <span className="font-data text-[13px] font-semibold text-white px-2.5 py-1 rounded-[6px] bg-[#CC0000] tracking-wider">
                  {btn.code}
                </span>
                {/* Function name */}
                <span className="font-ui text-[20px] font-semibold text-white text-center px-4 leading-tight">
                  {btn.label}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
