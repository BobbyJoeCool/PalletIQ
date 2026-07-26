# API Changelog

All notable changes to the PalletIQ **API** (`api/` — Azure Functions backend + Prisma/MySQL) are documented here. Loosely follows [Keep a Changelog](https://keepachangelog.com) conventions. This is a **separate version/changelog track from the apps that consume it** — see [`apps/floor-app/CHANGELOG.md`](../apps/floor-app/CHANGELOG.md) (tablet/SYMBOL) and [`apps/desktop-app/CHANGELOG.md`](../apps/desktop-app/CHANGELOG.md) (Manager desktop). All three live in this one repo and share this API, but ship and version independently.

## Table of Contents

- [1.0.0 — 2026-07-26](#100--2026-07-26)

---

## [1.0.0] — 2026-07-26

**Version reset — start of independent API versioning.** Prior to this release, `api/package.json`'s version simply mirrored the floor-app's own version number (most recently 1.8.0) inside one shared root `CHANGELOG.md`. As of this version, the API is versioned and changelogged on its own, physically separated per this repo's new directory structure (`api/`, `apps/floor-app/`, `apps/desktop-app/`, each owning their own `package.json`/`CHANGELOG.md`).

The reset to `1.0.0` (rather than continuing from `1.8.0`) marks two real things happening at the same time, not just a bookkeeping restart:

1. **The database engine migration** — Azure SQL Server → self-hosted MySQL for the demo phase (cost-driven; see GitHub #139). This changed the Prisma schema's provider/types, the driver adapter (`@prisma/adapter-mssql` → `@prisma/adapter-mariadb`), the migration history, and every script that talks to the database directly. Full detail (what was migrated, what was audited/fixed afterward, why) is recorded in the pre-split history: `apps/floor-app/CHANGELOG.md`'s `[1.8.0]` entry, and `DevNotes/Logs/V1.7/version-1_7_9.md` §1.9–§1.11.
2. **The API becoming a genuinely shared backend**, not just "the tablet app's backend" — a second frontend (`apps/desktop-app/`) now depends on it too, with its own schema needs (see the ~15 new Prisma models drafted across the Desktop app's design docs, not yet applied).

Nothing else changed in this release beyond the versioning/changelog split itself and the tooling that comes with it:

- New `api/eslint.config.js` — previously `api/**/*.ts` was linted via a block inside the (now floor-app-owned) root `eslint.config.js`; api/ now owns its own config and its own `npm run lint` script, matching how it already owned its own `package.json`/build/start scripts.
- New devDependencies to support that: `@eslint/js`, `eslint`, `eslint-config-prettier`, `globals`, `typescript-eslint` (same versions the floor-app already used, for consistency).

For everything that happened to this codebase before this reset, see `apps/floor-app/CHANGELOG.md`'s full history (versions 0.9.0 through 1.8.0) — that file is the moved, unmodified continuation of what used to be this repo's single root `CHANGELOG.md`.
