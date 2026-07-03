import { app } from '@azure/functions';
import type { Timer, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { writeLog } from '../lib/activityLog.js';

const TIMEOUT_MINUTES = 5;

/**
 * Timer-triggered Azure Function that runs every minute.
 * Scans for Reservation rows that have been open longer than TIMEOUT_MINUTES (5 minutes).
 * For each expired reservation:
 *   1. Sets the reserved location back to EMPTY
 *   2. Deletes the Reservation row
 *   3. Writes a RES_TMOUT activity log entry
 *
 * This runs server-side so reservations are cleaned up even if the client disconnects
 * or the worker closes the app without unassigning. The SDP screen detects expiry on
 * the next user action (confirm/unassign/block) via the resulting 404 response.
 *
 * @param _timer - Azure Functions timer trigger metadata (unused)
 * @param ctx - Invocation context used for logging the count of cleared reservations
 */
async function clearExpiredReservations(_timer: Timer, ctx: InvocationContext): Promise<void> {
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

  const expired = await prisma.reservation.findMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (expired.length === 0) return;

  ctx.log(`Clearing ${expired.length} expired reservation(s)`);

  // Clear each expired reservation individually so each gets its own log entry.
  for (const res of expired) {
    await prisma.$transaction([
      prisma.location.update({
        where: { LocationID: { aisle: res.locationAisle, bin: res.locationBin, level: res.locationLevel } },
        data: { status: 'EMPTY' },
      }),
      prisma.reservation.delete({ where: { id: res.id } }),
    ]);

    await writeLog({
      userId:        res.workerZ,
      actionType:    'RES_TMOUT',
      palletId:      res.palletId,
      locationAisle: res.locationAisle,
      locationBin:   res.locationBin,
      locationLevel: res.locationLevel,
      details:       { reservationId: res.id, expiredAfterMinutes: TIMEOUT_MINUTES },
    });
  }
}

app.timer('clearExpiredReservations', {
  schedule: '0 * * * * *', // every minute
  handler: clearExpiredReservations,
});
