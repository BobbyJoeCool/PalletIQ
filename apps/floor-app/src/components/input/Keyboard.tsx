import { useNumpad } from '../../context/NumpadContext';

// Full-width keyboard panel, anchored to the bottom of the content slot.
const NUMBER_ROW = ['1','2','3','4','5','6','7','8','9','0'];
const QWERTY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','⌫'],
];

/**
 * Full-width on-screen keyboard panel. Renders as an overlay spanning the full bottom
 * of the content slot. Contains a number row, three QWERTY rows, and a Tab/Back Tab/
 * Clear/Space/Enter action row (Enter renamed from OK, issue #100). Each button tap
 * dispatches the key string to NumpadContext.handleKey — `useNumpadField` already treats
 * `'Enter'`/`'OK'`/`'Blur'` as equivalent submit triggers, so the rename is label-only.
 *
 * Tab/Back Tab (issue #100) dispatch their own key strings but have no handler yet — see
 * `Numpad.tsx`'s own doc comment and `Documentation/Components/Keyboard.md` for why (no
 * field-navigation mechanism exists anywhere in the app today; building one generically
 * was scoped out to a dedicated follow-up issue). Tapping either is a silent no-op today.
 *
 * Used for free-text entry fields (Size and Storage Code overrides on SDP) where
 * alphanumeric input is needed rather than digits only.
 */
export function Keyboard() {
  const { handleKey } = useNumpad();

  return (
    <div data-testid="keyboard-panel" className="absolute bottom-0 left-0 right-0 h-[354px] flex flex-col bg-[#0A0A0A] border border-b-0 border-[#2A2A2A] rounded-t-[16px] shadow-[0px_-14px_44px_0px_rgba(0,0,0,0.55)] select-none">
      {/* Keys */}
      <div className="flex-1 flex flex-col gap-1.5 px-4 pb-2">
        {/* Number row */}
        <div className="flex gap-1.5">
          {NUMBER_ROW.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKey(key)}
              className="flex-1 flex items-center justify-center h-[60px] rounded-[9px] bg-[#262626] text-white font-data text-[26px] font-medium select-none hover:bg-[#3A3A3A] active:bg-[#444] transition-colors"
            >
              {key}
            </button>
          ))}
        </div>

        {/* QWERTY rows */}
        {QWERTY_ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1.5">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKey(key)}
                className={[
                  'flex items-center justify-center h-[60px] rounded-[9px] select-none',
                  'bg-[#262626] text-white font-ui text-[26px] font-medium',
                  'hover:bg-[#3A3A3A] active:bg-[#444] transition-colors',
                  key === '⌫' ? 'w-[72px]' : 'flex-1',
                ].join(' ')}
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        {/* Action row: Tab / Back Tab / Clear / Space / Enter */}
        <div className="flex gap-1.5 mt-0.5">
          <button
            type="button"
            onClick={() => handleKey('Tab')}
            className="flex-1 flex items-center justify-center h-[60px] rounded-[9px] bg-[#1A1A1A] font-ui text-[18px] font-medium text-[#9A9A9A] select-none hover:bg-[#262626] active:bg-[#333] transition-colors"
          >
            Tab
          </button>
          <button
            type="button"
            onClick={() => handleKey('Back Tab')}
            className="flex-1 flex items-center justify-center h-[60px] rounded-[9px] bg-[#1A1A1A] font-ui text-[15px] font-medium text-[#9A9A9A] select-none hover:bg-[#262626] active:bg-[#333] transition-colors"
          >
            Back Tab
          </button>
          <button
            type="button"
            onClick={() => handleKey('CLEAR')}
            className="flex-[2] flex items-center justify-center h-[60px] rounded-[9px] bg-[#1A1A1A] font-ui text-[22px] font-medium text-[#9A9A9A] select-none hover:bg-[#262626] active:bg-[#333] transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleKey(' ')}
            className="flex-[4] flex items-center justify-center h-[60px] rounded-[9px] bg-[#1A1A1A] font-ui text-[20px] text-[#555555] select-none hover:bg-[#262626] active:bg-[#333] transition-colors"
          >
            space
          </button>
          <button
            type="button"
            onClick={() => handleKey('Enter')}
            className="flex-[2] flex items-center justify-center h-[60px] rounded-[9px] bg-[#CC0000] font-ui text-[22px] font-semibold text-white select-none hover:bg-[#AA0000] active:bg-[#990000] transition-colors"
          >
            Enter
          </button>
        </div>
      </div>
    </div>
  );
}
