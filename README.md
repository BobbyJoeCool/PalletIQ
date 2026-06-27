# PalletIQ

## Table of Contents

- [Why This Exists](#why-this-exists)
- [What It Does](#what-it-does)
- [What's Deliberately Left Out](#whats-deliberately-left-out)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How This Was Built](#how-this-was-built)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Status](#status)

---

## Why This Exists

I spent 20 years in warehouse operations and retail management — including inventory control and quality assurance at Target Distribution, and five years as a store manager in convenience retail. PalletIQ is built from that experience, specifically the operational middle layer of a warehouse that most WMS demo projects skip over: not receiving, not shipping, but everything that happens to a pallet between those two events.

Most portfolio inventory projects model inventory at the item level — "we have 40 units of SKU 12345" — and stop there. That's not how a real warehouse works. A real warehouse tracks inventory **by location**, handles partial cartons and loose units alongside full pallets, and has to account for things like a pallet getting moved mid-shift, a location going bad, or a worker needing to override a system suggestion because they can see something the system can't.

PalletIQ is designed as a focused improvement on a real system I used for years. It keeps the parts that worked, fixes the friction points that didn't, and adds one genuinely new feature (Stage Aisle) that the original system never had.

---

## What It Does

PalletIQ covers four core functions:

- **Pull** — a single screen handling every pull type (Carton Air, Full Pallet, Bulk, Carton Floor), driven by pull labels and confirmed through a two-path verification system (Pallet ID or an alternate UPC/location scan).
- **Put** — both directed put-away (the system tells you where to go, with zone logic that respects how aisles actually get staged) and manual put (you tell the system where you put it, with safety checks).
- **Pallet ID and Location ID lookup** — full detail screens for any pallet or any location, reachable by tapping any pallet or location reference anywhere in the app.
- **Empty Locations** — both an aisle-level summary and a visual, zone-by-zone map of an aisle's open locations, built for the person physically staging that aisle.

It's also built around a few opinionated design decisions that came directly from warehouse floor experience:

- **No blocking pop-ups.** Workers are moving fast and scanning constantly — the system gives feedback through a persistent message bar and audio alerts, not modal dialogs that have to be dismissed.
- **Tap anything.** Every pallet ID and location ID rendered anywhere in the app is a live link to that thing's detail screen.
- **Numeric input first.** There's no physical keyboard on the device, so almost everything — pallet IDs, locations, quantities — is entered on an on-screen numpad rather than a full keyboard.
- **A real permission hierarchy.** Four roles (Worker, Inventory Manager, Lead Worker, System Admin), strictly inheriting upward, with field-level and action-level gating rather than hiding whole screens from people who can't use every feature on them.

The full functional specification lives in [`outline.md`](./outline.md).

---

## What's Deliberately Left Out

This is intentionally **not** a full WMS. It excludes inbound receiving, outbound shipping, vendor and customer management, procurement, and multi-warehouse support — those are different systems with different concerns, and bolting them on would dilute what this project is actually trying to demonstrate.

Warehouse setup (creating aisles and locations) and user account management are also out of scope for the same reason — they're administrative CRUD that doesn't showcase the interesting domain logic, so this project seeds that data directly instead of building screens for it.

See the **Explicitly Out of Scope** section of [`outline.md`](./outline.md) for the full list, including a couple of forward-looking notes on what the data model intentionally leaves room for later.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| API | Azure Functions (TypeScript / Node.js) |
| Hosting | Azure Static Web Apps |
| Database | Azure SQL |
| ORM | Prisma |
| Auth | Badge + PIN login, backed by Azure AD B2C token issuance |

This is an intentionally all-TypeScript stack. A `shared/` package defines types once — a `Pallet` or a `Location` — and both the React frontend and the Azure Functions backend import the same definitions. A change to a data shape is a compile error in both places at once, not a runtime surprise.

---

## Architecture

The project is a single monorepo with three top-level pieces:

- **`src/`** — the React app, built with Vite.
- **`api/`** — Azure Functions, one per route, sharing a Prisma client singleton against Azure SQL.
- **`shared/`** — TypeScript types and constants imported by both of the above.

Azure Static Web Apps hosts the built React app and proxies `/api/*` requests straight to the Functions in `api/`, so there's no separate API gateway or CORS configuration to manage — it's one deployable unit.

A few architectural decisions worth calling out for anyone reviewing this as a portfolio piece:

- **Location-level inventory**, not item-level. The `Location` model holds a nullable reference to the `Pallet` currently stored there (rather than the reverse), so a pallet's location is always found by querying which location currently points to it — guaranteeing a pallet can never appear to exist in two places at once. Quantities are tracked in three units simultaneously (Pallets, Cartons, SSPs) because real warehouse locations can hold any combination of full pallets, full cartons, and loose units.
- **Reservation locking with server-side timeout cleanup.** When a worker is directed to a put-away location, that location is locked (`Reserved`) and the worker's screen is locked to that transaction. A timer-triggered Azure Function clears stale reservations after five minutes, so a dropped connection or a worker walking away doesn't permanently strand a location.
- **An activity log designed for queries, not just storage.** Every meaningful transaction (puts, pulls, moves, holds, pallet edits) writes to a database table rather than a flat log file, specifically so it can be filtered by location, pallet, item, or user — and so a logged reference can link back to the live record it describes.
- **Pallet quantity units (demo simplification):** In production, the `Pallet` table would carry a `cartonsPerPallet` field set at receiving — the number of cartons that constitute one full pallet unit, used to convert between pallet-count and carton-count when tracking bulk locations that hold multiple complete pallets. The demo omits this field and uses `receivedCartons` as a proxy; a real deployment would add the field and populate it at the receiving step.

---

## How This Was Built

This project was designed and built in close collaboration with Claude (Anthropic), working through the functional design conversationally before any code was written — starting from the existing Target System's behavior, identifying what to keep and what to improve, and only then translating that into a tech stack, a data model, and a build plan. The full design conversation is reflected in [`outline.md`](./outline.md), which was written before implementation began.

---

## Project Structure

```
palletiq/
├── src/                  React app (Vite)
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/         Typed API client calls
│   ├── context/          Auth, global state
│   └── types/
├── api/                  Azure Functions (Node/TypeScript)
│   ├── src/
│   │   ├── functions/    One file per route
│   │   ├── lib/          Prisma client, shared helpers
│   │   └── middleware/   Auth, validation
│   └── host.json
├── shared/               Types and constants used by both src/ and api/
│   ├── types/
│   └── constants/
├── staticwebapp.config.json
└── vite.config.ts
```

---

## Documentation

- [`outline.md`](./outline.md) — the full functional specification: every screen, every rule, every edge case
- [`tasks.md`](./tasks.md) — the build plan, broken into phases, features, and steps
- [`database.mmd`](./database.mmd) — entity-relationship diagram
- [`ui-flow.mmd`](./ui-flow.mmd) — top-level screen-to-screen navigation map
- `putaway-flow.mmd` — put-away/move task lifecycle (planned — built alongside Put implementation, not yet created)
- `pull-flow.mmd` — pull task lifecycle (planned — built alongside Pull implementation, not yet created)
- Per-screen functional `.md` docs — planned, one created as each function is individually designed in detail, not yet created

---

## Status

In active design. `outline.md`, `tasks.md`, `database.mmd`, and `ui-flow.mmd` are in place and current. `putaway-flow.mmd`, `pull-flow.mmd`, and per-screen docs are intentionally deferred until each corresponding function gets a dedicated design pass. Stage Aisle (a new feature not present in the legacy system this project improves on) is left as a documented stub pending its own design session — see the relevant section of `outline.md`.
