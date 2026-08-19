# Glossary of Terms

## Core Objects

**Pallet:** A digital object that holds cartons for transport or storage. Does not need to
correspond to a physical pallet. Has a unique Pallet ID (**PID**), an 8-digit,
app-generated number.

**Location:** A place in the warehouse where freight is stored. A Location is made up of:
- **Aisle** — the aisle number (3 digits)
- **Bin** — the floor-to-ceiling position within that aisle, numbered on the racking or
  floor (3 digits)
- **Level** — a vertical progression, where 1 is the floor level and each rack level up
  adds one (0 is reserved for bulk) (2 digits)

Together these make up the 8-digit **Location ID (LID)**.

**DPCI:** A unique identifier for an item, made up of:
- **Department** — a 3-digit number for the vendor/department
- **Class** — a 2-digit number for the item's class
- **Item** — a 4-digit number for the item within that Department/Class

Together these make up the 9-digit **DPCI**.

**Container:** An object that holds product, represented by a physical label that can be
scanned to track its movement and status. (Renamed from "Label" in the schema — a physical
label can also represent a pallet or a location, but only container labels live in this
table. Primary key is **CID**.)

## Case Pack Concepts

**VCP (Vendor Case Pack):** The number of Eaches in a full carton.

**SSP (Store Ship Pack):** The number of Eaches a store orders in one unit. If SSP equals
VCP, the whole carton ships as-is. SSP must always be a factor of VCP. A carton's inner
case is typically packaged into SSPs — a 12/3 (VCP/SSP) carton has 4 mini-cases inside.
SSPs are packed into overpack cartons for shipping.

**Eaches:** An individual saleable unit of product.

**Handling Codes (Master Pack / Inner Pack):** Two independent fields on an Item, each set
to one of **C** (Conveyable), **NC** (Non-Conveyable), or **BP** (Breakpack):
- **Master Pack** — what the whole carton drops as.
- **Inner Pack** — what the SSP drops as if/when broken out of a breakpack carton. This is
  independent of Master Pack — an item can be Master Pack BP with Inner Pack NC, if the
  vendor ships inner packs inside conveyable boxes.

## Container Types (new — needs more definition)

**Full Case Container (FCC):** A container that is a regular, unbroken carton of product.

**Overpack Container (OPC):** A container holding SSPs (or Eaches) from multiple different
DPCIs packed together.

> **Open item — schema conflict:** The current `Container` model has a single DPCI
> (dept/class/item) as a foreign key on each row. A multi-DPCI OPC doesn't fit that
> shape as a single Container record. Before this goes further, this needs a decision:
> does OPC need a join/child-item table (one OPC row + multiple DPCI/quantity lines), or
> is there a different way you want to represent it? Worth its own short design pass
> rather than guessing here.
>
> Also still open: exactly how FCC/OPC relate to Master Pack/Inner Pack (C/NC/BP) —
> are FCC/OPC a container-level classification that sits alongside the item-level
> handling codes, or do they replace them for describing an actual physical container?

## Other Established Terms (surfaced from past schema/design sessions — may be useful here)

- **Zone:** A field on both Item and Location used for packing/routing groupings.
- **Storage Code:** A 2-character code on Item, Location, and Pallet describing storage
  type/handling.
- **Breakpack Zone:** A required field on every Item (reuses the `PackingZone` table),
  used for breakpack routing.
- **On Hold:** A boolean on Item for items that must not be sold (recall, timed release,
  etc.) — blocks shipment, flags receipt.
- **Hold Type:** A code (1 letter for the department placing the hold + 2-digit reason
  code, e.g. `A01`) applied to a Location.
- **zNumber:** A worker's login ID, format `z###x##` (z + 3 digits + 1 letter + 2 digits),
  always 7 characters.
- **Pallet Status values:** Put Pending, Stored, Pull Pending, Pulled, Canceled.
- **Reservation:** A temporary hold on a Location while a worker is actively putting a
  pallet away (auto-clears after a timeout).

## Change Log

| Date | Change |
|---|---|
| 2026-07-30 | Initial draft |
