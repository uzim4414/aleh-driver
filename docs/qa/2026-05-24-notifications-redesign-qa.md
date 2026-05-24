# QA — Notifications Redesign

**Date:** 2026-05-24  
**Module:** Driver PWA — notification system  
**Files:** driver/app.js · driver/sw.js · driver/index.html  
**Status:** Fixed (6 commits, pushed to main)  
**Plan:** `docs/superpowers/plans/2026-05-24-driver-notifications-redesign.md`  
**Spec:** `docs/superpowers/specs/2026-05-24-driver-notifications-redesign.md`

---

## Bug #1 — Double Toast + Double Sound on Every Push

**Symptom:** Every push notification displayed 2 toasts simultaneously, played sound twice, saved to history twice.

**Root cause:** Two SW message listeners registered in parallel:
- Mechanism A: `index.html` lines 1968–1984 — called `showInAppNotification` + `saveNotifToHistory` directly
- Mechanism B: `app.js` line 4673 — also called `showInAppNotification` (which internally calls `saveNotifToHistory`)

Both fired on every `push-foreground` message from the service worker.

**Fix:** Removed Mechanism A entirely from `index.html` (lines 1966–2002). Mechanism B in `app.js` is the single source of truth. It supports all 12 notification types (vs. Mechanism A's partial 6-type support).

**Commit:** `9094999`

---

## Bug #2 — OS Notification Not Appearing (Empty Push Fallback)

**Symptom:** When the app was closed/background, OS status bar showed "יש התראה חדשה" generic text instead of actual notification content. In cases where Cloud Run sent a push without a payload body, no OS notification appeared at all.

**Root cause:** `sw.js` push handler tried to fetch `driver_pending_notifications` from GAS when the payload was empty. This endpoint does not exist in GAS → GAS returned 404/error → catch block triggered → `notif` fell back to generic string `'יש התראה חדשה'`.

**Fix:** Removed the GAS fetch entirely. Cloud Run always sends a full payload — empty pushes are FCM keep-alives and should be silently discarded. Replaced the GAS fetch + generic fallback with: `if (!notif) return;`

**Commit:** `5cbaffb`

---

## Bug #3 — Dismissed OS Notification Replays as Toast on App Open

**Symptom:** User dismisses OS notification from status bar. Next time app opens, the notification reappears as an in-app toast (from the `_pendingNotifs` SW buffer).

**Root cause:** `notificationclose` event was not handled in `sw.js`. When a notification was dismissed from the OS, it was never removed from `_pendingNotifs`. On next app open, SW sent the stale buffer → toast appeared again.

**Fix:** Added `notificationclose` listener that filters `_pendingNotifs` by the notification tag. Also added null guard for `n.data` in the filter.

**Commit:** `5cbaffb`, `e8c85d1`

---

## Bug #4 — garage_appointment_set/cancelled Shown With Wrong Severity

**Symptom:** `garage_appointment_set` and `garage_appointment_cancelled` notifications appeared with severity `'plan'` (blue, wrong icon) instead of correct classification.

**Root cause:** Both types were missing from `SEVERITY_MAP` in `app.js`. The map returned `undefined` → fell back to `'plan'` for both.

**Fix:** Added to SEVERITY_MAP:
```javascript
garage_appointment_set:       'plan',
garage_appointment_cancelled: 'info'
```

(Appointment set is correctly plan/blue. Cancelled is info/grey.)

**Commit:** `6a4bca0`

---

## Bug #5 — History Cards Missing Key Data Fields

**Symptom:** Notification history screen showed cards without appointment dates/times, fuel consumption values, garage names, test dates, km data — only basic vehicleId/requestNumber.

**Root cause A:** `saveNotifToHistory` `newItem` object didn't include 14 fields present in the push payload: `appointmentDate`, `appointmentTime`, `fuelConsumption`, `costPerKm`, `fleetAverage`, `threshold`, `garageInfo`, `testDate`, `daysLeft`, `kmLeft`, `estKm`, `nextKm`, `daysSinceUpdate`.

**Root cause B:** `renderNotifHistory` `metaRows` building block only handled `vehicleId`, `requestNumber`, `reasonLabel`, `originalDescription`, `managerNote`, and partial fuel fields — no type-specific switch.

**Fix A:** Added all 14 fields to `saveNotifToHistory` newItem. Numeric fields use `!= null` guard to preserve zero values.

**Fix B:** Replaced `metaRows` block with type-specific `switch` covering all 12 alertTypes. Each type shows its relevant meta fields.

**Commits:** `6a4bca0`, `437f5f3`

---

## Bug #6 — History Cards Non-Navigable (Expand Only)

**Symptom:** Tapping a history card only opened/collapsed it. No action taken — user had to close and navigate manually to act on the notification.

**Root cause:** `renderNotifHistory` had no CTA buttons. The `nh-expand-body` section only contained body text, meta rows, and a delete button.

**Fix:** Added type-specific CTA buttons inside `nh-expand-body`:
- `overdue/urgent` → "בקש מוסך" (navigateForAlertType)
- `km_update` → "עדכן ק"מ"
- `garage_approved` → "קבע מועד"
- `fuel_high/fuel_km_high` → "דוח צריכה"

Also added `.nh-cta-btn` CSS with severity-specific colors.

**Commits:** `437f5f3`

---

## Architecture Change — Unified notification flow

**Before:**
```
FCM Push → sw.js
  └── postMessage(push-foreground)
        ├── index.html SW listener → saveNotifToHistory + showInAppNotification (Mechanism A)
        └── app.js SW listener → showInAppNotification → saveNotifToHistory (Mechanism B)
```
Both fire → double everything.

**After:**
```
FCM Push → sw.js
  └── postMessage(push-foreground)
        └── app.js SW listener only → showInAppNotification → saveNotifToHistory
```
Single path. All 12 types supported.

**_notif URL param + badge restore + pending-notifs collection** moved from index.html inline script to app.js SW init block, so they run after app.js loads (correct timing).

---

## Bug #7 — Android OS Notification: Red App Logo + Missing Monochrome Icon

**Symptom:** Android status bar showed a red square/circle (the app logo) as the notification icon. Expanded notification displayed a huge red circle as a large preview image. Both looked terrible ("גועל נפש").

**Root causes:**
- `icon` field: `'./icons/icon-512.png'` — the colored app logo. Android requires monochrome white-on-transparent for notification icons.
- `image` field: `'./icons/icon-512.png'` — same red logo; Android shows this as a large preview banner in expanded notifications.
- `badge` refs in `TYPE_CONFIG`: `badge-red.png`, `badge-amber.png`, etc. — files that didn't exist.

**Fix:**
- Created `icons/notif-bell.png` (192×192 monochrome white bell, transparent bg) via `make_bell_icons.py` (pure stdlib — struct + zlib, no dependencies).
- Created `icons/notif-badge.png` (96×96 same).
- Changed `icon` → `'./icons/notif-bell.png'`.
- Removed `image` field entirely.
- Changed `badge` → `BADGE_ICON` constant `'./icons/notif-badge.png'` for all types.
- Added `_buildOsNotifContent()`: builds OS-level title + body per `alertType` with actual data fields (kmLeft, testDate, appointmentDate, vehicleId, garageInfo, costPerKm, etc.) instead of generic fallback text.
- Updated action labels: `'פתח עכשיו'` / `'סגור'`.

**Commit:** `7ad18cd`

---

## Verification (2026-05-24)

| Check | Result |
|-------|--------|
| SW listeners: app.js | 1 ✅ |
| SW listeners: index.html | 0 ✅ |
| SEVERITY_MAP — all 12 types | OK ✅ |
| saveNotifToHistory new fields | 14 fields added ✅ |
| Toast CSS (nt-sev-*, animations) | All present ✅ |
| CACHE_NAME | aleh-driver-v88 ✅ |
| notif-bell.png / notif-badge.png | Created ✅ |
| `image` field in showNotification | Removed ✅ |
| `_buildOsNotifContent` — all 12 types | Implemented ✅ |
| Pushed to GitHub | 7ad18cd → main ✅ |

---

## Lessons

- **Two listeners = two toasts.** Always grep for `serviceWorker.addEventListener('message'` in ALL app files before adding a new one.
- **Non-existent GAS endpoints fail silently in SW** — the catch block hides the error and triggers fallback. Always verify endpoint exists before referencing in SW.
- **`saveNotifToHistory` newItem must be kept in sync with payload schema.** When Cloud Run adds a new field to the push payload, add it here too.
- **Android Web Push icon must be monochrome white-on-transparent.** Never use a colored app icon as `icon` or `badge`. The `image` field shows as a large preview banner — only use it if you have a real contextual image, otherwise remove it.
- **Always verify referenced icon files actually exist** before deploying SW changes — missing files fail silently, leaving broken fallbacks.
