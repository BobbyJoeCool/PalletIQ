// Prod goal reads (#146). Goals keep dated history; every reader asks for the rate in
// force on a date through here, so none of them picks "the" row by accident.

import prisma from './prisma.js';
import { goalInForce, type GoalRow } from '../../shared/prodPlan.js';

/** @returns a @db.Date column value as "YYYY-MM-DD" (Prisma returns those at UTC midnight) */
export function isoFromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** @returns a "YYYY-MM-DD" date as the value to store in a @db.Date column */
export function dbDateFromIso(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** @returns every prod goal row, oldest first */
export async function loadGoalRows(): Promise<GoalRow[]> {
  const rows = await prisma.prodGoal.findMany({ orderBy: [{ functionCode: 'asc' }, { effectiveDate: 'asc' }] });
  return rows.map((r) => ({
    id: r.id,
    functionCode: r.functionCode,
    rate: Number(r.rate),
    unit: r.unit,
    rate2: r.rate2 == null ? null : Number(r.rate2),
    unit2: r.unit2,
    effectiveDate: isoFromDbDate(r.effectiveDate),
  }));
}

/** @returns each function's goal in force on a date, by function code */
export async function goalsInForce(isoDate: string): Promise<Map<string, GoalRow>> {
  const rows = await loadGoalRows();
  const byFunction = new Map<string, GoalRow>();
  for (const code of new Set(rows.map((r) => r.functionCode))) {
    const row = goalInForce(rows, code, isoDate);
    if (row) byFunction.set(code, row);
  }
  return byFunction;
}
