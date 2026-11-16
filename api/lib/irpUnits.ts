// Unit counting for IRP-style production figures — how many cartons, pallets, puts or
// locations a set of ActivityLog rows represents for one function. Pure (no Prisma), so
// both IRP (lib/irpReporting.ts) and Team Prod Summary (lib/teamProd.ts, #147) count the
// same way. Extracted from irpReporting.ts's summarize() without behavior change.

/** The ActivityLog fields unit counting reads. */
export interface UnitLogRow {
  locationAisle: number | null;
  locationBin: number | null;
  locationLevel: number | null;
  details: string | null;
}

/** Parses a PULL row's `details` JSON for the fields IRP needs; never throws on malformed JSON. */
export function parsePulled(details: string | null): { pallets: number; cartons: number } {
  if (!details) return { pallets: 0, cartons: 0 };
  try {
    const d = JSON.parse(details) as { pulled?: { pallets?: number; cartons?: number } };
    return { pallets: d.pulled?.pallets ?? 0, cartons: d.pulled?.cartons ?? 0 };
  } catch {
    return { pallets: 0, cartons: 0 };
  }
}

/** Distinct Aisle+Bin+Level combinations among a set of log rows. */
export function countDistinctLocations(rows: UnitLogRow[]): number {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.locationAisle == null || r.locationBin == null || r.locationLevel == null) continue;
    seen.add(`${r.locationAisle}-${r.locationBin}-${r.locationLevel}`);
  }
  return seen.size;
}

/** Counts for one function's rows. `goalCount` feeds goal math; `primaryCount` is the headline figure. */
export interface FunctionUnits {
  locations: number | null;
  cartons: number | null;
  pallets: number | null;
  puts: number | null;
  goalCount: number;
  primaryCount: number;
}

/**
 * Counts one function's units from its rows: CA/CF cartons (plus distinct locations), FP
 * pallets (plus cartons), RP puts, HP locations, GPM pallets staged, CON pallets moved.
 * Other codes count nothing.
 */
export function countFunctionUnits(functionCode: string, rows: UnitLogRow[]): FunctionUnits {
  let locations: number | null = null;
  let cartons: number | null = null;
  let pallets: number | null = null;
  let puts: number | null = null;
  let goalCount = 0;

  if (functionCode === 'CA' || functionCode === 'CF') {
    const parsed = rows.map((r) => parsePulled(r.details));
    cartons = parsed.reduce((s, p) => s + p.cartons, 0);
    locations = countDistinctLocations(rows);
    goalCount = cartons;
  } else if (functionCode === 'FP') {
    const parsed = rows.map((r) => parsePulled(r.details));
    pallets = parsed.reduce((s, p) => s + p.pallets, 0);
    cartons = parsed.reduce((s, p) => s + p.cartons, 0);
    goalCount = pallets;
  } else if (functionCode === 'RP') {
    puts = rows.length;
    goalCount = puts;
  } else if (functionCode === 'HP') {
    locations = rows.length; // each Manual Put = one location; this IS the goal-metric count
    goalCount = locations;
  } else if (functionCode === 'GPM') {
    pallets = rows.length; // one STAGE row per staged location = one pallet staged
  } else if (functionCode === 'CON') {
    pallets = rows.length; // one CONSOLID row = one pallet moved/merged away
  }

  const primaryCount = (functionCode === 'CA' || functionCode === 'CF')
    ? (cartons ?? 0)
    : (pallets ?? puts ?? locations ?? cartons ?? 0);
  return { locations, cartons, pallets, puts, goalCount, primaryCount };
}
