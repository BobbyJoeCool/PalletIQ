import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMessageBar } from '../../context/MessageBarContext';
import { COMMON_SHORTCUTS, resolveJump } from '../../lib/jumpCodes';

const QWERTY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','⌫'],
];

interface HotJumpProps {
  onClose: () => void;
}

/**
 * Full-screen overlay for navigating to any PalletIQ screen by its 3-letter jump code.
 * Renders as two panels side by side:
 *   - Left: a QWERTY keyboard for typing the code, a live-resolved screen name display,
 *     and Cancel / Go buttons.
 *   - Right: a quick-jump shortcuts panel with the most common destinations.
 *
 * Navigating to an unbuilt screen shows an error message in the message bar rather than
 * navigating, so the overlay can remain open for correction.
 *
 * @param onClose - Callback invoked on Cancel and on any successful navigation
 */
export function HotJump({ onClose }: HotJumpProps) {
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const { setMessage } = useMessageBar();
  const overlayRef = useRef<HTMLDivElement>(null);

  // The resolved entry updates live as the code is typed; it's null until 3 letters are entered.
  const resolved = code.length === 3 ? resolveJump(code) : null;
  const isValid = resolved !== null;

  // Focus the overlay div on mount so physical keyboard input is captured.
  useEffect(() => { overlayRef.current?.focus(); }, []);

  /**
   * Handles a keyboard button tap. Accumulates up to 3 uppercase letters in the code;
   * ⌫ removes the last character.
   *
   * @param key - Single uppercase letter or '⌫'
   */
  const handleKey = (key: string) => {
    if (key === '⌫') { setCode((c) => c.slice(0, -1)); return; }
    if (code.length < 3 && /^[A-Z]$/.test(key)) setCode((c) => c + key);
  };

  /**
   * Navigates to the given jump code's route, or shows an error if the screen
   * is not yet built in this demo version.
   *
   * @param entry - Resolved JumpCode entry (guaranteed non-null by callers)
   */
  const go = (entry: NonNullable<ReturnType<typeof resolveJump>>) => {
    onClose();
    if (!entry.built) {
      setMessage({ type: 'error', text: `${entry.label} — not available in this demo` });
      return;
    }
    navigate(entry.route);
  };

  /** Handles the "Go" button tap: navigates to the currently resolved jump-code entry, if any. */
  const handleGo = () => { if (resolved) go(resolved); };

  /**
   * Handles a quick-jump shortcut button tap. Resolves the code and navigates immediately.
   *
   * @param shortcutCode - The 3-letter jump code of the shortcut that was tapped
   */
  const handleShortcut = (shortcutCode: string) => {
    const entry = resolveJump(shortcutCode);
    if (entry) go(entry);
  };

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center outline-none bg-black/80 backdrop-blur-sm"
    >
      <div className="flex gap-6 w-full max-w-[1240px] px-8">

        {/* Keyboard panel */}
        <div className="flex-1 rounded-[18px] overflow-hidden bg-[#0A0A0A] border border-[#2A2A2A]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#222222]">
            <span className="font-data text-[14px] font-semibold tracking-[2px] text-[#9A9A9A] uppercase">
              Jump to Screen
            </span>
            <span className="font-ui text-[17px] text-[#555555]">
              Enter a 3-letter code
            </span>
          </div>

          {/* Code field — turns red-bordered when a valid code is entered */}
          <div className="px-6 py-5">
            <div className={[
              'flex items-center px-5 h-[96px] rounded-[12px] border-2 bg-[#0D0D0D] transition-colors',
              isValid ? 'border-[#CC0000]' : 'border-[#3A3A3A]',
            ].join(' ')}>
              <span className="font-data text-[50px] font-medium text-white tracking-[0.15em] flex-1">
                {code}
                {code.length < 3 && (
                  <span className="inline-block w-[3px] h-[52px] bg-[#CC0000] ml-1 align-middle animate-pulse" />
                )}
              </span>
              {isValid && (
                <span className="font-ui text-[20px] text-[#CFCFCF] ml-4">{resolved?.label}</span>
              )}
            </div>
          </div>

          {/* QWERTY */}
          <div className="flex flex-col gap-2 px-5 pb-4">
            {QWERTY_ROWS.map((row, ri) => (
              <div key={ri} className="flex justify-center gap-2">
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKey(key)}
                    className={[
                      'flex items-center justify-center rounded-[9px] font-ui font-medium text-white select-none',
                      'bg-[#262626] hover:bg-[#3A3A3A] active:bg-[#444] transition-colors',
                      key === '⌫' ? 'w-[72px] h-[74px] text-[22px]' : 'w-[96px] h-[74px] text-[26px]',
                    ].join(' ')}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}

            {/* Cancel / Go actions */}
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 flex items-center justify-center h-[84px] rounded-[12px] border border-[#3A3A3A] font-ui text-[24px] font-medium text-white select-none hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
              >
                ✕ Cancel
              </button>
              <button
                type="button"
                onClick={handleGo}
                disabled={!isValid}
                className={[
                  'flex-1 flex items-center justify-center h-[84px] rounded-[12px]',
                  'font-ui text-[24px] font-semibold text-white select-none transition-colors',
                  'disabled:opacity-30 disabled:cursor-default',
                  isValid ? 'bg-[#CC0000] hover:bg-[#AA0000]' : 'bg-[#1A1A1A]',
                ].join(' ')}
              >
                Go →
              </button>
            </div>
          </div>
        </div>

        {/* Quick-jump shortcuts panel */}
        <div className="flex flex-col w-[280px] rounded-[18px] overflow-hidden bg-[#0A0A0A] border border-[#2A2A2A]">
          <div className="px-6 py-4 border-b border-[#222222]">
            <span className="font-data text-[14px] font-semibold tracking-[2px] text-[#9A9A9A] uppercase">
              Quick Jump
            </span>
          </div>
          <div className="flex flex-col gap-2 p-4 flex-1">
            {COMMON_SHORTCUTS.map((entry) => (
              <button
                key={entry.code}
                type="button"
                onClick={() => handleShortcut(entry.code)}
                className="flex items-center gap-3 px-4 py-4 rounded-[10px] text-left select-none hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
              >
                <span className="shrink-0 font-data text-[13px] font-semibold text-white px-2 py-1 rounded-[6px] bg-[#CC0000]">
                  {entry.code}
                </span>
                <span className="font-ui text-[19px] text-[#CFCFCF]">{entry.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
