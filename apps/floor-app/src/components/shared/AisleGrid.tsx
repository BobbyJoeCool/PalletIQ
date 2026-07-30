import { SIZE_WEIGHTS } from '../../lib/sizes';
import { STORAGE_CODE_COLOR_FALLBACK, STORAGE_CODE_COLORS } from '../../lib/storageCodeColors';

export type GridSide = 'odd' | 'even';

export interface GridCell {
  zone: number;
  side: GridSide;
  storageCode: string;
  size: string;
  contraction: boolean;
}

export interface GridLevel {
  level: number;
  cells: GridCell[];
}

export interface ZoneBinRange {
  zone: number;
  minBin: number;
  maxBin: number;
}

interface AisleGridProps {
  levels: GridLevel[];
  /** Per-zone min/max bin (both sides combined) — shown as a "BINS: {max} - {min}" line
   *  under each Zone header. Omit to hide the line entirely (e.g. while data is still loading). */
  zoneBinRanges?: ZoneBinRange[];
  /** Shrinks header padding for panes shorter than ELZ's full-page one (e.g. STG's
   *  bottom-half zone map). Default false keeps ELZ pixel-identical. Row height is no
   *  longer a `dense`-driven fixed value either way — see the Level rows comment below. */
  dense?: boolean;
}

const ZONES = [1, 2, 3, 4] as const;
const SIDES: GridSide[] = ['odd', 'even'];

// Divider styling (v1.6.5 follow-up): every row/column divider between cells uses the
// grid's old zone-divider look (2px, neutral gray) so individual cells read clearly; the
// zone-to-zone boundary itself is bumped 1.5x heavier (3px) and colored to stand out from
// the now-more-visible cell grid around it. The blue reuses `storageCodeColors.ts`'s CR
// slot — already contrast-validated against this grid's dark cell surface via the dataviz
// skill's palette validator, and borders vs. cell text are visually distinct enough that
// reusing the hex doesn't read as a collision.
const CELL_DIVIDER_COLOR = 'border-[#555]';
const ZONE_DIVIDER = 'border-l-[3px] border-[#3987e5]';

/** Builds the lookup key for a grid cell's zone-side position, e.g. "2-odd". */
function cellKey(zone: number, side: GridSide): string {
  return `${zone}-${side}`;
}

/**
 * Visual map of one aisle's physical layout: 8 fixed columns (Zone 1-4 × Odd/Even side),
 * each an independently-sized list of that zone/side's occupied levels (issue #126,
 * revised 2026-07-28 — direct instruction: rather than also splitting Odd/Even into their
 * own left/right halves, each of the existing 8 zone×side columns instead becomes its own
 * dynamically-sized list of level-badged entries, with no cross-column level alignment).
 * Each entry shows a small Level badge followed by its {StorageCode}-{Size} designation,
 * the Storage Code colored from a curated per-code palette (`storageCodeColors.ts`) for
 * at-a-glance distinctiveness; a contracted entry highlights red instead. Read-only for
 * every role — no cell interaction (per ELZ.md). Shared between ELZ and STG.
 *
 * Entries within a column are sorted highest level first (top) down to Level 1 (bottom),
 * preserving this component's original "mirrors the real aisle" intent even though columns
 * are no longer a fixed per-level grid — an empty column (no occupied levels on that
 * zone/side) shows a single "—" placeholder instead of nothing.
 *
 * Every column fills the full grid height regardless of how many entries it holds (revised
 * 2026-07-28, direct instruction) — each entry's own box height is weighted by
 * `SIZE_WEIGHTS[size]` (L=1, M=.667, S=.5, HS=.25, XS=.125, same formula this component
 * used pre-#126 for whole rows) and grows to fill its share of that column's own available
 * height, the same `flex-grow`-weighted-by-size technique as before — just applied per
 * entry within an independently-sized column now, instead of per row shared across every
 * column. A column with few entries gets visibly larger boxes than a densely-occupied
 * neighbor, rather than leaving empty space at the bottom.
 */
export function AisleGrid({ levels, zoneBinRanges, dense = false }: AisleGridProps) {
  const binRangeByZone = new Map((zoneBinRanges ?? []).map((r) => [r.zone, r]));

  // Reflow the level-keyed input into one entry list per zone/side column, each entry
  // carrying its own level number now that level is no longer implied by row position.
  interface ColumnEntry { level: number; storageCode: string; size: string; contraction: boolean }
  const columns = new Map<string, ColumnEntry[]>();
  for (const zone of ZONES) {
    for (const side of SIDES) columns.set(cellKey(zone, side), []);
  }
  for (const row of levels) {
    for (const cell of row.cells) {
      columns.get(cellKey(cell.zone, cell.side))?.push({
        level: row.level, storageCode: cell.storageCode, size: cell.size, contraction: cell.contraction,
      });
    }
  }
  // Highest level first (top of column) down to Level 1 (bottom) — see doc comment above.
  for (const entries of columns.values()) entries.sort((a, b) => b.level - a.level);

  return (
    <div className="h-full flex flex-col border border-[#2A2A2A] rounded-[12px] overflow-y-auto select-none">
      {/* Header row 1 — zone label + bin range, spanning its Odd+Even column pair */}
      <div className="flex bg-[#161616] border-b border-[#2A2A2A] shrink-0">
        {ZONES.map((zone) => {
          const range = binRangeByZone.get(zone);
          return (
            <div
              key={zone}
              className={`flex-1 text-center ${ZONE_DIVIDER} first:border-l-0 ${dense ? 'py-0.5' : 'py-1'}`}
            >
              <span className="block font-ui text-[12px] font-bold text-white uppercase tracking-wider">
                Zone {zone}
              </span>
              {range && (
                <span className="block font-data text-[10px] text-[#9A9A9A]">
                  BINS: {range.maxBin} - {range.minBin}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Header row 2 — Odd / Even sub-headers */}
      <div className="flex bg-[#111111] border-b border-[#2A2A2A] shrink-0">
        {ZONES.map((zone) => (
          <div key={zone} className={`flex-1 flex ${ZONE_DIVIDER} first:border-l-0`}>
            {SIDES.map((side) => (
              <div
                key={cellKey(zone, side)}
                className={`flex-1 text-center border-l-2 ${CELL_DIVIDER_COLOR} first:border-l-0 ${dense ? 'py-1' : 'py-2'}`}
              >
                <span className="font-ui text-[13px] font-semibold text-[#9A9A9A] uppercase tracking-wider">
                  {side === 'odd' ? 'Odd' : 'Even'}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Columns — each its own dynamically-sized list of level-badged entries, no
          cross-column level alignment (see doc comment above). */}
      <div className="flex flex-1">
        {ZONES.map((zone) => (
          <div key={zone} className={`flex-1 flex ${ZONE_DIVIDER} first:border-l-0`}>
            {SIDES.map((side) => {
              const entries = columns.get(cellKey(zone, side)) ?? [];
              return (
                <div key={cellKey(zone, side)} className={`flex-1 flex flex-col border-l-2 ${CELL_DIVIDER_COLOR} first:border-l-0`}>
                  {entries.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-3">
                      <span className="text-[#333] text-[13px]">—</span>
                    </div>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.level}
                        style={{ flexGrow: SIZE_WEIGHTS[entry.size] ?? 1, flexBasis: 0 }}
                        className={`min-h-0 flex items-center justify-center gap-1.5 border-b ${CELL_DIVIDER_COLOR} last:border-b-0 ${
                          entry.contraction ? 'bg-[#4A0000]' : 'bg-[#0A0A0A]'
                        }`}
                      >
                        <span className="shrink-0 flex items-center justify-center min-w-[27px] h-[24px] px-1.5 rounded-[6px] bg-[#0D0D0D] border border-[#3A3A3A] font-data text-[15px] font-semibold text-[#9A9A9A]">
                          {entry.level}
                        </span>
                        <span
                          className="font-data text-[13px] font-medium"
                          style={{
                            color: entry.contraction
                              ? '#FF6666'
                              : (STORAGE_CODE_COLORS[entry.storageCode] ?? STORAGE_CODE_COLOR_FALLBACK),
                          }}
                        >
                          {entry.storageCode}-{entry.size}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
