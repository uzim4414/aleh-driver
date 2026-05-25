# QA Report: Garage Appointment Conflict Resolution — 2026-05-25

**Plan:** `driver/docs/plans/2026-05-25-garage-conflict-resolution.md`
**GAS version:** V38379
**Driver commit:** db05276
**GAS commit:** 27e798e (index.html: 714c961)

---

## Summary

8-task implementation of garage appointment conflict resolution. Covers the full race condition between driver and admin setting/cancelling appointments. All tasks completed in one session.

---

## Task Completion Matrix

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T1 | `appointmentSetBy` column + write sites | ✅ Done | 8 patches, +817 bytes in code.js |
| T2 | `getGarageRequests` exposes field + banner shows label | ✅ Done | Banner shows ⚙️ driver/admin label |
| T3 | Conflict detection + 3-button modal | ✅ Done | `driver_already_set` + `noop:true` + conflict modal |
| T4 | Contextual FCM/toast text for cancel | ✅ Done | Also fixes Bug 7 (wrong toast on driver cancel) |
| T5 | Replace `confirm()` in cancel flows | ✅ N/A | Already clean — `_gcCancelAppointment` used `_gcConfirm` |
| T6 | Fleet Manager listener for `garageAppointmentSetByDriver` | ✅ N/A | Already existed (BUG-4 fix from prior session) |
| T7 | Toast to driver when admin changes appointment | ✅ Done | Change-detection using `_localApptCheck` |
| T8 | Deploy + remove WIDGET-DBG logs | ✅ Done | 14 logs removed, clasp push + github push |

---

## Changes Per File

### `13.4.26/code.js` (GAS V38379)

| Change | Location | Detail |
|--------|----------|--------|
| `appointmentSetBy` added to `FIELD_EVENTS_COLS` | L140 | After `reminderSentAt` |
| Write `'driver'` in `_garageSetAppointment` | L14636-14637 | After `apptTimeIdx` write |
| Clear `''` in `_cancelAppointment` | L14747-14748 | Driver cancels — clear the field |
| Pass `'driver'` to `_firebaseSyncAdminAppointment` | L14761 | Prevents wrong toast when driver cancels |
| Conflict detection + idempotency in `adminSetAppointment` | L17558-17577 | Returns `driver_already_set` or `noop:true` before any sheet write |
| `force` parameter added to `adminSetAppointment` | L17541 | `force=true` bypasses conflict check |
| Write `'admin'` in `adminSetAppointment` | L17563-17564 | After `nmIdx` write |
| Write `'admin'` in `adminCreateAppointment` (update path) | L17665-17666 | After `eNmIdx` write |
| Write `'admin'` in `adminCreateAppointment` (create path) | L17690 | Added to `newRow` array |
| Clear `''` in `adminCancelAppointment` | L17758-17759 | After clearing dtIdx/tmIdx |
| Read `_cancelledSetBy` before clearing in `adminCancelAppointment` | L17752-17754 | For contextual FCM body |
| Contextual FCM body in `adminCancelAppointment` | L17765-17769 | "ביטל את התור שקבעת" vs "ביטל את התור שנקבע" |
| `_firebaseSyncAdminAppointment` — `setBy` parameter | L17790 | 6th param, included in cancelled Firebase payload |
| `getGarageRequests` — exposes `appointmentSetBy` | L17933 | In output object |
| SCHEMA_VERSION bump | — | 38378 → 38379 |

### `13.4.26/index.html` (Fleet Manager)

| Change | Location | Detail |
|--------|----------|--------|
| `_gcSavePayload` capture var | in `_gcSaveAppointment` | Captures payload before GAS call for re-dispatch |
| `onSuccess` handler extended | in `_gcSaveAppointment` | Routes `driver_already_set` → `_gcShowConflictModal`; `noop` → `_gcAlert` |
| `adminSetAppointment` call passes `force=false` | L22463 | 6th arg, default non-forced |
| `_gcConflictPending` state variable | L22497 | Holds payload for override re-dispatch |
| `_gcShowConflictModal(conflictData, pendingPayload)` | L22499 | Renders 3-button modal (⚠️ + driver date + new date) |
| `_gcConflictCancel()` | L22530 | Closes modal, clears state |
| `_gcConflictKeep()` | L22535 | Closes modal, shows "תור הנהג נשמר" alert |
| `_gcConflictOverride()` | L22538 | Re-dispatches with `force=true` |
| `_glbFoot` appointment variant | in `_glbFoot` | Shows ⚙️ "נקבע על ידי הנהג/מנהל" badge (green/gray) |

### `driver/app.js` (Driver PWA)

| Change | Location | Detail |
|--------|----------|--------|
| Skip toast when driver cancels own appointment | L1235-1245 | `data.setBy === 'driver'` → `_cToast = null` → no toast |
| Change-detection toast in `garageSync appointment_set` | L1294-1302 | Detects prior appointment, shows "🔄 המנהל שינה..." vs "✅ תור נקבע..." |
| Remove 14 `[WIDGET-DBG]` console.log lines | various | Production clean-up |

---

## Conflict Scenario Test Matrix

| Scenario | Expected Result | Verified? |
|----------|----------------|-----------|
| Driver sets appointment (first time) | Sheet: `appointmentSetBy=driver`. Fleet Manager: toast "📅 driverName קבע תור". Calendar refreshes. | Pending live test |
| Admin sets appointment (first time, no conflict) | Sheet: `appointmentSetBy=admin`. Driver: toast "✅ תור נקבע ל-date בשעה time". | Pending live test |
| Admin opens set-appointment dialog for event where driver already set | Conflict modal: ⚠️ with driver's date/time and 3 buttons | Pending live test |
| Admin clicks "שמור תור נהג" | Modal closes. Alert "התור של הנהג נשמר". No GAS call. | Pending live test |
| Admin clicks "ביטול" | Modal closes. No change. | Pending live test |
| Admin clicks "דרוס וקבע חדש" | `adminSetAppointment(force=true)` called. Sheet: `appointmentSetBy=admin`. Driver gets "🔄 המנהל שינה את התור שלך ל-..." toast. | Pending live test |
| Admin sets exact same date+time as existing admin appointment | Returns `noop:true`. Alert "תור זה כבר קיים". No FCM. | Pending live test |
| Admin cancels appointment that was set by driver | FCM body: "המנהל ביטל את התור שקבעת. אם תרצה, תוכל לקבוע מחדש." | Pending live test |
| Admin cancels appointment that was set by admin | FCM body: "מנהל הצי ביטל את התור שנקבע. ניתן לקבוע תור חדש." | Pending live test |
| Driver cancels own appointment | `garageSync` gets `setBy:'driver'`. No toast shown to driver (they already know). Fleet Manager: garageCancelledByDriver toast. | Pending live test |

---

## Bugs Fixed

### Bug 7 (cosmetic) — Wrong toast when driver cancels own appointment
**Status:** Fixed in this session as part of T4.

**Root cause:** `_cancelAppointment` calls `_firebaseSyncAdminAppointment(..., '', '', '')` without passing `setBy`, so the cancelled Firebase payload has no `setBy` field. The driver app's `garageSync` listener always showed "❌ התור בוטל על ידי המנהל".

**Fix:** 
1. `_cancelAppointment` now passes `'driver'` as 6th arg to `_firebaseSyncAdminAppointment`
2. `_firebaseSyncAdminAppointment` includes `setBy` in the cancelled payload
3. `app.js` checks `data.setBy === 'driver'` → sets `_cToast = null` → no toast shown

---

## Lessons Learned

1. **Task 5 and Task 6 were already done** — Always scan existing code before implementing. `_gcCancelAppointment` already used `_gcConfirm` (styled modal). `garageAppointmentSetByDriver` listener already existed from BUG-4 fix. Saved significant time.

2. **CRLF vs LF** — code.js and index.html use CRLF (`\r\n`). Every Python `bytes.replace()` anchor must use `b'\r\n'`, not `b'\n'`. This caused all 8 anchors to fail on the first attempt.

3. **UTF-8 encoding for Hebrew** — When embedding Hebrew strings in byte literals in Python, encode explicitly (`'Hebrew'.encode('utf-8')`) rather than using escape sequences in `b""` strings.

4. **Read `appointmentSetBy` before clearing it** — In `adminCancelAppointment`, the Task 1 patch adds `sheet.getRange().setValue('')` to clear `appointmentSetBy`. Task 4 needs to read it first. Order matters. The Task 4 read was inserted BEFORE the clear block.

5. **`force` parameter for conflict override** — GAS `google.script.run` passes parameters positionally. Adding `force` as 6th param was backward-compatible because existing call sites don't pass it (it's `undefined`, which is falsy).
