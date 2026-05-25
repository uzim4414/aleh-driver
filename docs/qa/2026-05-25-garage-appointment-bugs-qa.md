# QA Report: Garage Appointment Bugs — 2026-05-25

## Overview

Post-deploy regression of 4 bugs after garage lifecycle banner deployment (V1.2510).
Root cause traced to V8 last-definition-wins + Date/Time serialization pattern recurring.

---

## Bug 1: "שגיאה בטעינת נתונים" in בקשות מוסך tab

**תסמין:** Tab showed error instead of garage requests list.

**שורש:** `getGarageRequests` (new function at code.js end, GAS V8 last-wins) returned
`JSON.stringify(out)` — a plain array. `index.html` checked `res.ok` → undefined → error.

**תיקון:** Return `JSON.stringify({ ok: true, requests: out })`.

**לקח:** Every new GAS function returning data to client must wrap in `{ ok: true, ... }`.

---

## Bug 2: "_appendFieldEventHistory is not defined"

**תסמין:** Setting appointment from admin UI threw JS error.

**שורש:** Lifecycle banner plan (Task 2) added 6 call sites for `_appendFieldEventHistory`
but never defined the function body. Function was referenced but missing entirely.

**תיקון:** Added full function definition at code.js line 17834 (before `_gl_findRow_`).

**לקח:** Plan tasks must include both call sites AND function definition. Self-review
of plan file should catch "function X called but never defined" gaps.

---

## Bug 3: "שגיאה: not_found" on approve/reject

**תסמין:** Approving or rejecting a garage request returned `not_found`.

**שורש:** `_acGarageRequestCard` used `req.id` — but new `getGarageRequests` returns
`eventId`, not `id`. Empty string passed → server loop found no row → `not_found`.

**תיקון:** `var eid = req.eventId || req.id || ''` in `_acGarageRequestCard`.

**לקח:** When renaming/changing field names in GAS output, grep all client-side consumers
for the old field name before deploying.

---

## Bug 4: Widget shows "Sat Dec 30 1899" + "NaN ימים" (RECURRING)

**תסמין:** Widget rendered wrong date/time format, counting showed "NaN ימים".
This exact bug class was fixed 2026-05-23 and documented in memory.

**שורש (מלא — race condition):**
1. Driver or admin sets appointment → correct data in localStorage → widget renders fine
2. `_syncActiveAppointmentFromGAS` (polls GAS every ~60s) calls `get_active_appointment`
3. `_getActiveAppointment` at code.js line 14924 used `String(data[i][tmIdx] || '')`
   on a Time cell → Google Sheets returns `Date(1899,11,30,H,M,0)` → String() returns
   "Sat Dec 30 1899 09:00:00 GMT+0220 (Israel Standard Time)"
4. This poisoned string written to Firebase via `_fbSetActiveAppointment`
5. Firebase `activeAppointment` listener (app.js line 410) blindly wrote to localStorage
6. Widget re-rendered with garbage within ~1 second of correct render

**שרשרת תיקונים:**
- `_getActiveAppointment` (code.js line 14924): added `instanceof Date` guard —
  same pattern as `_getGarageRequestStatus` (lines 14862-14867)
- Firebase `activeAppointment` listener (app.js line 410): added defensive normalization
  of `appointmentTime` (regex HH:MM extraction) and `appointmentDate` (strip T-suffix)
  before writing to localStorage — second defense layer against poisoned Firebase data

**למה חזר:** Fix was applied to `_getGarageRequestStatus` in 2026-05-23 session but
NOT to `_getActiveAppointment` — different function, same bug class. The pattern must
be applied to EVERY function that reads Time columns from Sheets.

**לקח קריטי:** After fixing a Date/Time serialization bug in one GAS function, search
code.js for ALL other functions that read from the same sheet and apply the same guard.
Pattern to search: `String(data[i][tmIdx]` — any occurrence is a potential bug.

---

## Bug 5: No FCM notification when admin sets appointment (OPEN — diagnostic added)

**תסמין:** Driver app showed toast via garageSync listener but no OS push notification.

**שורש:** Unknown — `_sendFcmToDriver` result was silently discarded inside try/catch.
Most likely causes: expired push subscription (Cloud Run returns 410, subscription deleted,
FCM V1 has no fallback token) OR stale FCM token in Script Properties.

**תיקון חלקי:** Added `Logger.log` of FCM result in both `adminSetAppointment` and
`adminCreateAppointment` so next test shows exact failure reason in GAS Logger.

**צעד הבא:** After next admin sets appointment, check Apps Script → Executions →
look for log line "adminSetAppointment FCM vehicleId=... result=...". If result shows
`{ok:false,error:'no_token'}` → need to re-register push subscription from driver app.
If `{ok:false,error:'subscription_expired'}` → same, re-register. If `{ok:true}` →
issue is on driver app side (service worker not handling the push).

---

---

## Bug 6: Widget resets to wrong format / disappears "after a few seconds" (RECURRING after Bug 4 fix)

**תסמין:** Widget shows correctly on load, then 2-3 seconds later reverts to wrong state
(wrong date format, "NaN ימים", or disappears entirely).

**שורש (מלא — stale Firebase race):**

Timeline:
1. App loads → reads `activeGarageAppointment` from localStorage → widget renders correctly
2. ~2-3s later: `loadFullData` resolves → `_initFbGarageStatusSync()` attaches Firebase listener
3. Firebase SDK fires listener **immediately** with current `garageSync/{vehKey}` value
4. That Firebase node contains **stale old data** with `consumed:false` — written by BUG-5 fix
   (`_firebaseSyncAdminAppointment` always writes `consumed:false` since V35277)
5. `_initFbGarageStatusSync` sees `consumed:false` → skips all staleness checks → directly
   overwrites localStorage with old Firebase appointment data
6. Widget re-renders with old/wrong appointment → "reset"

Secondary cause: `_syncActiveAppointmentFromGAS` (runs 3-5s after loadFullData) could
return `{ ok:true, appointment:null }` if GAS sheet status changed → cleared widget.

**תיקון (driver commit 367b23c):**

1. **`updatedAt` field** — added to every `activeGarageAppointment` localStorage write
   (driver set, FCM handler, poll handler, `_initFbGarageStatusSync`, `_syncActiveAppointmentFromGAS`)

2. **Staleness guard in `_initFbGarageStatusSync`** — before overwriting local with Firebase data:
   ```javascript
   if (local.updatedAt > firebase.updatedAt && local.eventId === firebase.eventId) {
     // local is newer — mark Firebase consumed:true and skip
     snap.ref.update({ consumed: true }); return;
   }
   ```

3. **Fresh-local guard in `_syncActiveAppointmentFromGAS`** — when GAS returns null:
   ```javascript
   if (Date.now() - (existing.updatedAt || 0) < 600000) return; // <10min → don't clear
   ```

4. **Date/time normalization at all write paths** — `appointmentDate.split('T')[0].split(' ')[0]`
   and `appointmentTime` via regex `(\d{1,2}):(\d{2})` — defense-in-depth at every write point

**לקח:** `consumed:false` on every Firebase write (BUG-5) creates a guarantee of re-processing
on every new listener attachment. Without a staleness check, older Firebase data beats newer
local data. Every Firebase listener that can overwrite local state MUST compare `updatedAt`.

---

## Bug 7: Stale Firebase garageSync node triggers wrong toast ("התור בוטל על ידי המנהל") when driver cancels own appointment

**תסמין:** When driver cancels their own appointment, the toast message shows
"❌ התור בוטל על ידי המנהל" (admin cancelled) instead of a driver-specific message.

**שורש:** `_cancelAppointment` (GAS) calls `_firebaseSyncAdminAppointment(vehicleId, eventId, '', '', '')`
which writes `{ status:'cancelled', consumed:false }` to `garageSync/{vehKey}`.
The `_initFbGarageStatusSync` listener processes this as an admin cancellation and shows the wrong toast.

**תיקון:** Not yet fixed — cosmetic UX issue only (correct behavior, wrong toast message).
Fix: write separate Firebase path for driver-cancel (e.g. `garageCancelledByDriver/{vehKey}`)
instead of reusing `garageSync` with cancelled status.

---

## Versions

| Bug | Fixed in |
|-----|----------|
| 1 | V1.2511 |
| 2 | V1.2512 |
| 3 | V1.2513 |
| 4 | V35277 (GAS) + driver commit f58def7 |
| 5 | Diagnostic added V35277, fix pending |
| 6 | driver commit 367b23c |
| 7 | Not yet fixed (cosmetic) |

---

## Pattern Warning

The Date/Time serialization bug (Bug 4) has now appeared in:
- 2026-05-23 session: `_getGarageRequestStatus` + `getGarageRequests`
- 2026-05-25 session: `_getActiveAppointment` (different function, same sheet)

Any function reading from `אירועי_שטח` sheet that touches `appointmentTime` column
MUST use the `instanceof Date` guard. This is now a required code review checklist item.

## Pattern Warning 2

The "stale Firebase overwrites fresh local" bug (Bug 6) is a class of race conditions
that can affect ANY Firebase listener that calls `localStorage.setItem`. Prevention:
- Every local write MUST include `updatedAt: Date.now()`
- Every Firebase listener MUST compare `updatedAt` before overwriting local
- `consumed:false` on every write = always re-processes = always a staleness risk
