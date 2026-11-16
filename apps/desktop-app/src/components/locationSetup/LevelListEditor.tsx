import type { LevelSetting } from '@shared/aisleSetup';
import { MAX_LEVEL } from '@shared/aisleSetup';
import type { CodeOption } from '../../lib/locationSetupApi';

interface LevelListEditorProps {
  /** Accessible name prefix, e.g. "Odd side" or "Zone 1 Odd". */
  label: string;
  levels: LevelSetting[];
  storageCodes: CodeOption[];
  sizes: CodeOption[];
  onChange: (levels: LevelSetting[]) => void;
}

const selectClass =
  'h-8 rounded border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 font-data text-xs text-[var(--text-primary)] outline-none focus:border-[var(--info)]';

/**
 * Edits one level list for New Aisle (#143): a storage code and size per level, top
 * level first. Levels are always numbered 1..N — adding copies the current top level,
 * removing takes the top one off.
 */
export function LevelListEditor({
  label,
  levels,
  storageCodes,
  sizes,
  onChange,
}: LevelListEditorProps) {
  const topDown = [...levels].sort((a, b) => b.level - a.level);

  function update(level: number, patch: Partial<LevelSetting>) {
    onChange(levels.map((l) => (l.level === level ? { ...l, ...patch } : l)));
  }

  function addLevel() {
    const top = topDown[0];
    const fallback = { storageCode: storageCodes[0]?.code ?? '', size: sizes[0]?.code ?? '' };
    onChange([
      ...levels,
      {
        level: levels.length + 1,
        storageCode: top?.storageCode ?? fallback.storageCode,
        size: top?.size ?? fallback.size,
      },
    ]);
  }

  function removeTop() {
    onChange(levels.filter((l) => l.level !== levels.length));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">
          {levels.length} {levels.length === 1 ? 'level' : 'levels'}
        </span>
        <button
          type="button"
          onClick={addLevel}
          disabled={levels.length >= MAX_LEVEL}
          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)] disabled:opacity-40"
          aria-label={`${label}: add a level`}
        >
          + Level
        </button>
        <button
          type="button"
          onClick={removeTop}
          disabled={levels.length <= 1}
          className="h-7 rounded border border-[var(--border-strong)] px-2 text-xs hover:bg-[var(--surface-5)] disabled:opacity-40"
          aria-label={`${label}: remove the top level`}
        >
          − Level
        </button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {topDown.map((l) => (
          <li key={l.level} className="flex items-center gap-1.5">
            <span className="w-8 font-data text-xs text-[var(--text-muted)]">L{l.level}</span>
            <select
              aria-label={`${label} level ${l.level} storage code`}
              value={l.storageCode}
              onChange={(e) => update(l.level, { storageCode: e.target.value })}
              className={selectClass}
            >
              {storageCodes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <select
              aria-label={`${label} level ${l.level} size`}
              value={l.size}
              onChange={(e) => update(l.level, { size: e.target.value })}
              className={selectClass}
            >
              {sizes.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
    </div>
  );
}
