import { useNumpad } from '../../context/NumpadContext';

interface NumpadKey {
  label: string;
  dispatch: string;
  /** Flex-grow multiplier relative to a plain key's `flex-1` — only Enter uses this
   *  (spans the last 2 columns), everything else is implicitly 1. */
  span?: number;
}

// 4-column layout (issue #100, replacing the old 3-column 7-8-9/4-5-6/1-2-3/⌫-0-OK grid):
// digits 1-9 plus 0 keep their positions; ⌫/Tab/Back Tab occupy the new 4th column on rows
// 1-3 (⌫ keeps its old symbol, just moved — direct instruction, 2026-08-03); row 4 is
// Clear/0/Enter, with Enter spanning the last 2 columns via flex-[2] (no fixed per-button
// pixel widths — every key's width still falls out of flex-1 sizing, same as before, so the
// panel keeps its existing 436×494px footprint).
const ROWS: NumpadKey[][] = [
  [{ label: '7', dispatch: '7' }, { label: '8', dispatch: '8' }, { label: '9', dispatch: '9' }, { label: '⌫', dispatch: '⌫' }],
  [{ label: '4', dispatch: '4' }, { label: '5', dispatch: '5' }, { label: '6', dispatch: '6' }, { label: 'Tab', dispatch: 'Tab' }],
  [{ label: '1', dispatch: '1' }, { label: '2', dispatch: '2' }, { label: '3', dispatch: '3' }, { label: 'Back Tab', dispatch: 'Back Tab' }],
  [{ label: 'Clear', dispatch: 'CLEAR' }, { label: '0', dispatch: '0' }, { label: 'Enter', dispatch: 'Enter', span: 2 }],
];

/**
 * On-screen numeric keypad panel. Renders as an overlay in the bottom-right of the content slot.
 * Each button tap dispatches its own key string to NumpadContext.handleKey, which routes it
 * to whichever field currently has focus. Enter (renamed from OK, issue #100) submits the
 * field — `useNumpadField` already treats `'Enter'`/`'OK'`/`'Blur'` as equivalent submit
 * triggers, so this is a label-only change, not a new codepath. Clear dispatches the same
 * `'CLEAR'` key Keyboard.tsx's own Clear button already uses.
 *
 * Tab/Back Tab (issue #100) dispatch their own key strings but have no handler yet — see
 * `Documentation/Components/Numpad.md` for why: no field-navigation mechanism (an ordered
 * field registry, focusNext/focusPrev) exists anywhere in the app today, and building one
 * generically was scoped out to a dedicated follow-up issue rather than guessed at here.
 * Tapping either button today is a silent no-op, same as any other unrecognized key
 * (`useNumpadField`'s handler has no final `else` branch).
 *
 * `z-[60]` (issue #84 fix, 2026-08-03) — every full-screen dialog in the app
 * (`ModalOverlay`, `HotJump`) tops out at `z-50`, which otherwise sits on top of this panel
 * and blocks it entirely, since neither `Numpad` nor `Keyboard` had any z-index of their
 * own before this fix. Surfaced by the reason-code redesign needing the on-screen keyboard/
 * numpad reachable from *inside* a `ModalOverlay`-wrapped dialog (MNP's occupied-location
 * Hold confirmation, PIP/MNP's quick-hold panels, SDP's Verify-Put Hold Location) for the
 * first time — always render above any modal instead of patching each dialog individually.
 */
export function Numpad() {
  const { handleKey } = useNumpad();

  return (
    <div data-testid="numpad-panel" className="absolute bottom-0 right-0 z-[60] w-[436px] h-[494px] flex flex-col bg-[#0A0A0A] border border-b-0 border-[#2A2A2A] rounded-t-[16px] shadow-[0px_-14px_44px_0px_rgba(0,0,0,0.55)] select-none">
      {/* Key grid */}
      <div className="flex-1 flex flex-col gap-2 px-3 pt-3 pb-3">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-2 flex-1">
            {row.map(({ label, dispatch, span }) => {
              const isEnter = dispatch === 'Enter';
              const isBack = dispatch === '⌫';
              const isWordKey = dispatch === 'Tab' || dispatch === 'Back Tab' || dispatch === 'CLEAR';
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleKey(dispatch)}
                  className={[
                    span === 2 ? 'flex-[2]' : 'flex-1',
                    'flex items-center justify-center rounded-[10px] select-none transition-colors active:scale-95',
                    isEnter
                      ? 'bg-[#CC0000] text-white font-ui text-[26px] font-semibold hover:bg-[#AA0000]'
                      : isBack
                      ? 'bg-[#1F1F1F] border border-[#2C2C2C] text-[#BBBBBB] font-data text-[26px] hover:bg-[#2A2A2A]'
                      : isWordKey
                      ? 'bg-[#1F1F1F] border border-[#2C2C2C] text-[#BBBBBB] font-ui text-[18px] hover:bg-[#2A2A2A]'
                      : 'bg-[#1F1F1F] border border-[#2C2C2C] text-white font-data text-[32px] font-medium hover:bg-[#2A2A2A]',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
