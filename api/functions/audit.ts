import { app } from '../lib/functionsRuntime.js';
import type { HttpRequest } from '../lib/functionsRuntime.js';
import prisma from '../lib/prisma.js';
import { withHandler } from '../lib/response.js';
import { requireDesktopAccess } from '../lib/desktopAccess.js';
import { parseFullLocationBarcode, formatLocationId } from '../lib/locationParser.js';
import { displayLocationId } from '../../shared/location.js';
import { parseDpci, formatDpci } from '../lib/dpci.js';
import { parseCidOrThrow, CID_TYPE, CID_TYPE_LABELS, type CidTypeCode } from '../lib/cidParser.js';
import { loadContainerEvents } from './containerInquiry.js';
import {
  describeRange, fromActivityRow, fromContainerEvent, fromScanLogRow, isOpenRange,
  mergeTrail, parseRange, type NumericRange,
} from '../lib/auditTrail.js';
import {
  AUDIT_TRAIL_LIMIT, isAuditEntityType,
  type AuditEntry, type AuditResult, type AuditSummaryField,
} from '../../shared/audit.js';

// Desktop Audit Tool (Universal Audit / Cross-Reference, GitHub #148). One read-only
// endpoint that looks up any auditable record and returns its current state plus its
// history in one common shape (shared/audit.ts), so the three panes render and
// cross-reference every entity type the same way. Row → entry conversion and trail
// merging are in lib/auditTrail.ts; this file is the queries.

/** One more than the limit, so a lookup can tell "exactly the limit" from "cut off". */
const FETCH_LIMIT = AUDIT_TRAIL_LIMIT + 1;

const NOT_FOUND = () => Object.assign(new Error('NOT_FOUND'), { status: 404 });
const INVALID_INPUT = () => Object.assign(new Error('INVALID_INPUT'), { status: 400 });

/** @returns `First Last (zNumber)` for a summary line */
function personLabel(user: { zNumber: string; firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName} (${user.zNumber})`;
}

/** @returns a summary line holding a timestamp, which the client shows in local time */
function timeField(label: string, date: Date): AuditSummaryField {
  return { label, value: date.toISOString(), isTime: true };
}

/** @returns a summary line naming a person, as a cross-reference to their own trail */
function personField(label: string, user: { zNumber: string; firstName: string; lastName: string }): AuditSummaryField {
  return { label, value: personLabel(user), ref: { type: 'USER', id: user.zNumber } };
}

/** Location: current state, the pallets in it, and every log entry naming that location. */
async function auditLocation(rawId: string): Promise<AuditResult> {
  const parsed = parseFullLocationBarcode(rawId.replace(/-/g, ''));
  if (!parsed) throw INVALID_INPUT();

  const location = await prisma.location.findUnique({
    where: { LocationID: parsed },
    include: { pallets: { select: { pid: true, status: true }, orderBy: { pid: 'asc' } } },
  });
  if (!location) throw NOT_FOUND();

  const rows = await prisma.activityLog.findMany({
    where: { locationAisle: parsed.aisle, locationBin: parsed.bin, locationLevel: parsed.level },
    orderBy: { timestamp: 'desc' },
    take: FETCH_LIMIT,
  });

  const id = formatLocationId(parsed.aisle, parsed.bin, parsed.level);
  const fields: AuditSummaryField[] = [
    { label: 'Status', value: location.status },
    { label: 'Hold', value: location.holdCategory ?? 'None' },
    { label: 'Aisle', value: String(location.aisle), ref: { type: 'AISLE', id: String(location.aisle) } },
    { label: 'Zone', value: String(location.zone) },
    { label: 'Storage code', value: location.storageCode },
    { label: 'Size', value: location.size },
    { label: 'Contraction', value: location.contraction ? 'Yes' : 'No' },
    ...location.pallets.map((pallet): AuditSummaryField => ({
      label: 'Pallet',
      value: `${pallet.pid} (${pallet.status})`,
      ref: { type: 'PALLET', id: String(pallet.pid) },
    })),
  ];

  return { type: 'LOCATION', id, title: `Location ${displayLocationId(id)}`, fields, ...mergeTrail(rows.map(fromActivityRow)) };
}

/** Pallet: current state, its log entries, and the events of every container cut from it. */
async function auditPallet(rawId: string): Promise<AuditResult> {
  if (!/^\d+$/.test(rawId)) throw INVALID_INPUT();
  const pid = parseInt(rawId, 10);

  const pallet = await prisma.pallet.findUnique({
    where: { pid },
    include: {
      itemRef: { select: { descShort: true } },
      receivedBy: { select: { zNumber: true, firstName: true, lastName: true } },
      putBy: { select: { zNumber: true, firstName: true, lastName: true } },
      lastPulledBy: { select: { zNumber: true, firstName: true, lastName: true } },
    },
  });
  if (!pallet) throw NOT_FOUND();

  const dpci = formatDpci(pallet.dept, pallet.class, pallet.item);
  const [rows, containerEvents] = await Promise.all([
    prisma.activityLog.findMany({ where: { palletId: pid }, orderBy: { timestamp: 'desc' }, take: FETCH_LIMIT }),
    prisma.containerEvent.findMany({
      where: { container: { pid } },
      orderBy: { timestamp: 'desc' },
      take: FETCH_LIMIT,
    }),
  ]);

  const entries: AuditEntry[] = [
    ...rows.map(fromActivityRow),
    ...containerEvents.map((event) => fromContainerEvent(
      event.containerId,
      {
        source: 'ContainerEvent',
        eventType: event.eventType,
        timestamp: event.timestamp,
        userZ: event.userZ,
        details: { reasonPrefix: event.reasonPrefix, reasonNumber: event.reasonNumber, reasonNote: event.reasonNote },
      },
      event.id,
      { palletId: pid, dpci },
    )),
  ];

  const fields: AuditSummaryField[] = [
    { label: 'Status', value: pallet.status },
    { label: 'DPCI', value: dpci, ref: { type: 'DPCI', id: dpci } },
    { label: 'Item', value: pallet.itemRef.descShort },
  ];
  if (pallet.locationAisle != null && pallet.locationBin != null && pallet.locationLevel != null) {
    const locationId = formatLocationId(pallet.locationAisle, pallet.locationBin, pallet.locationLevel);
    fields.push({ label: 'Location', value: displayLocationId(locationId), ref: { type: 'LOCATION', id: locationId } });
  } else {
    fields.push({ label: 'Location', value: 'None' });
  }
  fields.push(
    { label: 'Cartons', value: `${pallet.currentCartons} of ${pallet.receivedCartons} received` },
    { label: 'SSPs', value: `${pallet.currentSSPs} of ${pallet.receivedSSPs} received` },
    { label: 'VCP / SSP', value: `${pallet.vcp} / ${pallet.ssp}` },
    timeField('Received', pallet.receivedAt),
    personField('Received by', pallet.receivedBy),
  );
  if (pallet.putBy && pallet.putAt) {
    fields.push(timeField('Put', pallet.putAt), personField('Put by', pallet.putBy));
  }
  if (pallet.lastPulledBy && pallet.lastPulledAt) {
    fields.push(timeField('Last pulled', pallet.lastPulledAt), personField('Last pulled by', pallet.lastPulledBy));
  }

  return { type: 'PALLET', id: String(pid), title: `Pallet ${pid}`, fields, ...mergeTrail(entries) };
}

/** DPCI: the item's setup, where it is stored, and every log entry naming the item. */
async function auditDpci(rawId: string): Promise<AuditResult> {
  const parsed = parseDpci(rawId);
  if (!parsed) throw INVALID_INPUT();

  const item = await prisma.item.findUnique({
    where: { DPCI: parsed },
    include: { packingZone: true, storageRef: true },
  });
  if (!item) throw NOT_FOUND();

  const [rows, palletCount] = await Promise.all([
    prisma.activityLog.findMany({
      where: { dept: parsed.dept, class: parsed.class, item: parsed.item },
      orderBy: { timestamp: 'desc' },
      take: FETCH_LIMIT,
    }),
    prisma.pallet.count({ where: { dept: parsed.dept, class: parsed.class, item: parsed.item } }),
  ]);

  const id = formatDpci(parsed.dept, parsed.class, parsed.item);
  const fields: AuditSummaryField[] = [
    { label: 'Name', value: item.name },
    { label: 'Description', value: item.descShort },
    { label: 'UPC', value: item.upc },
    { label: 'Storage code', value: item.storageCode },
    { label: 'Packing zone', value: String(item.packingZoneCode) },
    { label: 'Conveyable', value: item.conveyable ? 'Yes' : 'No' },
    { label: 'Requires expiration date', value: item.requiresExpirationDate ? 'Yes' : 'No' },
    { label: 'Pallets on record', value: String(palletCount) },
  ];

  return { type: 'DPCI', id, title: `DPCI ${id}`, fields, ...mergeTrail(rows.map(fromActivityRow)) };
}

/**
 * The current-state lines for a CID. Each container type is its own table with its own
 * fields; this reads the few that identify it and place it.
 *
 * @returns the summary lines, plus the pallet/item the CID belongs to where it has one
 * @throws 404 NOT_FOUND if no record of that type has this CID
 */
async function cidSummary(
  cid: string,
  type: CidTypeCode,
): Promise<{ fields: AuditSummaryField[]; palletId: number | null; dpci: string | null }> {
  const fields: AuditSummaryField[] = [{ label: 'Type', value: CID_TYPE_LABELS[type] }];
  const dpciField = (dpci: string): AuditSummaryField => ({ label: 'DPCI', value: dpci, ref: { type: 'DPCI', id: dpci } });

  if (type === CID_TYPE.FULL_CASE || type === CID_TYPE.SSP_PULL_MASTER) {
    const container = await prisma.container.findUnique({ where: { cid } });
    if (!container) throw NOT_FOUND();
    const dpci = formatDpci(container.dept, container.class, container.item);
    fields.push(
      { label: 'Status', value: container.status },
      dpciField(dpci),
      { label: 'Pallet', value: String(container.pid), ref: { type: 'PALLET', id: String(container.pid) } },
      { label: 'Pull function', value: container.pullFunction },
      { label: 'Destination store', value: String(container.destinationStore) },
      { label: 'Cartons / SSPs', value: `${container.cartonQuantity} / ${container.sspQuantity}` },
    );
    return { fields, palletId: container.pid, dpci };
  }

  if (type === CID_TYPE.OVERPACK) {
    const overpack = await prisma.overpack.findUnique({ where: { cid } });
    if (!overpack) throw NOT_FOUND();
    fields.push(
      { label: 'Status', value: overpack.open ? 'OPEN' : 'CLOSED' },
      { label: 'Destination store', value: String(overpack.destinationStore) },
      timeField('Created', overpack.createdAt),
    );
    return { fields, palletId: null, dpci: null };
  }

  if (type === CID_TYPE.SSP_UNIT) {
    const unit = await prisma.sSPUnit.findUnique({ where: { cid } });
    if (!unit) throw NOT_FOUND();
    const dpci = formatDpci(unit.dept, unit.class, unit.item);
    fields.push(
      { label: 'Status', value: unit.status },
      dpciField(dpci),
      { label: 'Source container', value: unit.sourceContainerId, ref: { type: 'CID', id: unit.sourceContainerId } },
      { label: 'Destination store', value: String(unit.destinationStore) },
      { label: 'Eaches', value: `${unit.actualEachQty} of ${unit.standardEachQty} standard` },
    );
    return { fields, palletId: null, dpci };
  }

  const stray = await prisma.strayEach.findUnique({ where: { cid } });
  if (!stray) throw NOT_FOUND();
  const dpci = formatDpci(stray.dept, stray.class, stray.item);
  fields.push(
    { label: 'Status', value: stray.status },
    dpciField(dpci),
    { label: 'Destination store', value: String(stray.destinationStore) },
    { label: 'Eaches', value: String(stray.eachQty) },
    { label: 'Found by', value: stray.foundByZ, ref: { type: 'USER', id: stray.foundByZ } },
  );
  return { fields, palletId: null, dpci };
}

/** CID: the container's current state and the same event history CII shows for it. */
async function auditCid(rawId: string): Promise<AuditResult> {
  const { canonical, type } = parseCidOrThrow(rawId);
  const summary = await cidSummary(canonical, type);
  const { events } = await loadContainerEvents(canonical, type);

  const entries = events.map((event, index) =>
    fromContainerEvent(canonical, event, index, { palletId: summary.palletId, dpci: summary.dpci }));

  return { type: 'CID', id: canonical, title: `Container ${canonical}`, fields: summary.fields, ...mergeTrail(entries) };
}

/** zNumber: who the person is, and everything logged under their name. */
async function auditUser(rawId: string): Promise<AuditResult> {
  const zNumber = rawId.toLowerCase();
  if (!/^[a-z0-9]{1,7}$/.test(zNumber)) throw INVALID_INPUT();

  // Explicit select: the row also holds the PIN and password hashes, which never leave the API.
  const user = await prisma.user.findUnique({
    where: { zNumber },
    select: {
      zNumber: true, firstName: true, lastName: true, role: true,
      department: { select: { id: true, name: true } },
    },
  });
  if (!user) throw NOT_FOUND();

  const [rows, scans] = await Promise.all([
    prisma.activityLog.findMany({ where: { userId: zNumber }, orderBy: { timestamp: 'desc' }, take: FETCH_LIMIT }),
    prisma.scanLog.findMany({ where: { zNumber }, orderBy: { timestamp: 'desc' }, take: FETCH_LIMIT }),
  ]);

  const fields: AuditSummaryField[] = [
    { label: 'Name', value: `${user.firstName} ${user.lastName}` },
    { label: 'Role', value: user.role },
    { label: 'Home department', value: `${user.department.name} (${user.department.id})` },
  ];

  return {
    type: 'USER',
    id: user.zNumber,
    title: `${user.firstName} ${user.lastName} — ${user.zNumber}`,
    fields,
    ...mergeTrail([...rows.map(fromActivityRow), ...scans.map(fromScanLogRow)]),
  };
}

/** @returns a Prisma number filter for the range, or undefined if it is fully open */
function rangeFilter(range: NumericRange): { gte?: number; lte?: number } | undefined {
  if (isOpenRange(range)) return undefined;
  return {
    ...(range.start != null && { gte: range.start }),
    ...(range.end != null && { lte: range.end }),
  };
}

/**
 * Aisle, optionally narrowed to a bin and/or level range: one merged trail across every
 * matching location. With no narrowing, entries logged against the aisle as a whole
 * (restage, range hold/release — which store no bin) are included too; with narrowing
 * they are not, since they cannot be placed inside or outside the range.
 */
async function auditAisle(rawId: string, bins: NumericRange, levels: NumericRange): Promise<AuditResult> {
  if (!/^\d{1,3}$/.test(rawId)) throw INVALID_INPUT();
  const aisle = parseInt(rawId, 10);
  const bin = rangeFilter(bins);
  const level = rangeFilter(levels);

  const byStatus = await prisma.location.groupBy({
    by: ['status'],
    where: { aisle, ...(bin && { bin }), ...(level && { level }) },
    _count: { _all: true },
    orderBy: { status: 'asc' },
  });
  const total = byStatus.reduce((sum, group) => sum + group._count._all, 0);
  if (total === 0) throw NOT_FOUND();

  const rows = await prisma.activityLog.findMany({
    where: { locationAisle: aisle, ...(bin && { locationBin: bin }), ...(level && { locationLevel: level }) },
    orderBy: { timestamp: 'desc' },
    take: FETCH_LIMIT,
  });

  const binText = describeRange(bins);
  const levelText = describeRange(levels);
  const fields: AuditSummaryField[] = [
    { label: 'Bins', value: binText ?? 'All' },
    { label: 'Levels', value: levelText ?? 'All' },
    { label: 'Locations', value: String(total) },
    ...byStatus.map((group): AuditSummaryField => ({ label: group.status, value: String(group._count._all) })),
  ];

  const narrowing = [binText && `bins ${binText}`, levelText && `levels ${levelText}`].filter(Boolean).join(', ');
  return {
    type: 'AISLE',
    id: String(aisle),
    title: narrowing ? `Aisle ${aisle} — ${narrowing}` : `Aisle ${aisle}`,
    fields,
    ...mergeTrail(rows.map(fromActivityRow)),
  };
}

/**
 * Looks up one auditable record for the desktop Audit Tool.
 *
 * @param req - HTTP request with query params:
 *   `type` — LOCATION | PALLET | DPCI | CID | USER | AISLE
 *   `id` — 8-digit location (dashes allowed), numeric pallet ID, 9-digit DPCI (dashes
 *     allowed), compressed or canonical CID, zNumber, or aisle number
 *   `binStart`, `binEnd`, `levelStart`, `levelEnd` — AISLE only; optional inclusive ranges
 * @returns an {@link AuditResult}: canonical id, title, summary lines (some carrying a
 *   cross-reference), and the trail newest first, capped at 500 entries with `truncated`
 * @throws 400 INVALID_INPUT for an unknown type, a missing or malformed id, or a bad
 *   range; 400 INVALID_CID_FORMAT for a malformed CID; 404 NOT_FOUND if no such record;
 *   401 UNAUTHORIZED / 403 NO_DESKTOP_ACCESS per requireDesktopAccess
 */
async function getAudit(req: HttpRequest): Promise<unknown> {
  await requireDesktopAccess(req);

  const params = new URL(req.url).searchParams;
  const type = params.get('type');
  const id = (params.get('id') ?? '').trim();
  if (!isAuditEntityType(type) || !id) throw INVALID_INPUT();

  switch (type) {
    case 'LOCATION': return auditLocation(id);
    case 'PALLET': return auditPallet(id);
    case 'DPCI': return auditDpci(id);
    case 'CID': return auditCid(id);
    case 'USER': return auditUser(id);
    case 'AISLE': {
      const bins = parseRange(params.get('binStart'), params.get('binEnd'));
      const levels = parseRange(params.get('levelStart'), params.get('levelEnd'));
      if (!bins || !levels) throw INVALID_INPUT();
      return auditAisle(id, bins, levels);
    }
  }
}

app.http('getAudit', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'audit',
  handler: withHandler(getAudit),
});
