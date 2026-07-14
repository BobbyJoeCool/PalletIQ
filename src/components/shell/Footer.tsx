import { useEffect, useState } from 'react';
import { useFooterDemo } from '../../context/FooterDemoContext';
import { useNumpad } from '../../context/NumpadContext';
import { getBatchDate, getDisplayDate, getDisplayTime } from '../../lib/julianDate';

/**
 * Persistent bottom bar rendered on all authenticated screens.
 * Contains three areas from left to right:
 *   1. Input panel toggles: "123 Keypad" and "ABC Keyboard" buttons that open/close
 *      the on-screen input panels; the active panel's button is highlighted red.
 *   2. Demo slot: any React nodes registered by the current screen via FooterDemoContext,
 *      centered in the space between the panel toggles and the clock (a flex-1 middle
 *      column, so it stays centered regardless of viewport width or how many demo
 *      buttons the current screen has). Empty when no screen registers content.
 *   3. Live clock: batch date (BD YYDDD), calendar date, and 12-hour time, updated every 15 seconds.
 */
export function Footer() {
  const { activePanel, showNumpad, showKeyboard, hidePanel } = useNumpad();
  const { demoSlot } = useFooterDemo();
  const [now, setNow] = useState(new Date());

  // Update the clock every 15 seconds.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const numpadActive = activePanel === 'numpad';
  const keyboardActive = activePanel === 'keyboard';

  // Toggle behavior: clicking the active panel button closes it; clicking the inactive one opens it.
  /** Toggles the numpad panel: closes it if already open, opens it otherwise. */
  const toggleNumpad = () => (numpadActive ? hidePanel() : showNumpad());
  /** Toggles the keyboard panel: closes it if already open, opens it otherwise. */
  const toggleKeyboard = () => (keyboardActive ? hidePanel() : showKeyboard());

  const activeBtn =
    'flex items-center gap-2 h-[38px] px-4 rounded-[8px] bg-[#CC0000] text-white ' +
    'font-ui text-[17px] font-medium select-none transition-colors';
  const inactiveBtn =
    'flex items-center gap-2 h-[38px] px-4 rounded-[8px] border border-[#3A3A3A] text-[#9A9A9A] ' +
    'font-ui text-[17px] font-medium select-none hover:border-[#555] hover:text-[#CFCFCF] transition-colors';

  return (
    <footer className="shrink-0 flex items-center px-6 h-[54px] bg-black border-t border-[#1C1C1C]">
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={toggleNumpad} className={numpadActive ? activeBtn : inactiveBtn}>
          <span className="font-data text-[13px] font-semibold tracking-wider">123</span>
          <span>Keypad</span>
        </button>
        <button type="button" onClick={toggleKeyboard} className={keyboardActive ? activeBtn : inactiveBtn}>
          <span className="font-data text-[13px] font-semibold tracking-wider">ABC</span>
          <span>Keyboard</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center gap-2">
        {demoSlot}
      </div>

      <div className="flex items-center gap-5 font-data text-[18px] font-medium shrink-0">
        <span className="text-[#CC0000]">{getBatchDate(now)}</span>
        <span className="text-[#CFCFCF]">{getDisplayDate(now)}</span>
        <span className="text-white">{getDisplayTime(now)}</span>
      </div>
    </footer>
  );
}
