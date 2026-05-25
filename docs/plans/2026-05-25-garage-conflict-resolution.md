# Garage Appointment Conflict Resolution — Implementation Plan (2026-05-25)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent and gracefully handle race conditions when driver and admin both set/cancel a garage appointment — the full lifecycle from `pending` through `appointment_set`, with conflict detection, UX warnings, idempotency, and proper cross-channel notifications.

**Architecture:** Eight targeted changes spanning GAS server (`code.js`), Fleet Manager admin UI (`index.html`), and Driver PWA (`app.js`). No new Firebase paths are introduced — we activate the already-written `garageAppointmentSetByDriver` path (GAS already writes it; Fleet Manager just never listened). Every change is backward-compatible with existing data.

**Tech Stack:** Google Apps Script (`code.js`), embedded admin HTML/JS (`index.html`), Driver PWA (`driver/app.js`), Google Sheets (`אירועי_שטח`), Firebase Realtime DB, Python `bytes.replace()` for `code.js` patching, `clasp push`.

---

## Pre-flight Context

**Absolute paths:**
- GAS server:   `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- GAS admin UI: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html`
- Driver PWA:   `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js`
- Plan:         `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\plans\2026-05-25-garage-conflict-resolution.md`
- QA output:    `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\qa\2026-05-25-garage-conflict-resolution-qa.md`
- Backup script: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\backup.py`

**Critical constraints (violating any will break the deploy or corrupt data):**
1. **Run `backup.py` before any Python script that mutates `code.js`.** Verify backup > 0 bytes.
2. **Python `bytes.replace()` ONLY** for `code.js`. PowerShell `-replace` corrupts large files.
3. **GAS column writes must use `headers.indexOf(colName)` at runtime**, never hardcoded offsets.
4. **All UI text in Hebrew.**
5. **No `confirm()` / `alert()` / `prompt()`** — use in-app `_gcAlert()` modal or fleet toast system.
6. **`appsscript.json`** — read remote copy first, preserve `webapp.access = "ANYONE_ANONYMOUS"`.
7. **Date serialization** — Date columns → `toISOString()`. Time columns → `HH:MM` string.
8. **`git commit` after every task.**
9. **JS string escaping** — scan for unescaped inner quotes before every `clasp push`.

**Current FIELD_EVENTS_COLS (code.js lines 137-141):**
```
['eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
 'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
 'approvedAt','appointmentDate','appointmentTime','reminderSentAt','history','cancelCount']
```
(The `history` and `cancelCount` columns were added by the lifecycle-banner plan. If the plan was deployed, they exist. If not, skip references to them — this plan does NOT depend on them.)

**New column this plan adds: `appointmentSetBy`**
Appended after `cancelCount` (or `reminderSentAt` if lifecycle-banner not deployed).
Value: `'driver'` | `'admin'` | `''`

**Conflict state machine (full lifecycle):**
```
pending ──[approve]──► approved ──[driver sets]──► appointment_set
                            │                           │
                            │◄──[cancel by D or M]──────┘
                            │
                            └──[admin sets directly]──► appointment_set
                                                            │
                                                        (done | cancelled | rejected)
```

**Key Firebase paths:**
- `garageSync/{vehKey}` — admin→driver: appointment_set, cancelled (always read by driver)
- `garageAppointmentSetByDriver/{vehKey}` — driver→admin: driver set appointment (currently NOT listened to by Fleet Manager — Task 7 fixes this)
- `garageCancelledByDriver/{vehKey}` — driver→admin: driver cancelled (already listened to by Fleet Manager)

---

## File Structure

| File | Change |
|------|--------|
| `13.4.26/code.js` | Add `appointmentSetBy` to FIELD_EVENTS_COLS. Populate in `_garageSetAppointment`, `adminSetAppointment`, `adminCreateAppointment`. Add idempotency + conflict-detection logic in `adminSetAppointment`. Adapt FCM text in cancel flows. |
| `13.4.26/index.html` | Add `garageAppointmentSetByDriver` Firebase listener. Add conflict modal (3-button). Show `appointmentSetBy` in lifecycle banner. Remove `confirm()` from cancel flows, replace with styled modal. |
| `driver/app.js` | Add toast when admin changes appointment while app is open (garageSync listener already fires — just add explicit "admin changed your appointment" toast path). |

---

## Task 1: Add `appointmentSetBy` column to Sheet + populate on every appointment write

**Files:**
- Modify: `13.4.26/code.js` — FIELD_EVENTS_COLS array + 3 write sites

**Why:** Without knowing who set the appointment, the admin cannot get a meaningful warning, the banner cannot say "set by driver/admin", and cancel FCM text cannot be adapted.

- [ ] **Step 1: Run backup**
```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
python backup.py
# Verify backup file > 0 bytes before continuing
```

- [ ] **Step 2: Add column to FIELD_EVENTS_COLS**

Find in `code.js`:
```javascript
'history','cancelCount']
```
Replace with:
```javascript
'history','cancelCount','appointmentSetBy']
```

If `cancelCount` does not exist (lifecycle-banner not deployed), instead find:
```javascript
'reminderSentAt']
```
Replace with:
```javascript
'reminderSentAt','appointmentSetBy']
```

Use Python `bytes.replace()`.

- [ ] **Step 3: Populate `appointmentSetBy` in `_garageSetAppointment` (driver sets)**

Find the block in `_garageSetAppointment` where `appointmentDate` is written to the sheet.
After `sheet.getRange(row, apptDateIdx + 1).setValue(params.appointmentDate);`
add (use `headers.indexOf('appointmentSetBy')` pattern):
```javascript
var setByIdx = headers.indexOf('appointmentSetBy');
if (setByIdx >= 0) sheet.getRange(row, setByIdx + 1).setValue('driver');
```

- [ ] **Step 4: Populate `appointmentSetBy` in `adminSetAppointment` (admin sets via Fleet Manager)**

Same pattern — find the block where `appointmentDate` is written in `adminSetAppointment`.
Add after it:
```javascript
var _asbIdx = headers.indexOf('appointmentSetBy');
if (_asbIdx >= 0) sheet.getRange(row, _asbIdx + 1).setValue('admin');
```

- [ ] **Step 5: Populate `appointmentSetBy` in `adminCreateAppointment` (admin creates directly)**

Same pattern in `adminCreateAppointment`. Add:
```javascript
var _asbIdx2 = headers.indexOf('appointmentSetBy');
if (_asbIdx2 >= 0) sheet.getRange(row, _asbIdx2 + 1).setValue('admin');
```

- [ ] **Step 6: Clear `appointmentSetBy` when appointment is cancelled**

In `_cancelAppointment` (driver cancels) and `adminCancelAppointment` (admin cancels), after clearing `appointmentDate`/`appointmentTime`:
```javascript
var _clrSetByIdx = headers.indexOf('appointmentSetBy');
if (_clrSetByIdx >= 0) sheet.getRange(row, _clrSetByIdx + 1).setValue('');
```

- [ ] **Step 7: Verify Python script output**
```bash
python fix_task1_setby.py
# Expected output: FIELD_EVENTS_COLS updated, 4-5 write sites patched
```

- [ ] **Step 8: Commit**
```bash
git add "13.4.26/code.js"
git commit -m "feat: add appointmentSetBy column to FIELD_EVENTS, populate in all appointment write sites"
```

---

## Task 2: `getGarageRequests` returns `appointmentSetBy` + lifecycle banner shows it

**Files:**
- Modify: `13.4.26/code.js` — `getGarageRequests` output object
- Modify: `13.4.26/index.html` — `_gcUpdatePendingInfo` / `_gcApprovedByVehicle` banner rendering

**Why:** Admin must see who set the appointment in the lifecycle banner to decide whether to override.

- [ ] **Step 1: Widen `getGarageRequests` output**

In `getGarageRequests`, find where the `out` array item is built (object with `eventId`, `status`, `appointmentDate`, etc.).
Add `appointmentSetBy` field:
```javascript
appointmentSetBy: String(data[i][headers.indexOf('appointmentSetBy')] || ''),
```

- [ ] **Step 2: Show `appointmentSetBy` in lifecycle banner (index.html)**

In the `appointment_set` banner variant inside `_gcUpdatePendingInfo`:
Find where `appointmentDate` and `appointmentTime` are displayed.
Add below:
```javascript
var _setByLabel = req.appointmentSetBy === 'driver' ? '⚙️ נקבע על ידי הנהג' :
                  req.appointmentSetBy === 'admin'  ? '⚙️ נקבע על ידי מנהל' : '';
if (_setByLabel) {
  html += '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + _setByLabel + '</div>';
}
```

- [ ] **Step 3: Commit**
```bash
git add "13.4.26/code.js" "13.4.26/index.html"
git commit -m "feat: expose appointmentSetBy in getGarageRequests + show in lifecycle banner"
```

---

## Task 3: Conflict detection in `adminSetAppointment` — return `driver_already_set`

**Files:**
- Modify: `13.4.26/code.js` — `adminSetAppointment` function
- Modify: `13.4.26/index.html` — call site of `adminSetAppointment` + new 3-button conflict modal

**Why:** When admin opens set-appointment dialog for an event where driver already set an appointment, admin must see a warning with the driver's chosen date/time and three options: [ביטול] [שמור תור נהג] [דרוס וקבע חדש].

- [ ] **Step 1: Add conflict detection to `adminSetAppointment` in code.js**

Inside `adminSetAppointment`, before writing to the sheet, add:
```javascript
// Conflict detection: driver already set appointment?
var existingSetBy = String(data[i][headers.indexOf('appointmentSetBy')] || '');
var existingApptDate = String(data[i][headers.indexOf('appointmentDate')] || '');
var existingApptTime = String(data[i][headers.indexOf('appointmentTime')] || '');
if (existingSetBy === 'driver' && existingApptDate) {
  // Admin is trying to set over a driver-set appointment
  // Return conflict info unless admin explicitly passed force:true
  if (!params.force) {
    return JSON.stringify({
      ok: false,
      error: 'driver_already_set',
      driverApptDate: existingApptDate,
      driverApptTime: existingApptTime,
      driverName: String(data[i][headers.indexOf('driverName')] || '')
    });
  }
  // force:true → continue and overwrite
}
```

- [ ] **Step 2: Idempotency check — same date+time by admin → noop**

Immediately after the conflict check (or independently if `existingSetBy === 'admin'`):
```javascript
if (existingSetBy === 'admin' && existingApptDate === appointmentDate && existingApptTime === (appointmentTime || '')) {
  return JSON.stringify({ ok: true, noop: true });
}
```
This prevents double FCM when admin opens dialog and clicks save with no changes.

- [ ] **Step 3: Add conflict modal to index.html**

Add this modal HTML (hidden by default) into the admin UI, near the set-appointment dialog:
```html
<div id="gc-conflict-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center">
  <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;max-width:420px;width:90%;direction:rtl;font-family:inherit">
    <div style="font-size:17px;font-weight:700;color:#fbbf24;margin-bottom:12px">⚠️ דריסת תור שקבע הנהג</div>
    <div id="gc-conflict-body" style="font-size:14px;color:#cbd5e1;line-height:1.6;margin-bottom:20px"></div>
    <div style="display:flex;gap:8px;flex-direction:row-reverse">
      <button onclick="_gcConflictOverride()" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:14px;cursor:pointer;font-family:inherit">דרוס וקבע חדש</button>
      <button onclick="_gcConflictKeep()" style="background:#22c55e;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:14px;cursor:pointer;font-family:inherit">שמור את התור של הנהג</button>
      <button onclick="_gcConflictCancel()" style="background:#334155;color:#cbd5e1;border:none;border-radius:8px;padding:8px 18px;font-size:14px;cursor:pointer;font-family:inherit">ביטול</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add JS handlers for conflict modal**

Add these functions to the admin JS (inside `<script>` block in index.html):
```javascript
var _gcConflictPending = null; // { eventId, appointmentDate, appointmentTime, managerNote }

function _gcShowConflictModal(conflictData, pendingPayload) {
  _gcConflictPending = pendingPayload;
  var body = document.getElementById('gc-conflict-body');
  body.innerHTML =
    'הנהג <strong>' + conflictData.driverName + '</strong> קבע תור לתאריך ' +
    '<strong>' + conflictData.driverApptDate + '</strong>' +
    (conflictData.driverApptTime ? ' בשעה <strong>' + conflictData.driverApptTime + '</strong>' : '') + '.' +
    '<br>אתה עומד לקבוע במקומו תאריך <strong>' + pendingPayload.appointmentDate + '</strong>' +
    (pendingPayload.appointmentTime ? ' בשעה <strong>' + pendingPayload.appointmentTime + '</strong>' : '') + '.' +
    '<br><span style="color:#94a3b8;font-size:12px">הנהג יקבל הודעת דחיפה על השינוי.</span>';
  document.getElementById('gc-conflict-modal').style.display = 'flex';
}

function _gcConflictCancel() {
  document.getElementById('gc-conflict-modal').style.display = 'none';
  _gcConflictPending = null;
}

function _gcConflictKeep() {
  // Admin chose to keep driver's appointment — just close modal, do nothing
  document.getElementById('gc-conflict-modal').style.display = 'none';
  _gcConflictPending = null;
  _gcShowToast('התור של הנהג נשמר ללא שינוי', 'info');
}

function _gcConflictOverride() {
  document.getElementById('gc-conflict-modal').style.display = 'none';
  if (!_gcConflictPending) return;
  // Re-send with force:true
  var payload = Object.assign({}, _gcConflictPending, { force: true });
  google.script.run
    .withSuccessHandler(function(r) { _gcHandleSetApptResult(r, payload); })
    .withFailureHandler(function(e) { _gcAlert('שגיאה: ' + e.message); })
    .adminSetAppointment(payload, _gcSessionToken);
  _gcConflictPending = null;
}
```

- [ ] **Step 5: Patch the `adminSetAppointment` call site in index.html**

Find the existing `google.script.run...adminSetAppointment(...)` call in the admin UI.
Replace the success handler with a router:
```javascript
.withSuccessHandler(function(raw) {
  var r = (typeof raw === 'string') ? JSON.parse(raw) : raw;
  if (!r.ok && r.error === 'driver_already_set') {
    _gcShowConflictModal(r, currentPayload); // currentPayload = the payload you just sent
    return;
  }
  if (r.ok && r.noop) {
    _gcAlert('התור כבר קיים — אין שינוי');
    return;
  }
  _gcHandleSetApptResult(r, currentPayload);
})
```

(The existing success handler logic should be extracted into `_gcHandleSetApptResult(r, payload)` if it isn't already.)

- [ ] **Step 6: Verify with clasp push and manual test**

Test scenario:
1. Driver sets appointment via app → Sheet shows `appointmentSetBy = driver`
2. Admin opens set-appointment dialog for same event → conflict modal appears
3. Admin clicks "שמור תור נהג" → nothing changes, toast shows
4. Admin clicks "דרוס וקבע חדש" → new appointment written, `appointmentSetBy = admin`

- [ ] **Step 7: Commit**
```bash
git add "13.4.26/code.js" "13.4.26/index.html"
git commit -m "feat: conflict detection in adminSetAppointment — driver_already_set modal + idempotency noop"
```

---

## Task 4: Adapt FCM text in cancel flows by `appointmentSetBy`

**Files:**
- Modify: `13.4.26/code.js` — `adminCancelAppointment` (or wherever FCM is sent on admin cancel)

**Why:** Current FCM says "המנהל ביטל את התור" even when the appointment was set by the driver. The message should be contextual.

- [ ] **Step 1: Read FCM text in `adminCancelAppointment`**

Find the FCM payload in `adminCancelAppointment`. Look for the notification body string.

- [ ] **Step 2: Adapt the body text**

Replace the hardcoded string with:
```javascript
var _cancellerSetBy = String(data[i][headers.indexOf('appointmentSetBy')] || '');
var _fcmBody = _cancellerSetBy === 'driver'
  ? 'המנהל ביטל את התור שקבעת. אם תרצה, תוכל לקבוע מחדש.'
  : 'תורך במוסך בוטל על ידי המנהל.';
```
Use `_fcmBody` where the notification body string was.

- [ ] **Step 3: Also fix the garageSync `cancelled` status message in `_firebaseSyncAdminAppointment`**

The `garageSync` Firebase node with `status:'cancelled'` triggers a toast in `driver/app.js`.
Find the toast text for `status === 'cancelled'` in the `_initFbGarageStatusSync` listener in `app.js`.
Add context:
```javascript
// 'setBy' is written into garageSync from the GAS cancel path (add it there if missing)
var _cancelMsg = (data.setBy === 'driver')
  ? '❌ המנהל ביטל את התור שקבעת'
  : '❌ התור בוטל על ידי המנהל';
```

For this to work, `_firebaseSyncAdminAppointment` must also write `setBy` when cancelling:
In `code.js`, in `_firebaseSyncAdminAppointment`, change the cancel payload:
```javascript
: { status: 'cancelled', eventId: eventId, updatedAt: Date.now(), consumed: false, setBy: appointmentSetBy || '' };
```
(You'll need to pass `appointmentSetBy` as a parameter or look it up from the sheet.)

- [ ] **Step 4: Commit**
```bash
git add "13.4.26/code.js" "driver/app.js"
git commit -m "feat: contextual FCM + toast text for cancel based on appointmentSetBy"
```

---

## Task 5: Replace `confirm()` cancel dialogs with styled in-app modals

**Files:**
- Modify: `13.4.26/index.html` — admin cancel confirmation
- Modify: `driver/app.js` — driver cancel confirmation (if using `confirm()`)

**Why:** Project rule: no browser popups. Cancel is irreversible — must use styled modal.

- [ ] **Step 1: Find all `confirm(` in index.html related to garage cancel**

```bash
grep -n "confirm(" "13.4.26/index.html" | grep -i "cancel\|ביטול\|garage\|מוסך"
```

- [ ] **Step 2: Replace each with `_gcAlert()` style 2-button modal**

For each admin cancel confirm, replace:
```javascript
if (!confirm('האם לבטל את התור?')) return;
// ... cancel logic
```
With:
```javascript
_gcConfirm('ביטול תור במוסך', 'האם אתה בטוח שברצונך לבטל את התור? הנהג יקבל הודעה.', function() {
  // ... cancel logic
});
```

If `_gcConfirm` doesn't exist, add it alongside `_gcAlert`:
```javascript
function _gcConfirm(title, msg, onOk) {
  // Reuse same modal structure as _gcAlert but with two buttons: OK + Cancel
  // ... styled modal implementation
  // On OK click: onOk(); close modal
  // On Cancel click: close modal only
}
```

- [ ] **Step 3: Check driver/app.js for `confirm(` in cancel path**
```bash
grep -n "confirm(" "driver/app.js" | grep -i "cancel\|ביטול\|garage\|מוסך"
```
Replace any found with the in-app modal pattern already used in the driver UI.

- [ ] **Step 4: Commit**
```bash
git add "13.4.26/index.html" "driver/app.js"
git commit -m "fix: replace confirm() cancel dialogs with styled in-app modals (project rule)"
```

---

## Task 6: Fleet Manager listener for `garageAppointmentSetByDriver`

**Files:**
- Modify: `13.4.26/index.html` — add Firebase listener for `garageAppointmentSetByDriver/{vehKey}`

**Why:** GAS already writes to `garageAppointmentSetByDriver/{vehKey}` when driver sets appointment (Task 3c in `fix_garage.py`). But Fleet Manager has NO listener for it. Admin never sees a real-time notification that the driver set an appointment. This adds the listener.

**Trigger:** Fires when driver sets appointment. Admin sees a badge/notification on the relevant event card.

- [ ] **Step 1: Locate where Fleet Manager attaches Firebase listeners**

In `index.html`, find the block that attaches `garageCancelledByDriver` listener (already exists). Replicate the pattern for `garageAppointmentSetByDriver`.

- [ ] **Step 2: Add listener**

```javascript
// Listen for driver-set appointments
var _fbDriverApptRef = firebase.database().ref('garageAppointmentSetByDriver');
_fbDriverApptRef.on('child_added', function(snap) {
  var d = snap.val();
  if (!d || !d.vehicleId) return;
  // Show badge on the event card for this vehicle/eventId
  _gcMarkDriverSetAppt(d.vehicleId, d.eventId, d.driverName, d.appointmentDate, d.appointmentTime);
  // Show toast notification
  _gcShowToast('🔔 ' + (d.driverName || 'נהג') + ' קבע תור למוסך ב-' + (d.appointmentDate || '?'), 'info', 8000);
});
```

- [ ] **Step 3: Add `_gcMarkDriverSetAppt` to update the event card**

```javascript
function _gcMarkDriverSetAppt(vehicleId, eventId, driverName, date, time) {
  // Find the event card in the DOM by eventId
  var card = document.querySelector('[data-event-id="' + eventId + '"]');
  if (!card) return;
  // Add or update a "driver set" badge
  var existing = card.querySelector('.gc-driver-set-badge');
  if (!existing) {
    existing = document.createElement('div');
    existing.className = 'gc-driver-set-badge';
    existing.style.cssText = 'font-size:11px;color:#22c55e;background:#052e16;border:1px solid #166534;border-radius:4px;padding:2px 6px;margin-top:4px;display:inline-block;';
    card.appendChild(existing);
  }
  existing.textContent = '⚙️ הנהג קבע: ' + (date || '') + (time ? ' ' + time : '');
}
```

- [ ] **Step 4: Ensure event cards have `data-event-id` attribute**

Check that the DOM elements for event cards already include `data-event-id`. If not, add it when the card is rendered:
```javascript
card.setAttribute('data-event-id', req.eventId);
```

- [ ] **Step 5: Commit**
```bash
git add "13.4.26/index.html"
git commit -m "feat: Fleet Manager listener for garageAppointmentSetByDriver — real-time badge + toast"
```

---

## Task 7: Toast to driver when admin CHANGES an existing appointment

**Files:**
- Modify: `driver/app.js` — `_initFbGarageStatusSync` appointment_set path

**Why:** Currently, if driver already has an appointment and admin changes it, the driver just sees the widget update silently. There should be an explicit "המנהל שינה את התור שלך" toast.

- [ ] **Step 1: Detect "change" vs "new" in garageSync listener**

In `_initFbGarageStatusSync`, in the `status === 'appointment_set'` branch, before writing to localStorage:
```javascript
// Was there already an appointment? If so, this is a change.
var _prevAppt = null;
try { _prevAppt = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null'); } catch(_) {}
var _isChange = _prevAppt && _prevAppt.eventId && _prevAppt.appointmentDate &&
                (_prevAppt.appointmentDate !== _aSet.appointmentDate || _prevAppt.appointmentTime !== _aSet.appointmentTime);
```

- [ ] **Step 2: Show contextual toast**

After writing `_aSet` to localStorage:
```javascript
if (_isChange) {
  _showToast('🔄 המנהל שינה את התור שלך ל-' + _aSet.appointmentDate + ' בשעה ' + _aSet.appointmentTime, 'warning', 8000);
} else {
  _showToast('✅ קבלת תור במוסך ל-' + _aSet.appointmentDate + ' בשעה ' + _aSet.appointmentTime, 'success', 6000);
}
```

- [ ] **Step 3: Commit**
```bash
git add "driver/app.js"
git commit -m "feat: toast to driver when admin changes existing appointment (change vs new detection)"
```

---

## Task 8: Deploy, verify end-to-end, write QA report

**Files:**
- Write: `driver/docs/qa/2026-05-25-garage-conflict-resolution-qa.md`

- [ ] **Step 1: Bump SCHEMA_VERSION and push GAS**
```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
# Verify SCHEMA_VERSION was bumped in code.js
clasp push
```
Check Apps Script Executions for errors.

- [ ] **Step 2: Deploy driver app**
```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
git push origin main
# GitHub Pages auto-deploys
```

- [ ] **Step 3: End-to-end test matrix**

| Scenario | Expected |
|----------|----------|
| Driver sets appointment | Sheet gets `appointmentSetBy=driver`. Fleet Manager shows ⚙️ badge. `garageAppointmentSetByDriver` node written. |
| Admin sets appointment (first time, no conflict) | Sheet gets `appointmentSetBy=admin`. Driver gets toast "✅ קבלת תור". |
| Admin tries to set over driver's appointment | Fleet Manager shows conflict modal with driver's date/time. |
| Admin clicks "שמור תור נהג" | No change. Toast "התור של הנהג נשמר". |
| Admin clicks "דרוס וקבע חדש" | New appointment written. Driver gets toast "🔄 המנהל שינה את התור שלך". FCM sent. |
| Admin sets exact same date+time again | Returns `noop:true`. No double FCM. |
| Admin cancels driver-set appointment | FCM body: "המנהל ביטל את התור שקבעת. אם תרצה, תוכל לקבוע מחדש." |
| Admin cancels admin-set appointment | FCM body: "תורך במוסך בוטל על ידי המנהל." |
| Driver cancels own appointment | `garageCancelledByDriver` written. Toast to driver (driver-cancel flow). |

- [ ] **Step 4: Remove `[WIDGET-DBG]` console.log lines from driver/app.js**

```bash
grep -n "\[WIDGET-DBG\]" "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js"
```
Remove all lines found (they were diagnostic, not production).

- [ ] **Step 5: Write QA report**

Create `driver/docs/qa/2026-05-25-garage-conflict-resolution-qa.md` with:
- Each scenario tested: pass/fail
- Any bugs found during testing: root cause + fix
- Lessons learned

- [ ] **Step 6: Final commit**
```bash
git add .
git commit -m "chore: remove WIDGET-DBG logs, add QA report for garage conflict resolution"
```

---

## Summary of Changes

| Task | File(s) | Impact |
|------|---------|--------|
| 1 | code.js | `appointmentSetBy` column — who set the appointment |
| 2 | code.js + index.html | Banner shows "set by driver/admin" |
| 3 | code.js + index.html | Conflict modal when admin overrides driver |
| 4 | code.js + app.js | Contextual FCM/toast text for cancel |
| 5 | index.html + app.js | Replace `confirm()` with styled modals |
| 6 | index.html | Fleet Manager notified when driver sets appointment |
| 7 | app.js | Driver notified when admin changes appointment |
| 8 | — | Deploy + E2E test + QA report + clean logs |

**MVP definition of done:** All 8 test-matrix rows pass. No `confirm()` in garage flows. `[WIDGET-DBG]` logs removed. QA report written.
