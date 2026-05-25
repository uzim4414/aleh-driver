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

## Versions

| Bug | Fixed in |
|-----|----------|
| 1 | V1.2511 |
| 2 | V1.2512 |
| 3 | V1.2513 |
| 4 | V35187 (GAS) + driver commit c60950f |
| 5 | Diagnostic added V35187, fix pending |

---

## Pattern Warning

The Date/Time serialization bug (Bug 4) has now appeared in:
- 2026-05-23 session: `_getGarageRequestStatus` + `getGarageRequests`
- 2026-05-25 session: `_getActiveAppointment` (different function, same sheet)

Any function reading from `אירועי_שטח` sheet that touches `appointmentTime` column
MUST use the `instanceof Date` guard. This is now a required code review checklist item.
