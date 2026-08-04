import prisma from './prisma.js';

/** Anything with an `activityLog` delegate — the singleton `prisma` client or an
 *  in-flight `$transaction` callback's `tx` client both satisfy this structurally, so
 *  writeLog() can log inside a transaction instead of only ever writing through the
 *  singleton. */
type PrismaOrTxClient = Pick<typeof prisma, 'activityLog'>;

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
  /** IRP prod-function code (CA/CF/FP/RP/HP/GPM/CON) — only set on the subset of
   *  writeLog() calls that represent one of IRP's countable actions. */
  functionCode?: string;
  /** Reason code (issue #84), split into its two real columns — set on the subset of
   *  writeLog() calls whose action carries a reason code (hold placement, pallet edits). */
  reasonPrefix?: string;
  reasonNumber?: string;
  /** Explicit entry timestamp — only ever set by demo-reseed.ts, which backdates entries
   *  to simulate a full shift's worth of activity. Every live operational call site omits
   *  this and gets the schema's `@default(now())`. */
  timestamp?: Date;
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
 * @param client - Prisma client to write through; defaults to the singleton `prisma`.
 *   Pass an in-flight `tx` here to log as part of the same transaction (e.g. so the log
 *   entry rolls back together with the rest of the transaction on failure).
 */
export async function writeLog(entry: LogEntry, client: PrismaOrTxClient = prisma): Promise<void> {
  await client.activityLog.create({
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
      functionCode: entry.functionCode ?? null,
      reasonPrefix: entry.reasonPrefix ?? null,
      reasonNumber: entry.reasonNumber ?? null,
      ...(entry.timestamp && { timestamp: entry.timestamp }),
    },
  });
}
