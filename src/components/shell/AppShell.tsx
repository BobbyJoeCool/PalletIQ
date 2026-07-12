import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FooterDemoProvider } from '../../context/FooterDemoContext';
import { MessageBarProvider } from '../../context/MessageBarContext';
import { NavLockProvider, useNavLockContext } from '../../context/NavLockContext';
import { NumpadProvider, useNumpad } from '../../context/NumpadContext';
import { Keyboard } from '../input/Keyboard';
import { Numpad } from '../input/Numpad';
import { ActivityLogOverlay } from './ActivityLogOverlay';
import { Footer } from './Footer';
import { Header } from './Header';
import { HotJump } from './HotJump';
import { MessageBar } from './MessageBar';

const SCREEN_TITLES: Record<string, string> = {
  '/':                       'Home',
  '/pull':                   'Pallet ID Pull',
  '/put/directed':           'System Directed Put',
  '/put/manual':             'Manual Put',
  '/pallet':                 'Pallet ID Info',
  '/item':                   'Item ID Lookup',
  '/pallet/reinstate':       'Pallet Reinstate',
  '/location':               'Location ID Info',
  '/hold':                   'Warehouse Location Hold',
  '/staged-aisle':           'Staged Aisle Report',
  '/empty/aisle':            'Empty Locations by Aisle',
  '/empty/zone':             'Empty Locations by Zone',
  '/stage':                  'Stage Aisle',
  '/reporting/individual':   'Individual Reporting',
  '/reporting/pull-request': 'Pull Request by Label',
  '/reporting/other':        'Other Reporting Functions',
};

// Keypresses arriving within this many ms of each other are treated as scanner input.
// Real barcode scanners fire characters in < 20 ms; human typing is > 100 ms.
const SCANNER_THRESHOLD_MS = 50;

/**
 * Inner shell that requires access to NumpadContext.
 * Handles two cross-cutting behaviors:
 *
 * 1. Route-change cleanup — closes the input panel and clears the active key handler
 *    whenever the user navigates to a different screen. Each screen's own mount effect
 *    re-opens the panel if it needs one.
 *
 * 2. Hardware barcode scanner wiring — listens for rapid physical key sequences.
 *    Characters arriving within SCANNER_THRESHOLD_MS of each other are buffered;
 *    when Enter is received after the buffer, the entire string is delivered as a scan
 *    via deliverScan() rather than being processed key-by-key.
 */
function ShellInner() {
  const location = useLocation();
  const [jumpOpen, setJumpOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const { activePanel, deliverScan, hidePanel, setKeyHandler } = useNumpad();
  const { locked: navLocked } = useNavLockContext();

  // Close the panel and clear the active handler whenever the route changes.
  useEffect(() => {
    hidePanel();
    setKeyHandler(null);
  }, [location.pathname, hidePanel, setKeyHandler]);

  // Hardware scanner buffer: accumulates physical keypresses.
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    /** Buffers rapid keypresses as a hardware scan; delivers the buffered string on Enter. */
    function onKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        // Enter finalizes a scan — deliver the buffered string if non-empty.
        const scanned = bufferRef.current;
        bufferRef.current = '';
        if (scanned.length > 0) {
          deliverScan(scanned);
        }
        return;
      }

      if (e.key.length === 1) {
        if (gap > SCANNER_THRESHOLD_MS && bufferRef.current.length > 0) {
          // Gap too large — this is a new typing sequence, not a scanner continuation.
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deliverScan]);

  const isHome = location.pathname === '/';
  const title = SCREEN_TITLES[location.pathname] ?? 'PalletIQ';

  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <Header
        title={title}
        onJump={() => setJumpOpen(true)}
        onActivity={() => setActivityOpen(true)}
        disableNav={isHome}
        locked={navLocked}
      />
      <MessageBar />

      {/* Main content slot — 792 px tall (1024 − 104 − 74 − 54) */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <Outlet />
        {activePanel === 'numpad'   && <Numpad />}
        {activePanel === 'keyboard' && <Keyboard />}
      </div>

      <Footer />

      {jumpOpen && <HotJump onClose={() => setJumpOpen(false)} />}
      {activityOpen && <ActivityLogOverlay onClose={() => setActivityOpen(false)} />}
    </div>
  );
}

/**
 * App shell layout component. Wraps the shared providers (MessageBar, Numpad, FooterDemo)
 * around ShellInner, which renders the Header, MessageBar strip, content slot, and Footer.
 * All authenticated screens render inside this shell as nested route content via Outlet.
 */
export function AppShell() {
  return (
    <MessageBarProvider>
      <NavLockProvider>
        <NumpadProvider>
          <FooterDemoProvider>
            <ShellInner />
          </FooterDemoProvider>
        </NumpadProvider>
      </NavLockProvider>
    </MessageBarProvider>
  );
}
