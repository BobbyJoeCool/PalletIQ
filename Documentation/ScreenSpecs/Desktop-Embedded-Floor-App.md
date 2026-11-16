# Screen Design: Embedded Floor App (Desktop)

**Device:** DESKTOP — the Electron app in `apps/desktop-app/`
**Bucket:** DESKTOP / Manager
**Roles:** every desktop user (LEAD/LWW, MANAGER/OM, ADMIN, and anyone whose home department is ICQA) — no gate beyond the desktop login itself
**Issue:** #141 · **Design source:** `DevNotes/DesignPrompts/Desktop/Embedded-Floor-App-design.md`

## Flow

1. A **Floor App** button sits in the desktop shell's header on every page.
2. Clicking it opens the floor app in a window floating over the desktop app (bottom right). The page underneath is not navigated away from.
3. The floor app signs in as the desktop user automatically and lands on its Home screen. Login and PIN are never shown.
4. Inside the window the floor app is the same build the tablet runs — same screens, same API calls.
5. **Minimize** and **Close** both hide the window. The floor app keeps running, so clicking the header button again returns to the same screen with the same in-progress state. While it is hidden, the header button shows a green dot.
6. Clicking the header button while the window is showing hides it.
7. Signing out of the desktop app (or its session expiring) destroys the embedded floor app. The next sign-in starts it fresh.
8. The floor app's own **Logout** button, when embedded, returns to its Home screen with all screen state cleared and the same user still signed in.

### Error handling

- **Floor app unreachable:** the window shows "The floor app could not be reached at {url}" with a Retry button.
- **Session handoff fails** (no reply within 10 seconds, or a malformed reply): the floor app shows "Could not sign in from PalletIQ Desktop." with a Retry button.
- Everything else is each embedded screen's own handling, unchanged.

## Layout

```
Header: … [ Floor App ● ]  user  [ Sign out ]

                      ┌──────────────────────────────┐
                      │ Floor App            [−] [x] │
                      ├──────────────────────────────┤
                      │  floor app, scaled to fit    │
                      │  (4:3, its 1366×1024 canvas) │
                      └──────────────────────────────┘
```

The window is fixed in place and is not draggable or resizable.

## Input handling

The on-screen numpad and keyboard are not rendered, and the footer's Keypad/Keyboard buttons are not shown. A physical keyboard drives the same fields:

| Key | Effect |
|---|---|
| Digits | Typed into the active field |
| Letters | Typed, upper-cased, into fields that use the on-screen keyboard; ignored in numpad fields |
| Enter | Confirm (same as the on-screen Enter) |
| Backspace | Delete one character |
| Delete | Clear the field |
| Tab / Shift+Tab | Next / previous field in the field sequence |
| Escape | Leave the field |

Keys are only taken over while a field is active. Other characters (space, punctuation) are ignored, so the keyboard can never enter something the tablet's panels could not. Ctrl/Cmd/Alt shortcuts are left alone. HotJump and the Activity overlay take their own keyboard input.

**Scanner:** a USB keyboard-wedge scanner works. Characters arriving less than 50 ms apart and followed by Enter are delivered to the active field as one scan, exactly as on the tablet.

## Data

**Reads:** the desktop app's session (token + user), handed to the floor app on request.

**Writes:** none of its own. No schema or API changes.

**Not persisted:** window state and the floor app's in-progress state live in memory only, for as long as the desktop session does.

## Behind the Scenes

- **Embedding:** an Electron `<webview>` loading the floor app from `PALLETIQ_FLOOR_APP_URL` (default `http://localhost:5173`). The main process only lets a webview attach if it points at that origin, forces the guest preload and sandboxed settings, and keeps the guest from navigating elsewhere or opening windows.
- **Auto-login:** the guest preload (`electron/floorAppPreload.cts`) exposes `window.palletiqEmbed.requestSession()`. The floor app's `EmbeddedSessionGate` calls it; the desktop renderer (`FloorAppWebview`) answers with its own JWT and user. The token is the ordinary 12-hour `{ zNumber, role }` JWT, so no new endpoint exists. It never appears in a URL.
- **Embedded detection:** the floor app treats the presence of `window.palletiqEmbed` as "embedded" (`src/lib/embedHost.ts`). On a tablet or in a browser it is absent and nothing changes.
- **Session rules when embedded:** no restore from localStorage, no 15-minute idle logout.
- **State across close:** the webview is hidden with `visibility`, never unmounted or given `display: none` (which would reload it).

## Open items still remaining

- Whether any floor-app screen should behave differently on DESKTOP.
- Which screens should call out scanner use for long identifiers (CIDs).
- Scanner behavior is implemented but has not been tried against real hardware.
- Window is not movable or resizable.
- State does not survive quitting the desktop app (decided 2026-11-16: hide, don't destroy; no server-side session).

## Change Log

- **2026-11-16:** first build (#141). Decisions: desktop token passed directly to the floor app; state kept by hiding the window rather than persisting it.
