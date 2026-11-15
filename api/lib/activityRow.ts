// Pure ActivityLog row → API shape serializer (#218). No Prisma client import.
import { formatLocationId } from './locationParser.js';
import { formatDpci } from './dpci.js';

/** An ActivityLog row as stored (the subset the read endpoints serialize). */
export interface ActivityRow {
  id: number; timestamp: Date; userId: string; actionType: string; palletId: number | null;
  locationAisle: number | null; locationBin: number | null; locationLevel: number | null;
  dept: number | null; class: number | null; item: number | null;
  reasonPrefix: string | null; reasonNumber: string | null; details: string | null;
}

/**
 * The one ActivityLog row → API shape serializer (#218; was written three times, in the
 * app-wide, per-pallet and per-location activity endpoints). Only a full aisle+bin+level
 * counts as a formattable location — some actionTypes (RESTAGE, RANGE_HOLD, RANGE_REL)
 * store only an aisle.
 */
export function serializeActivityRow(e: ActivityRow) {
  return {
    id: e.id,
    timestamp: e.timestamp,
    userId: e.userId,
    actionType: e.actionType,
    palletId: e.palletId,
    locationAisle: e.locationAisle,
    location: e.locationAisle != null && e.locationBin != null && e.locationLevel != null
      ? formatLocationId(e.locationAisle, e.locationBin, e.locationLevel)
      : null,
    dpci: e.dept != null ? formatDpci(e.dept, e.class!, e.item!) : null,
    reasonPrefix: e.reasonPrefix,
    reasonNumber: e.reasonNumber,
    details: e.details ? JSON.parse(e.details) as unknown : null,
  };
}
