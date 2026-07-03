# PalletIQ — Primary Style Guide

**Phase 5 · Warehouse Inventory Terminal**
Touchscreen-first kiosk app · iPad Pro 13" landscape (1366 × 1024) · dark UI · Target red accent.

This guide is the single source of truth for color, type, spacing, and component structure. Hand it to design (Figma) and engineering (React) so both build from the same tokens.

---

## 1. Foundations

### 1.1 Device & canvas

| | |
|---|---|
| Target device | iPad Pro 13", **landscape only** |
| Logical canvas | **1366 × 1024** px |
| Orientation lock | Landscape |
| Input context | Gloved hands, fast motion — nothing small, generous spacing |

### 1.2 Design principles

- **Non-blocking feedback** — a persistent message bar carries status; modals are avoided.
- **Numeric / coded input first** — on-screen numpad or code keyboard, not a full keyboard, except for rare free text.
- **Tap-to-navigate** — any rendered Pallet ID / Location ID is a live tap target to that item's detail screen.
- **Back everywhere** — persistent Back button, top-left.
- **Minimal chrome** — structure recedes; content leads.

---

## 2. Color

Brand is **Target red on black**, white text. Color is reserved for the red action accent and the semantic status states — everything else is a neutral on the dark scale.

### 2.1 Brand & action

| Token | Hex | Use |
|---|---|---|
| `--red-primary` | `#CC0000` | Primary action, Jump button, active focus rings, error accents, clock Batch-Date label |
| `--black` | `#000000` | App background / screen base |
| `--white` | `#FFFFFF` | Primary text, primary status dot |

### 2.2 Neutral / surface scale (dark)

| Token | Hex | Use |
|---|---|---|
| `--surface-0` | `#000000` | Screen background |
| `--surface-1` | `#0A0A0A` | Main-content placeholder fill |
| `--surface-2` | `#0D0D0D` | Empty message-bar zone, code field background |
| `--surface-3` | `#111111` | Inset wells |
| `--surface-4` | `#161616` | — |
| `--surface-5` | `#1A1A1A` | Modal / popup body, keycaps base |
| `--surface-6` | `#262626` | Keyboard keys (resting) |

### 2.3 Borders / hairlines

| Token | Hex | Use |
|---|---|---|
| `--border-faint` | `#1C1C1C` | Clock strip divider |
| `--border-subtle` | `#222222` | Message-bar bottom rule |
| `--border-default` | `#2A2A2A` | Header rule, container edges |
| `--border-dashed` | `#2C2C2C` | "Main content area" dashed placeholder |
| `--border-strong` | `#3A3A3A` | Outlined buttons (Back / Logout), input fields |

### 2.4 Text

| Token | Hex | Use |
|---|---|---|
| `--text-primary` | `#FFFFFF` | Titles, key values, time |
| `--text-secondary` | `#CFCFCF` | User name, date |
| `--text-tertiary` | `#BBBBBB` | Supporting text |
| `--text-muted` | `#9A9A9A` | De-emphasized labels |
| `--text-disabled` | `#555555` | Disabled controls, placeholder hints |

### 2.5 Status states

The message bar shows **one** state at a time. Each = tinted background + matching border + matching text/dot.

| State | Text / dot | Background | Border |
|---|---|---|---|
| **Info** (blue) | `#4D9FFF` | `rgba(77,159,255,.13)` | `rgba(77,159,255,.55)` |
| **Warning** (yellow) | `#F0A500` | `rgba(240,165,0,.13)` | `rgba(240,165,0,.55)` |
| **Error** (red) | text `#FF5B5B`, dot `#CC0000` | `rgba(204,0,0,.18)` | `#CC0000` |

> _Optional:_ a **Success** (green) variant — text/dot `#5FD18B`, bg `rgba(95,209,139,.12)`, border `rgba(95,209,139,.40)` — is available for confirmations like "Put complete" if you want a fourth state.

---

## 3. Typography

Two families only.

| Role | Family | Weights |
|---|---|---|
| UI text — labels, titles, buttons, body | **IBM Plex Sans** | 400 / 500 / 600 / 700 |
| Data — Pallet/Location IDs, jump codes, clock, numerics | **IBM Plex Mono** | 400 / 500 / 600 |

`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`

### 3.1 Type scale (as built)

| Token | Size / weight | Family | Use |
|---|---|---|---|
| `display` | 50 / 500 | Mono | Jump-code field entry |
| `time` | 38 / 600 → 18 / 500 | Mono | Clock time (compact strip = 18) |
| `title` | 30 / 600 | Sans | Screen title |
| `status` | 27 / 400 | Sans | Message-bar text |
| `id-inline` | 24 / 500 | Mono | IDs inside status/body |
| `button` | 22–24 / 500–600 | Sans | Back, Logout, Jump, keyboard actions |
| `keycap` | 26 / 500 | Sans | Keyboard letters |
| `body` | 22 / 400 | Sans | Code legend, supporting copy |
| `meta` | 17–20 / 400 | Sans | User name, hints |
| `clock` | 18 / 500 | Mono | Batch date / date / time strip |
| `label-caps` | 14–16 / 500, letter-spacing 2px | Mono | Section labels (`JUMP CODES`, `INFO`) — uppercase |

> Minimum on-screen text **17px**; minimum interactive label **22px**. Never smaller — gloved hands, quick reads.

---

## 4. Spacing, radius & sizing

| Token | Value | Use |
|---|---|---|
| Radius — control | `10–12px` | Buttons, input fields |
| Radius — key | `9px` | Keyboard keys |
| Radius — card / modal | `16–18px` | Popups |
| Radius — banner | `8px` | Status bars |
| Header height | `104px` | |
| Message-bar height | `74px` (in-shell) · `84px` (standalone) | |
| Clock strip height | `54px` | bottom, full-width |
| Screen padding | `26–40px` | |
| Gap — element clusters | `12–18px` | use flex/grid `gap`, not margins |

### Touch targets (hard minimums)

- Primary buttons (Back, Jump, Logout): **64px** tall.
- Keyboard / numpad keys: **≥72px** (built at 74px).
- Action buttons (Cancel / Go): **84px**.

---

## 5. App-shell structure

Every function screen wraps in this shell. The shell is "invisible" — it just holds position.

```
┌──────────────────────────────────────────────────────────┐
│ HEADER  (104px, bottom rule #2A2A2A)                       │
│ [‹ Back] [# Jump]      SCREEN TITLE      Robert B. [Logout]│
├──────────────────────────────────────────────────────────┤
│ MESSAGE BAR (74px) — one status state, no dismiss          │
├──────────────────────────────────────────────────────────┤
│                                                            │
│ MAIN CONTENT AREA  (function screens render here)          │
│                                                            │
├──────────────────────────────────────────────────────────┤
│ CLOCK STRIP (54px, top rule #1C1C1C, right-aligned)        │
│                       BD 26179   June 28   02:47 PM        │
└──────────────────────────────────────────────────────────┘
```

**Header elements (left → right)**

- **Back** — outlined (`#3A3A3A`), `‹ Back`, 64px. Persistent on every screen.
- **Jump** — solid `#CC0000`, white `#` glyph badge + "Jump". Opens the hot-jump keyboard.
- **Screen title** — centered, `title` style.
- **User name** — `Robert B.`, secondary text.
- **Logout** — outlined, 64px, far right.

**Message bar** — full-width, fixed position directly under the header on every screen. Ambient status; **no close/X button**. Last message persists until replaced.

**Clock strip** — pinned to the very bottom, below content, all three readouts inline and the same small size:

- `BD 26179` — **Batch Date** (Julian: 2-digit year + day-of-year), red label.
- `June 28` — month + day, no year.
- `02:47 PM` — 12-hour, no seconds.

### 5.1 Main content area — exact dimensions

The content window is whatever is left after the three fixed chrome bands. Build function screens to **fit this box exactly** — it never scrolls the chrome.

| | Width | Height | Vertical span (y) |
|---|---|---|---|
| **Content slot** (outer — between message bar & clock strip) | **1366 px** | **792 px** | 178 → 970 |
| **Content safe area** (inner — after 40px side/top, 16px bottom padding) | **1286 px** | **736 px** | 218 → 954 |

```
1024 total height
 − 104  header
 −  74  message bar
 −  54  clock strip
 ────
 = 792  → main content slot height   (× 1366 wide)
```

> Design and engineer content frames at **1366 × 792** (full slot), keeping interactive content inside the **1286 × 736** safe area. If a screen hides the message bar, the slot grows by 74px (to 866). The header and clock strip are always present.

---

## 6. Components

### 6.1 Message bar

Tinted bg + border + leading dot + text per §2.5. IDs inside render as live tap targets (see §7).

### 6.2 Hot Jump (keyboard)

Power-user shortcut to any screen — skips the Home grid.

- Tap **Jump** → popup drops over the dimmed screen.
- **Code field** — mono, letter-spaced, red caret; red border once a valid code is recognized.
- **QWERTY keyboard** — letter keys `#262626`, 74px tall; keys do **not** stay highlighted after press.
- **Actions** — `✕ Cancel` (outlined) clears the hot-code and returns to the previous screen (acts as Back); `Go →` lights **Target red** once a valid 3-letter code is entered.

#### Jump codes

| Code | Screen |
|---|---|
| `PIP` | Pallet ID Pull |
| `SDP` | System Directed Put |
| `MDP` | Manually Directed Put |
| `ELA` | Empty Location by Aisle |
| `ELZ` | Empty Location by Zone |
| … | _full list TBD_ |

### 6.3 Input keyboards

- **Numpad** (primary) — calculator layout, ≥72px keys, for IDs / quantities / PINs / aisles. Persistent numberpad docks in the **bottom-right corner of the content area** at an exact **436 × 482 px** (≈⅔ the content height); keys fill the full height (no minimize button — the footer "123 Keypad" toggle opens and closes it). The area behind it is intentionally reusable — future screens may surface non-essential but readily-available info there (e.g. a recent-locations log). No typed-preview on the pad itself — the value shows in the screen's selected field.
- **Full QWERTY** — exception only, for rare free text.
- **Submit / Go / OK** — distinct from digit/letter keys, **Target red**.

### 6.4 Login (separate from the app shell)

The login flow is its **own aspect** of the app — no header, Jump, Logout, or clock. It is the first thing shown at power-on.

- **Identifier Entry (zNumber)** — primary path is **badge scan**; manual backup is the zNumber. A zNumber is a hardcoded `z` prefix + **7 characters** (digits, and only the letters **P / N / X**). The entry pad: a letter row (`P` `N` `X`) above a calculator numpad (`7-8-9 / 4-5-6 / 1-2-3`) with **backspace** and **OK**. Welcome copy: _"Welcome to PalletIQ. Please scan your badge or enter your zNumber."_ Failed lookup → error in the message bar.
- **PIN Entry** — greeting _"Welcome: {Name}, enter your PIN"_ (name persists through a wrong PIN). **4-digit, numeric-only**, masked. Simple numeric keypad. Has a **Back** button returning to Identifier Entry. PIN mismatch → error in the message bar.

---

## 7. Interaction conventions

- **Live IDs** — any Pallet ID / Location ID renders in **IBM Plex Mono with a dotted underline** in the current text color, and routes to that item's detail screen on tap.
- **No modals** — feedback flows through the message bar.
- **Numeric/coded first** — show the numpad or code keyboard, never a full keyboard, unless free text is truly required.
- **Back + Home only** — no bottom nav, no hamburger. Navigation is Back, the Home grid, and Hot Jump.

---

## 8. Engineering handoff (CSS variables)

```css
:root {
  /* brand */
  --red-primary:#CC0000; --black:#000000; --white:#FFFFFF;
  /* surfaces */
  --surface-0:#000000; --surface-1:#0A0A0A; --surface-2:#0D0D0D;
  --surface-3:#111111; --surface-4:#161616; --surface-5:#1A1A1A; --surface-6:#262626;
  /* borders */
  --border-faint:#1C1C1C; --border-subtle:#222222; --border-default:#2A2A2A;
  --border-dashed:#2C2C2C; --border-strong:#3A3A3A;
  /* text */
  --text-primary:#FFFFFF; --text-secondary:#CFCFCF; --text-tertiary:#BBBBBB;
  --text-muted:#9A9A9A; --text-disabled:#555555;
  /* status */
  --info:#4D9FFF;    --info-bg:rgba(77,159,255,.13);  --info-border:rgba(77,159,255,.55);
  --warning:#F0A500; --warning-bg:rgba(240,165,0,.13); --warning-border:rgba(240,165,0,.55);
  --error:#FF5B5B;   --error-bg:rgba(204,0,0,.18);     --error-border:#CC0000;
  --success:#5FD18B; --success-bg:rgba(95,209,139,.12);--success-border:rgba(95,209,139,.40);
  /* type */
  --font-ui:'IBM Plex Sans',sans-serif;
  --font-data:'IBM Plex Mono',monospace;
  /* metrics */
  --header-h:104px; --msgbar-h:74px; --clock-h:54px;
  --content-w:1366px; --content-h:792px;          /* main content slot */
  --content-safe-w:1286px; --content-safe-h:736px; /* inside padding */
  --numpad-w:436px; --numpad-h:482px;             /* numberpad, docked bottom-right of content */
  --keyboard-h:354px;                             /* full-width keyboard panel */
  --radius-control:12px; --radius-key:9px; --radius-card:18px; --radius-banner:8px;
  --tap-min:72px;
}
```
