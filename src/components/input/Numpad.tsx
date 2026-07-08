import { useNumpad } from '../../context/NumpadContext';

// Calculator layout: 7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-OK
// Panel is 436 × 482 px, anchored to the bottom-right corner of the content slot.
const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['⌫', '0', 'OK'],
] as const;

/**
 * On-screen numeric keypad panel. Renders as an overlay in the bottom-right of the content slot.
 * Each button tap dispatches the key string to NumpadContext.handleKey, which routes it
 * to whichever field currently has focus. OK is equivalent to Enter — it submits the field.
 */
export function Numpad() {
  const { handleKey } = useNumpad();

  return (
    <div data-testid="numpad-panel" className="absolute bottom-0 right-0 w-[436px] h-[494px] flex flex-col bg-[#0A0A0A] border border-b-0 border-[#2A2A2A] rounded-t-[16px] shadow-[0px_-14px_44px_0px_rgba(0,0,0,0.55)] select-none">
      {/* Key grid */}
      <div className="flex-1 flex flex-col gap-2 px-3 pt-3 pb-3">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-2 flex-1">
            {row.map((key) => {
              const isOk = key === 'OK';
              const isBack = key === '⌫';
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKey(key)}
                  className={[
                    'flex-1 flex items-center justify-center rounded-[10px] select-none transition-colors active:scale-95',
                    isOk
                      ? 'bg-[#CC0000] text-white font-ui text-[26px] font-semibold hover:bg-[#AA0000]'
                      : isBack
                      ? 'bg-[#1F1F1F] border border-[#2C2C2C] text-[#BBBBBB] font-data text-[26px] hover:bg-[#2A2A2A]'
                      : 'bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[32px] font-medium hover:bg-[#2A2A2A]',
                  ].join(' ')}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
