# Screen Design: Universal Audit / Cross-Reference (Audit Tool, Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`, route `/screens/audit-tool`
**Bucket:** DESKTOP / Manager
**Roles:** every desktop user (LEAD/LWW, MANAGER/OM, ADMIN, and anyone whose home department is ICQA). The API enforces this itself.
**Issue:** #148 · **Design source:** `DevNotes/DesignPrompts/Desktop/Universal-Audit-Tool-design.md`

## Flow

1. The screen opens with three empty panes. Each has its own lookup control: a type (Location, Pallet ID, DPCI, Container ID, zNumber, Aisle) and an identifier.
2. Looking something up fills that pane with a current-state summary and, below it, the record's history, newest first.
3. Identifiers inside a summary or a history entry are **chips**. A chip can be:
   - dragged onto any pane, or
   - clicked, which opens a menu: Open in Pane 1 / Pane 2 / Pane 3.

   Either way the target pane is replaced immediately, with no confirmation. Sending a chip to its own pane is allowed.
4. Any pane can be pointed at an unrelated lookup at any time; panes are independent.
5. **Aisle** lookups take optional bin and level ranges and return one merged history across every matching location.
6. Each pane has **Print** and **Export**. **Print All** and **Export All** cover every pane that currently shows a record.

### Identifier formats

| Type | Accepts |
|---|---|
| Location | 8 digits, with or without dashes (`318-044-02`) |
| Pallet ID | digits |
| DPCI | 9 digits, with or without dashes (`054-01-0008`) |
| Container ID | compressed or canonical CID |
| zNumber | any case |
| Aisle | 1–3 digits; bin and level ranges are inclusive and either end may be left blank |

### Error handling

- **No record:** the pane shows "No record found." The other panes are untouched.
- **Malformed identifier or range:** "That is not a valid identifier for this lookup type." (Container IDs have their own message.)
- **API unreachable or other failure:** "The lookup failed. Check that the API is running and try again."
- **Export fails:** a banner above the panes.

### Status / messaging behavior

- A pane shows "Looking up…" while loading. If a second lookup is started in the same pane before the first returns, the first result is discarded.
- A history longer than 500 entries is cut to the most recent 500, and the pane says so.

## Layout

Three equal panes side by side, each scrolling on its own. Page header: title, Print All, Export All. Pane header: pane number, Print, Export; then the lookup control; then summary and history.

Each history entry shows the time (viewer's local time), the stored action code, the reason code if any, a chip per record it names (user, pallet, location, DPCI, container), and its remaining details as `key: value` pairs.

## Print and export

- **Print** prints one pane; **Print All** prints every filled pane as consecutive sections of one document. Printing uses a light, full-height layout with the app chrome and controls hidden.
- **Export** produces an `.xlsx` with one sheet. **Export All** produces one workbook with a sheet per filled pane (Pane 1, Pane 2, Pane 3). Each sheet has the summary at the top and the history as a table: Time, Source, Action, User, Pallet, Location, DPCI, Container ID, Reason, Details.

## Data

Read-only. One endpoint: `GET /api/audit?type=…&id=…` (plus `binStart`, `binEnd`, `levelStart`, `levelEnd` for an aisle). Response shape: `shared/audit.ts` (`AuditResult`).

| Lookup | Summary from | History from |
|---|---|---|
| Location | `Location`, pallets in it | `ActivityLog` rows naming that aisle + bin + level |
| Pallet ID | `Pallet`, item, received/put/pulled by | `ActivityLog` by pallet, plus `ContainerEvent` for every container cut from the pallet |
| DPCI | `Item`, pallet count | `ActivityLog` by dept/class/item |
| Container ID | the container's own table (full case / SSP pull master, overpack, SSP unit, stray each) | the same event history CII shows (`loadContainerEvents`) |
| zNumber | `User` (name, role, home department — never credentials) | `ActivityLog` by user, plus `ScanLog` by user |
| Aisle | location counts by status | `ActivityLog` by aisle, narrowed by bin/level if given |

**Writes:** none.

## Behind the Scenes

- **One shape for every table.** `api/lib/auditTrail.ts` converts `ActivityLog`, container-event and `ScanLog` rows to a common entry and merges them newest first. It is pure and unit-tested.
- **Aisle-wide entries.** Restage and range hold/release are logged against an aisle with no bin. They appear in an un-narrowed Aisle lookup and are left out of a narrowed one, since they cannot be placed inside or outside a range.
- **Access.** `requireDesktopAccess` re-checks desktop eligibility on the API, because a tablet login issues the same kind of token.

## Differences from the design doc

- The design's `Label` / `LabelEvent` are this schema's `Container` / `ContainerEvent` (and the other container tables).
- `ScanLog` has no pallet, location or item columns, so it only appears in zNumber history.
- DPCI history does not include HQ change tickets or handling-code alerts. Those tables come with DPCI Setup Edit (#142) and should be added here when it lands.
- Zone is not offered as an Aisle narrowing.

## Open items still remaining

- Add `ItemChangeTicket` / `HandlingCodeChangeAlert` to DPCI history once #142 exists.
- `ActivityLog` has no index on dept/class/item; DPCI lookups scan. Fine at demo volume, worth an index later.
- Location history should split "legacy" from current once Location Setup Edit (#143) adds `currentGenerationStartedAt`.
- Action codes are shown as stored, not as friendly text.
- The floor app's LOG screen is unchanged and remains the place to see your own activity (decided 2026-11-16).

## Change Log

- **2026-11-16:** first build (#148). Decisions: chip click opens a pane menu; Export All is one workbook with a sheet per pane; LOG and this screen both stay.
