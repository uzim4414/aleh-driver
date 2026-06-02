# Garage Module — Full Audit Fix Plan (2026-05-25)

> **Agent:** superpowers:subagent-driven-development / executing-plans
> **Goal:** Fix all 13 bugs found in opus 4.7 forensic audit of the garage request system

## Architecture Summary
- Driver sends garage actions via `gasPost` → `doGet` → dispatcher functions
- Admin uses `google.script.run` → dedicated admin functions
- Firebase `garageSync/{vehKey}` is the real-time bridge (admin→driver and driver→admin)
- Admin listens on `/garageRequests` + `/garageCancelledByDriver` only (gap → BUG-4)

---

## Phase 1 — Dead code removal (trivial, no risk)

### Task 1: Delete duplicate `getGarageRequests` at L15426
**File:** `13.4.26/code.js` line 15426–15475
- [ ] Python bytes.replace to remove the first `function getGarageRequests` block
- [ ] Verify only ONE definition remains
- [ ] Commit

### Task 2: Delete dead admin stub functions
**File:** `13.4.26/code.js`
- [ ] Delete `approveGarageRequest` (L17921), `rejectGarageRequest` (L17937), `closeGarageRequest` (L17952)
- [ ] Delete `_gl_findRow_`, `_gl_getCellByName_`, `_gl_setCellByName_` helpers (only used by deleted stubs)
- [ ] Delete approve/reject dead branches inside `_garageRequestAction` (L14536–14606, keep only cancel branch)
- [ ] Fix duplicate `var apptTimeIdx` at L14687 (remove second declaration)
- [ ] Verify function count drops accordingly
- [ ] Commit

---

## Phase 2 — Widget urgency fix (driver-only, no GAS push needed)

### Task 3: Fix widget urgency tiers (BUG-8)
**File:** `driver/app.js` — `renderGarageApptWidget` urgency block (~L1740–1750)

Spec: red ≤2 days, yellow/orange ≤7 days, green >7 days

- [ ] Replace urgency tier logic:
```javascript
if (diffMs < 0) {
  tier='missed';  bg='#111';    accent='#555';    ringAnim='none';
  badgeLabel='עבר המועד';
} else if (diffDays < 1) {
  tier='today';   bg='#1f0505'; accent='#ef4444'; ringAnim='gwPulse 0.8s ease-in-out infinite';
  badgeLabel='היום!';
} else if (diffDays <= 2) {
  tier='urgent';  bg='#1f0808'; accent='#ef4444'; ringAnim='gwPulse 1.4s ease-in-out infinite';
  badgeLabel='עוד ' + Math.ceil(diffDays) + ' ימים';
} else if (diffDays <= 7) {
  tier='soon';    bg='#1f1700'; accent='#f59e0b'; ringAnim='gwPulse 2.4s ease-in-out infinite';
  badgeLabel='עוד ' + Math.ceil(diffDays) + ' ימים';
} else {
  tier='normal';  bg='#0a1f0a'; accent='#22c55e'; ringAnim='none';
  badgeLabel='עוד ' + Math.ceil(diffDays) + ' ימים';
}
```
- [ ] Verify date format is DD/MM/YYYY (line `apptDateStr.split('-').reverse().join('/')`)
- [ ] Verify time is HH:MM (tStr normalization)
- [ ] Commit driver/app.js

---

## Phase 3 — Missing history + real-time admin notifications

### Task 4: Add history to admin actions (BUG-10)
**File:** `13.4.26/code.js`
- [ ] `garageRequestAction` (L15477): add `_appendFieldEventHistory(eventId, {action, by, note})` after status setValue
- [ ] `adminSetAppointment` (L17626): add history entry `action:'appointment_set_by_admin'`
- [ ] `adminCreateAppointment` (L17674): both update + create branches
- [ ] `adminCancelAppointment` (L17792): history `action:'appointment_cancelled_by_admin'`
- [ ] Commit

### Task 5: Admin real-time toast when driver sets appointment (BUG-4)
**File 1:** `13.4.26/code.js` — `_garageSetAppointment` (~L14742)
- [ ] After `_firebaseSyncAdminAppointment` call, add Firebase write to `/garageAppointmentSetByDriver/{vehKey}`

**File 2:** `13.4.26/index.html` — `_startGarageFirebaseListener` (~L21591)
- [ ] Add listener on `/garageAppointmentSetByDriver` (child_added pattern identical to `garageCancelledByDriver`)
- [ ] Show `_showAdminGarageToast('📅 ' + label, 6000)` + reload calendar
- [ ] `snap.ref.remove()` to consume

### Task 6: Driver cancel pending request → real-time admin toast (BUG-2)
**File:** `13.4.26/code.js` — `_garageRequestAction` cancel branch (~L14533)
- [ ] Before `return {ok:true}`, write to `/garageCancelledByDriver/{vehKey}` with `reqType:'pending_request'`
- [ ] Admin existing listener picks this up automatically (no index.html change needed)
- [ ] Commit

---

## Phase 4 — Race condition fixes

### Task 7: Fix `_firebaseSyncAdminAppointment` consumed flag (BUG-5)
**File:** `13.4.26/code.js` L17837–17840
- [ ] Add `consumed: false` explicitly to both payload branches (appointment_set + cancelled)
- [ ] Commit

### Task 8: Fix `_syncActiveAppointmentFromGAS` race (BUG-6)
**File:** `driver/app.js` — `_syncActiveAppointmentFromGAS` (~L1160)
- [ ] Change `changed` condition from full object compare to eventId-only compare:
  ```javascript
  var changed = !existing || String(existing.eventId) !== String(_aSet.eventId)
             || existing.appointmentDate !== _aSet.appointmentDate;
  ```
- [ ] Commit

---

## Phase 5 — Hardening (BUG-11, BUG-12)

### Task 9: Harden date serialization in getGarageRequests (BUG-11)
**File:** `13.4.26/code.js` L17995 (`getGarageRequests` #2)
- [ ] Use `instanceof Date` guard for `appointmentDate` extraction
- [ ] Commit

### Task 10: Fix vehicleNum parentheses typo (BUG-12)
**File:** `13.4.26/code.js` L17718
- [ ] `String((eVnumIdx >= 0 ? evtData[ei][eVnumIdx] : '') || '').trim()`
- [ ] Commit

---

## QA checklist
- [ ] Driver submits request → admin gets toast ✓
- [ ] Admin approves → driver gets FCM + garageSync fires ✓
- [ ] Driver sets appointment → admin gets toast (BUG-4 fix) ✓
- [ ] Admin sets appointment from calendar → driver widget shows correct format/urgency ✓
- [ ] Driver cancels appointment → admin gets toast ✓
- [ ] Driver cancels PENDING request → admin gets toast (BUG-2 fix) ✓
- [ ] Widget urgency: red ≤2 days, yellow ≤7, green >7 ✓
- [ ] History populated for all actions ✓
- [ ] No duplicate function definitions remain ✓
- [ ] code.js size not reduced unexpectedly ✓
