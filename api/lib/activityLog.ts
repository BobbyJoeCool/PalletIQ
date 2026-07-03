import prisma from './prisma.js';

export interface LogEntry {
  userId: string;
  actionType: string;
  palletId?: number;
  locationAisle?: number;
  locationBin?: number;
  locationLevel?: number;
  dept?: number;
  class?: number;
  item?: number;
  details?: Record<string, unknown>;
}

/**
 * Writes a single entry to the ActivityLog table.
 * All optional fields (palletId, location components, DPCI components, details)
 * default to null when not supplied. The details object is JSON-serialized if present.
 *
 * This is the only function that writes to the activity log — all state-changing
 * endpoints call it so the log is complete and consistent.
 *
 * @param entry - Log entry requiring at minimum userId and actionType; all other fields are optional
 */
export async function writeLog(entry: LogEntry): Promise<void> {
  await prisma.activityLog.create({
    data: {
      userId: entry.userId,
      actionType: entry.actionType,
      palletId: entry.palletId ?? null,
      locationAisle: entry.locationAisle ?? null,
      locationBin: entry.locationBin ?? null,
      locationLevel: entry.locationLevel ?? null,
      dept: entry.dept ?? null,
      class: entry.class ?? null,
      item: entry.item ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
    },
  });
}
