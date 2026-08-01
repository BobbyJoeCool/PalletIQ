/** Renders the blank / `E` / `E(S)` / `(S)` cell format shared across ELZ's zone summary,
 *  ELA's results table, and STG's live info panel. `large` matches ELA's bigger results-
 *  table type size; the default matches ELZ's more compact sidebar size.
 *
 *  `total` (GitHub #191, optional — omit where a caller has no such count, e.g. ELZ's zone
 *  summary) is every location of this size/aisle regardless of status/hold. When `empty`
 *  and `staged` are both 0 but `total > 0` (locations exist, none currently available),
 *  renders an explicit "0(0)" instead of blank — the caller (`AisleSizeTable`) washes the
 *  cell blue for this same condition so it doesn't look identical to a size this aisle
 *  doesn't stock at all. */
export function CellValue({ empty, staged, total = 0, large = false }: { empty: number; staged: number; total?: number; large?: boolean }) {
  if (empty === 0 && staged === 0 && total === 0) return null;
  const showZero = empty === 0 && staged === 0; // total > 0 here, since the check above already returned
  return (
    <span className={`font-data font-medium text-white ${large ? 'text-[19px]' : 'text-[15px]'}`}>
      {(empty > 0 || showZero) && empty}
      {(staged > 0 || showZero) && (
        <span className={`text-[#9A9A9A] ml-0.5 ${large ? 'text-[13px]' : 'text-[12px]'}`}>({staged})</span>
      )}
    </span>
  );
}
