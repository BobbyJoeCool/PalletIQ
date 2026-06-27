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
