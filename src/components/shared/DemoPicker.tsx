interface DemoPickerOption<T extends string> {
  key: T;
  label: string;
}

interface DemoPickerProps<T extends string> {
  /** Question shown above the option list, e.g. "Simulate which invalid label?" */
  title: string;
  options: DemoPickerOption<T>[];
  onPick: (key: T) => void;
  onCancel: () => void;
}

/**
 * Demo-only popup that consolidates a group of related "simulate this scenario" footer
 * buttons behind one button plus this picker — the Footer is a single fixed-height row
 * (`src/components/shell/Footer.tsx`), and screens with several narrow demo scenarios
 * (e.g. PIP's Wrong Function / Pulled / Canceled / Purged label variants) crowd it out
 * fast. Pass the scenario list as `options`; the caller owns dispatching each `key` to
 * its own demo handler in `onPick`.
 *
 * Generic over the option key type so each caller keeps full type safety on its own
 * scenario union (e.g. PIP's `'wrongFn' | 'pulled' | 'canceled' | 'purged'`) rather than
 * a plain `string`.
 */
export function DemoPicker<T extends string>({ title, options, onPick, onCancel }: DemoPickerProps<T>) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-6 w-[380px] shadow-2xl">
        <h2 className="font-ui text-[19px] font-semibold text-white text-center mb-4">
          {title}
        </h2>
        <div className="flex flex-col gap-2.5 mb-3">
          {options.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="h-[52px] rounded-[10px] bg-[#1F1F1F] border border-[#2C2C2C] text-white font-ui text-[16px] font-medium hover:border-[#665500] hover:bg-[#332D0F] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-[48px] rounded-[10px] border border-[#3A3A3A] font-ui text-[16px] font-medium text-white hover:bg-[#1A1A1A] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
