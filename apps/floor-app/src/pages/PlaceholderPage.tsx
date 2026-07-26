import { JUMP_CODES } from '../lib/jumpCodes';

interface Props {
  code: string;
}

/** Fallback screen for a jump code that hasn't been built yet — shows its code and label. */
export function PlaceholderPage({ code }: Props) {
  const entry = JUMP_CODES[code];
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 select-none">
      <span className="font-data text-[13px] font-semibold text-white px-3 py-1.5 rounded-[6px] bg-[#CC0000] tracking-wider">
        {code}
      </span>
      <h2 className="font-ui text-[30px] font-semibold text-white">{entry?.label ?? code}</h2>
      <p className="font-ui text-[20px] text-[#555555]">This screen is not yet built.</p>
    </div>
  );
}
