import { app } from '@azure/functions';
import type { Timer, InvocationContext } from '@azure/functions';
import prisma from '../lib/prisma.js';
import { writeLog } from '../lib/activityLog.js';

const TIMEOUT_MINUTES = 5;

/**
 * Timer-triggered Azure Function that runs every minute.
 * Scans for Reservation rows that have been open longer than TIMEOUT_MINUTES (5 minutes).
 * For each expired reservation:
 *   1. Sets the reserved location back to STAGED if that's genuinely how findNextLocation
 *      found it (`wasStaged`, set back in directedPut/blockPut), or EMPTY otherwise — an
 *      expiring reservation shouldn't silently erase a GPMer's staging work (same fix as
 *      unassignPut/blockPut; see unassignPut's comment for why `=== true`, not `!== false`)
 *   2. Deletes the Reservation row
 *   3. Writes a RES_TMOUT activity log entry
 *
 * This runs server-side so reservations are cleaned up even if the client disconnects
 * or the worker closes the app without unassigning. The SDP screen detects expiry two
 * ways: proactively, by polling the directed location's status every 15s and noticing
 * it's no longer RESERVED (see SDPPage.tsx's startPolling); and reactively, as a
 * fallback, via the 404 a confirm/unassign/block call gets back if it happens to land
 * between polls.
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
    const releasedStatus = res.wasStaged === true ? 'STAGED' : 'EMPTY';
    await prisma.$transaction([
      prisma.location.update({
        where: { LocationID: { aisle: res.locationAisle, bin: res.locationBin, level: res.locationLevel } },
        data: { status: releasedStatus },
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
