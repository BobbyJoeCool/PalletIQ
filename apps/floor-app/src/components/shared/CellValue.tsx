/** Renders the blank / `E` / `E(S)` / `(S)` cell format shared across ELZ's zone summary,
 *  ELA's results table, and STG's live info panel. `large` matches ELA's bigger results-
 *  table type size; the default matches ELZ's more compact sidebar size. */
export function CellValue({ empty, staged, large = false }: { empty: number; staged: number; large?: boolean }) {
  if (empty === 0 && staged === 0) return null;
  return (
    <span className={`font-data font-medium text-white ${large ? 'text-[19px]' : 'text-[15px]'}`}>
      {empty > 0 && empty}
      {staged > 0 && (
        <span className={`text-[#9A9A9A] ml-0.5 ${large ? 'text-[13px]' : 'text-[12px]'}`}>({staged})</span>
      )}
    </span>
  );
}
