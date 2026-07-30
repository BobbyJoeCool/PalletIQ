/**
 * Small demo/seed-data generation utilities shared by `prisma/seed.ts` (the from-scratch
 * database seed, run via `tsx`, excluded from the API's own `tsc` build) and
 * `functions/demo-reseed.ts` (the pre-login "Reseed Test Data" dev-tools endpoint, part
 * of the compiled API). Deliberately dependency-free — no Prisma Client import, no
 * `dotenv` side effects — so it's safe for both a standalone script and a compiled Azure
 * Function to import identically.
 */

/** Returns a random integer in the inclusive range [min, max]. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Returns a random element from an array. */
export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher-Yates shuffle, returning a new array (doesn't mutate the input). */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** How many cartons make up one full pallet of this quantity (Pallet.cartonsPerPallet,
 *  v1.6.11) — a flat +1 if there's any loose-SSP remainder at all, not a ratio-based
 *  calculation. Shared by every pallet-creation code path so the rule stays identical. */
export function cartonsPerPalletFor(cartons: number, looseSSPs: number): number {
  return cartons + (looseSSPs > 0 ? 1 : 0);
}

/** Converts a Date to a Julian-style date int (YYYY + zero-padded day-of-year), e.g. 2026175. */
export function julianDate(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return d.getFullYear() * 1000 + Math.floor(diff / 86_400_000);
}

/**
 * Returns a closure generating random 8-digit Pallet IDs, retrying against `usedPids`
 * until unique (adding each returned id so later calls in the same run don't collide).
 * Callers seed `usedPids` themselves — empty for a from-scratch run (`seed.ts`),
 * pre-populated with already-existing DB ids for an incremental reseed
 * (`demo-reseed.ts`) — the generation/collision logic itself is identical either way.
 */
export function makePidGenerator(usedPids: Set<number> = new Set()): () => number {
  return () => {
    let pid: number;
    do {
      pid = randomInt(10_000_000, 99_999_999);
    } while (usedPids.has(pid));
    usedPids.add(pid);
    return pid;
  };
}

/** Builds a Container ID string: store(4) + DPCI(9) + pid(8) + random(8) + batchDate. */
export function genCid(storeId: number, dept: number, cls: number, item: number, pid: number, batchDate: number): string {
  const rnd = Math.random().toString(36).substring(2, 10).padEnd(8, '0');
  return (
    String(storeId).padStart(4, '0') +
    String(dept).padStart(3, '0') +
    String(cls).padStart(2, '0') +
    String(item).padStart(4, '0') +
    String(pid).padStart(8, '0') +
    rnd +
    String(batchDate)
  );
}
