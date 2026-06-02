# Garage Appointment — Request Number Fix & Multi-Request Selector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `requestNumber` a real persisted column in `FIELD_EVENTS`, eliminate the ~15 fragile `/-(\d+)$/` regex derivations across the three codebases, add a multi-request selector to the admin appointment modal, add a `standalone` path to `adminCreateAppointment`, and add a driver-app startup reconciliation safety net plus a `consumed`-flag fix so the stale `#15` garage widget can never persist.

**Architecture:** Three coupled codebases. (1) GAS backend `13.4.26/code.js` (~18,443 lines) — Apps Script, no modules, edited via Edit tool or Python `bytes.replace()` scripts, deployed via `clasp-push.ps1`. (2) GAS web UI `13.4.26/index.html` (~23,044 lines) — admin SPA, served by the same GAS project. (3) Driver PWA `driver/app.js` (~6,495 lines) — vanilla JS, talks to GAS over `gasPost(action)` GET requests and to Firebase Realtime DB via `garageSync/{vehKey}` listeners. The `requestNumber` is currently derived everywhere from the trailing integer of `eventId` (e.g. `EVT-20260601-015` → `15`). We replace that derivation with a real per-vehicle sequential counter written at row-creation time, then read it through as a first-class field through GAS responses, Firebase payloads, and localStorage.

**Tech Stack:** Google Apps Script (V8), Firebase Realtime Database, vanilla JS PWA, clasp, Python 3 (for large `code.js` patches), Node (`node --check`), PowerShell (`clasp-push.ps1`).

---

## Pre-Flight — Absolute Paths & Critical Constraints

**Absolute paths:**
- GAS backend: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- GAS UI: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html`
- Driver PWA: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js`
- Deploy wrapper: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\clasp-push.ps1`

**CRITICAL CONSTRAINTS (read before every edit):**
1. **NEVER use the Write tool on `code.js` or `index.html`.** Use Edit (exact `old_string`/`new_string`) or a Python `bytes.replace()` script. Write silently truncates files this large — this caused a production incident.
2. **Large structural `code.js` changes → Python `bytes.replace()` script** following the existing `patch_*.py` / `fix_*.py` pattern in `13.4.26/`.
3. **GAS column writes MUST use `headers.indexOf(colName)` at runtime, never positional.**
4. **All UI text in Hebrew.**
5. **No `confirm()` / `alert()` / `prompt()`** — use the existing `_gcAlert()` modal in index.html.
6. **`git commit` after every task.**
7. **JS string escaping** — scan for unescaped inner quotes in `font-family:'...'` and `onclick="...'..."` before every push.
8. **Run `node --check app.js` before every git push of app.js.**
9. **Deploy via `pwsh .\clasp-push.ps1`** — never `clasp push` directly.
10. **`appsscript.json`** — preserve `webapp.access = "ANYONE_ANONYMOUS"`, never `"ANYONE"`.
11. **Date columns → `toISOString()`. Time columns → `HH:MM` string. Never `String(new Date())`.**
12. **Before every save to localStorage `activeGarageAppointment`** — verify eventId belongs to an active (non-terminal) request.
13. **`code.js` must never drop below 17,350 lines / 1,185,000 bytes.** After each `code.js` edit run `(Get-Content code.js).Count` and confirm it is ≥ 18,443 (current) or higher.
14. **Do not commit `code.js.bak.*` backups.**

**Key facts established by investigation (use these exact line numbers / signatures):**

- `FIELD_EVENTS_COLS` is at `code.js:137-141`, 19 columns:
  `eventId, vehicleId, vehicleNum, driverId, driverName, driverEmail, type, timestamp, lat, lng, details, status, managerNotes, createdAt, approvedAt, appointmentDate, appointmentTime, reminderSentAt, appointmentSetBy`
- **BUG noted:** `_driverFieldEvent`'s row array (`code.js:15149-15165`) has only **17** elements — it is missing trailing `appointmentSetBy` (and was missing `reminderSentAt`/`appointmentSetBy` alignment). We extend it carefully when adding `requestNumber`.
- `_driverFieldEvent` — `code.js:15107`. eventId generated at `15148` (`'EVT-' + dateStr + '-' + counter`, counter = lastRow-based, NOT per-vehicle). Row appended at `15166`.
- `adminCreateAppointment(vehicleNum, appointmentDate, appointmentTime, reason, managerNote, sessionToken, force)` — `code.js:17988`. `bestCandidate` loop `18034-18055`. New-event (`ADM-`) branch `18142-18162`. New row array `18153-18159` (19 elements).
- `adminSetAppointment(eventId, appointmentDate, appointmentTime, managerNote, sessionToken, force)` — `code.js:17904`.
- `garageRequestAction(eventId, action, managerNote, sessionToken)` (admin approve/reject) — `code.js:15750`; regex derivation at `15804-15805`.
- `getGarageRequests(sessionToken)` — `code.js:18387`; builds `out` objects `18403-18440`. No `requestNumber` field today.
- `_firebaseSyncAdminAppointment(vehicleId, eventId, date, time, note, setBy, requestNumber)` — `code.js:18249`; derives `_reqN` from regex when not supplied `18254-18256`.
- `_firebaseSyncGarageStatus(vehicleId, action, eventId, requestNumber, reasonLabel, noteText, details)` — `code.js:4945`.
- `_garageRequestAction(params)` (driver cancel) — `code.js:14605`; regex at `14645-14646`.
- `_getActiveAppointment(params)` — `code.js:14968`; returns `best` object `15017-15023` (no requestNumber today).
- doPost router: driver actions array at `code.js:4687-4689`, dispatch `if/else` block `4693-4711`.
- **index.html regex sites:** `5735` (`_acGarageRenderCard` reqNum), `6002` (`_acGarageRenderHistCard` reqNum2), `22947` (`_showCancellationToast`).
- index.html modal: `_gcShowAppointmentModal` `22408`, `_gcApprovedByVehicle` build loop `22417-22457`, dropdown `optHtml` `22469-22471`, select element `22490`, `_gcUpdatePendingInfo` `22526-22545`, `_glbRenderDirectBanner(vehicleNum)` `22547`, `_glbRenderBanner(req)` `22568`, `_gcSaveAppointment(dateKey, existingEventId)` `22756-22830`, `_gcAlert(msg)` `22833`.
- index.html appointment-modal data load: `getGarageRequests` filtered to `approved`/`appointment_set` at `22398-22401`.
- **app.js regex sites:** `1258` (`_syncActiveAppointmentFromGAS`), `1376` (garageSync listener), `2116` (`renderGarageApptWidget`), `5189` (pending help card), `5431` (`_garagePoll` approved), `5485` (`_garageShowApproved`), `6245` (notif card meta).
- `gasPost(action, extra, opts)` — `app.js:832`; GET request, returns parsed JSON, throws on `!data.ok` unless `opts.silent`.
- `loadFullData()` — `app.js:1224-1247`. Calls `gasPost('driver_vehicle')`, sets STATE, then calls `_initFbGarageStatusSync()`, `_syncActiveAppointmentFromGAS()`, `_startActiveAppointmentPoll()`.
- `_initFbGarageStatusSync()` — `app.js:1312`; `cancelled` handling `1328-1344` (the `if (!data.consumed)` guard is at `1329`); `appointment_set` handling `1351-1404`.
- `_fbClearActiveAppointment()` — `app.js:266-270`.
- `renderGarageApptWidget()` — `app.js:2065`; reads `appt.requestNumber` with regex fallback at `2116`.
- `_loadActiveAppointment()` exists and is used to read localStorage `activeGarageAppointment`.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `13.4.26/code.js` | Add `requestNumber` column, per-vehicle counter helper, populate on create, read-through in all responses/firebase payloads, `standalone` param, `driver_garage_status` endpoint | 1, 2, 5, 8 |
| `13.4.26/index.html` | Replace regex derivations with real field; multi-request selector UI | 3, 9 |
| `driver/app.js` | Replace regex derivations; startup reconciliation; `consumed`-guard fix | 4, 6, 7 |

---

## Task 1: Add `requestNumber` to `FIELD_EVENTS_COLS` + per-vehicle counter + populate on create (code.js)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js:137-141` (add column)
- Modify: `code.js:15107-15166` (`_driverFieldEvent` — counter + row)
- Modify: `code.js:18142-18162` (`adminCreateAppointment` — counter + new row)

### Step 1.1 — Add `requestNumber` to `FIELD_EVENTS_COLS`

- [ ] **Edit** `code.js`. Append `requestNumber` as the final column.

old_string:
```javascript
var FIELD_EVENTS_COLS = [
  'eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
  'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
  'approvedAt','appointmentDate','appointmentTime','reminderSentAt','appointmentSetBy'
];
```
new_string:
```javascript
var FIELD_EVENTS_COLS = [
  'eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
  'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
  'approvedAt','appointmentDate','appointmentTime','reminderSentAt','appointmentSetBy',
  'requestNumber'
];
```

> NOTE: Appending the column at the END keeps every existing `headers.indexOf(...)` lookup valid. Existing sheets will have a blank cell for old rows — that is acceptable; the read-through helper (Task 2) falls back to regex when the field is empty so legacy rows still display a number.

### Step 1.2 — Add a per-vehicle counter helper function

The counter must be **sequential per vehicle** across all `garage_request` rows (any status), not per-day and not the sheet row number. We scan existing rows for the same vehicle and take `max(requestNumber)+1`, falling back to counting matching rows when the column is blank on legacy data.

- [ ] **Edit** `code.js`. Insert the helper immediately BEFORE `function _driverFieldEvent(params) {` (currently line 15107).

old_string:
```javascript
function _driverFieldEvent(params) {
```
new_string:
```javascript
/* Per-vehicle sequential request number for garage_request events.
 * Scans FIELD_EVENTS for all garage_request rows belonging to this vehicle
 * (matched by vehicleId OR vehicleNum) and returns max(requestNumber)+1.
 * Falls back to counting matching rows when the requestNumber column is blank
 * (legacy rows). `evtValues` is the full getValues() 2-D array (incl. header row);
 * `evtHeaders` is row 0. */
function _nextVehicleRequestNumber(evtValues, evtHeaders, vehId, vehNum) {
  var typeIdx  = evtHeaders.indexOf('type');
  var vIdx     = evtHeaders.indexOf('vehicleId');
  var vNumIdx  = evtHeaders.indexOf('vehicleNum');
  var idIdx    = evtHeaders.indexOf('eventId');
  var reqIdx   = evtHeaders.indexOf('requestNumber');
  var vId  = String(vehId  || '').trim();
  var vNum = String(vehNum || '').trim();
  var maxN = 0;
  var matchCount = 0;
  for (var i = 1; i < evtValues.length; i++) {
    if (String(evtValues[i][typeIdx] || '') !== 'garage_request') continue;
    var rVid  = String(evtValues[i][vIdx]  || '').trim();
    var rVnum = vNumIdx >= 0 ? String(evtValues[i][vNumIdx] || '').trim() : '';
    var matches = (vId && rVid === vId) || (vNum && rVnum === vNum);
    if (!matches) continue;
    matchCount++;
    var n = 0;
    if (reqIdx >= 0) { var raw = evtValues[i][reqIdx]; n = parseInt(raw, 10); if (isNaN(n)) n = 0; }
    if (n === 0) {
      /* legacy fallback: derive from eventId trailing integer */
      var m = String(evtValues[i][idIdx] || '').match(/-(\d+)$/);
      if (m) { var dn = parseInt(m[1], 10); if (!isNaN(dn)) n = dn; }
    }
    if (n > maxN) maxN = n;
  }
  /* If no numbered rows found but matches exist, base on count; else start at 1 */
  return (maxN > 0 ? maxN : matchCount) + 1;
}

function _driverFieldEvent(params) {
```

### Step 1.3 — Populate `requestNumber` in `_driverFieldEvent`

The duplicate-check block (`code.js:15125-15141`) already reads `sh.getDataRange().getValues()` into `existingRows` with header `eHeaders`, but only inside the `if (params.type === 'garage_request')` block. We must compute the request number there and extend the appended row.

- [ ] **Edit** `code.js`. Replace the eventId/row construction block.

old_string:
```javascript
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyyMMdd');
    var existingRows = sh.getLastRow() - 1;
    var counter = String(existingRows + 1);
    while (counter.length < 3) counter = '0' + counter;
    var eventId = 'EVT-' + dateStr + '-' + counter;
    var row = [
      eventId,
      _veh.id     || '',
      _veh.num    || '',
      auth.email  || '',
      _veh.holder || '',
      auth.email  || '',
      params.type,
      now.toISOString(),
      params.lat || null,
      params.lng || null,
      params.details || '{}',
      params.type === 'garage_request' ? 'pending' : 'open',
      '',
      now.toISOString(),
      '', '', ''
    ];
    sh.appendRow(row);
```
new_string:
```javascript
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyyMMdd');
    var existingRowCount = sh.getLastRow() - 1;
    var counter = String(existingRowCount + 1);
    while (counter.length < 3) counter = '0' + counter;
    var eventId = 'EVT-' + dateStr + '-' + counter;

    /* Per-vehicle sequential request number — only meaningful for garage_request */
    var _reqNumVal = '';
    if (params.type === 'garage_request') {
      var _allVals = sh.getDataRange().getValues();
      var _allHdr  = _allVals[0] || [];
      _reqNumVal = String(_nextVehicleRequestNumber(_allVals, _allHdr, _veh.id, _veh.num));
    }

    /* Build row positionally by FIELD_EVENTS_COLS order:
       eventId, vehicleId, vehicleNum, driverId, driverName, driverEmail,
       type, timestamp, lat, lng, details, status, managerNotes, createdAt,
       approvedAt, appointmentDate, appointmentTime, reminderSentAt, appointmentSetBy, requestNumber */
    var row = [
      eventId,
      _veh.id     || '',
      _veh.num    || '',
      auth.email  || '',
      _veh.holder || '',
      auth.email  || '',
      params.type,
      now.toISOString(),
      params.lat || null,
      params.lng || null,
      params.details || '{}',
      params.type === 'garage_request' ? 'pending' : 'open',
      '',
      now.toISOString(),
      '',           // approvedAt
      '',           // appointmentDate
      '',           // appointmentTime
      '',           // reminderSentAt
      '',           // appointmentSetBy
      _reqNumVal    // requestNumber
    ];
    sh.appendRow(row);
```

> NOTE: This also fixes the pre-existing bug where the row had only 17 elements (missing `reminderSentAt`/`appointmentSetBy` alignment). The row is now exactly 20 elements = 20 columns.

### Step 1.4 — Populate `requestNumber` in `adminCreateAppointment` new-event branch

- [ ] **Edit** `code.js`. Replace the `ADM-` new-event branch.

old_string:
```javascript
      /* No existing event — create new one */
      var dateStr = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyyMMdd');
      var counter = String(evtSheet.getLastRow());
      while (counter.length < 3) counter = '0' + counter;
      eventId = 'ADM-' + dateStr + '-' + counter;
      var detObj = {};
      if (reason) detObj.reason = reason;
      /* FIELD_EVENTS_COLS: eventId, vehicleId, vehicleNum, driverId, driverName, driverEmail,
         type, timestamp, lat, lng, details, status, managerNotes, createdAt,
         approvedAt, appointmentDate, appointmentTime, reminderSentAt, appointmentSetBy */
      var newRow = [
        eventId, firebaseVehKey, veh.num, firebaseVehKey, veh.holder, veh.email,
        'garage_request', now.toISOString(), null, null,
        JSON.stringify(detObj), 'appointment_set', managerNote || '',
        now.toISOString(), now.toISOString(),
        appointmentDate, appointmentTime, '', 'admin'
      ];
      evtSheet.appendRow(newRow);
      Logger.log('adminCreateAppointment: created new event ' + eventId + ' for vehicle ' + veh.num);
```
new_string:
```javascript
      /* No existing event — create new one */
      var dateStr = Utilities.formatDate(now, 'Asia/Jerusalem', 'yyyyMMdd');
      var counter = String(evtSheet.getLastRow());
      while (counter.length < 3) counter = '0' + counter;
      eventId = 'ADM-' + dateStr + '-' + counter;
      var detObj = {};
      if (reason) detObj.reason = reason;
      var _admReqNum = String(_nextVehicleRequestNumber(evtData, evtHdr, veh.id, veh.num));
      /* FIELD_EVENTS_COLS: eventId, vehicleId, vehicleNum, driverId, driverName, driverEmail,
         type, timestamp, lat, lng, details, status, managerNotes, createdAt,
         approvedAt, appointmentDate, appointmentTime, reminderSentAt, appointmentSetBy, requestNumber */
      var newRow = [
        eventId, firebaseVehKey, veh.num, firebaseVehKey, veh.holder, veh.email,
        'garage_request', now.toISOString(), null, null,
        JSON.stringify(detObj), 'appointment_set', managerNote || '',
        now.toISOString(), now.toISOString(),
        appointmentDate, appointmentTime, '', 'admin',
        _admReqNum
      ];
      evtSheet.appendRow(newRow);
      Logger.log('adminCreateAppointment: created new event ' + eventId + ' #' + _admReqNum + ' for vehicle ' + veh.num);
```

### Step 1.5 — Validate & commit

- [ ] Run: `node --check code.js` — Expected: no output (success).
- [ ] Run: `(Get-Content code.js).Count` — Expected: ≥ 18,443.
- [ ] Commit:
```bash
git add code.js
git commit -m "feat(garage): add requestNumber column + per-vehicle counter, populate on create

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then print short hash: `git rev-parse --short HEAD`

---

## Task 2: Read-through `requestNumber` in all GAS responses & Firebase payloads (code.js)

**Files:**
- Modify: `code.js:18403-18440` (`getGarageRequests` output object)
- Modify: `code.js:15017-15023` (`_getActiveAppointment` best object)
- Modify: `code.js:15804-15805` (`garageRequestAction` regex)
- Modify: `code.js:14645-14646` (`_garageRequestAction` driver cancel regex)
- Modify: `code.js:18169-18170` and `18232-18233` (`adminCreateAppointment` / `adminCancelAppointment` FCM regex)
- Modify: `code.js:18249-18256` (`_firebaseSyncAdminAppointment` derive)

> Strategy: add a tiny shared helper `_eventRequestNumber(rowObj_or_eventId, rawRequestNumber)` that returns the real value if present, else regex-derives. Then replace each site. This keeps DRY and preserves legacy-row behaviour.

### Step 2.1 — Add `_reqNumOrDerive` helper

- [ ] **Edit** `code.js`. Insert immediately before `function _nextVehicleRequestNumber` (added in Task 1).

old_string:
```javascript
/* Per-vehicle sequential request number for garage_request events.
```
new_string:
```javascript
/* Returns the real requestNumber when present, else derives from eventId's
 * trailing integer (legacy rows). Accepts the raw field value and the eventId. */
function _reqNumOrDerive(rawRequestNumber, eventId) {
  var n = parseInt(rawRequestNumber, 10);
  if (!isNaN(n) && n > 0) return String(n);
  var m = String(eventId || '').match(/-(\d+)$/);
  return m ? String(parseInt(m[1], 10)) : '';
}

/* Per-vehicle sequential request number for garage_request events.
```

### Step 2.2 — `getGarageRequests` — emit `requestNumber`

- [ ] **Edit** `code.js`. In the `out.push({...})` object, add `requestNumber` after `eventId`.

old_string:
```javascript
    out.push({
      eventId:         r.eventId || '',
      vehicleId:       r.vehicleId || '',
```
new_string:
```javascript
    out.push({
      eventId:         r.eventId || '',
      requestNumber:   _reqNumOrDerive(r.requestNumber, r.eventId),
      vehicleId:       r.vehicleId || '',
```

### Step 2.3 — `_getActiveAppointment` — emit `requestNumber`

The loop reads `data[i]` by index. Add a `requestNumber` index lookup and include it in `best`.

- [ ] **Edit** `code.js`. Add the index after the existing `detIdx`.

old_string:
```javascript
    var detIdx  = headers.indexOf('details');
    var best = null;
```
new_string:
```javascript
    var detIdx  = headers.indexOf('details');
    var reqIdx  = headers.indexOf('requestNumber');
    var best = null;
```

- [ ] **Edit** `code.js`. Add `requestNumber` to the `best` object.

old_string:
```javascript
        best = {
          eventId:         String(data[i][idIdx] || ''),
          appointmentDate: _dtStr,
          appointmentTime: _tm || '09:00',
          managerNote:     String(data[i][nmIdx] || ''),
          garageInfo:      details.garageInfo || null
        };
```
new_string:
```javascript
        best = {
          eventId:         String(data[i][idIdx] || ''),
          requestNumber:   _reqNumOrDerive(reqIdx >= 0 ? data[i][reqIdx] : '', String(data[i][idIdx] || '')),
          appointmentDate: _dtStr,
          appointmentTime: _tm || '09:00',
          managerNote:     String(data[i][nmIdx] || ''),
          garageInfo:      details.garageInfo || null
        };
```

### Step 2.4 — `garageRequestAction` (admin approve/reject) — use real field

This function reads `data[i]` by index. We need a `requestNumber` index. Find the index-declaration area near the top of the function. The regex is at `15804-15805`.

- [ ] **Edit** `code.js`. Replace the regex block. (The variable `i` and `headers`/`data` are in scope here.)

old_string:
```javascript
      // Extract sequential request number from eventId (EVT-YYYYMMDD-NNN)
      var reqNumMatch = String(eventId).match(/-(\d+)$/);
      var requestNumber = reqNumMatch ? String(parseInt(reqNumMatch[1], 10)) : '';
```
new_string:
```javascript
      // Real requestNumber column (legacy rows fall back to eventId derivation)
      var _graReqIdx   = headers.indexOf('requestNumber');
      var requestNumber = _reqNumOrDerive(_graReqIdx >= 0 ? data[i][_graReqIdx] : '', eventId);
```

### Step 2.5 — `_garageRequestAction` (driver cancel) — use real field

Regex at `14645-14646`. `headers`/`data`/`i` in scope.

- [ ] **Edit** `code.js`.

old_string:
```javascript
          var _cReqMatch = String(params.eventId).match(/-(\d+)$/);
          var _cReqNum   = _cReqMatch ? String(parseInt(_cReqMatch[1], 10)) : params.eventId;
```
new_string:
```javascript
          var _cRnIdx    = headers.indexOf('requestNumber');
          var _cReqNum   = _reqNumOrDerive(_cRnIdx >= 0 ? data[i][_cRnIdx] : '', params.eventId) || params.eventId;
```

### Step 2.6 — `adminCreateAppointment` FCM payload — use real field

At `18169-18170` the FCM derives `_gReqN2`. By this point in `adminCreateAppointment`, `evtHdr` and (for existing rows) `evtData` are in scope, and for new rows `_admReqNum` was computed in Task 1.4. Simplest robust fix: re-read the just-written/updated requestNumber via the helper using `eventId` and the row's value when available; for the create-path we already have `_admReqNum`. Use a unified local `_acaReqNum` set in both branches.

- [ ] **Edit** `code.js`. In the existing-row branch (`if (existingSheetRow > 0) {`), capture the request number. Find the end of that branch's update block.

old_string:
```javascript
      Logger.log('adminCreateAppointment: updated existing event ' + eventId + ' for vehicle ' + veh.num);
    } else {
```
new_string:
```javascript
      var _acaExReqIdx = evtHdr.indexOf('requestNumber');
      _acaReqNum = _reqNumOrDerive(_acaExReqIdx >= 0 ? evtData[existingSheetRow - 1][_acaExReqIdx] : '', eventId);
      Logger.log('adminCreateAppointment: updated existing event ' + eventId + ' for vehicle ' + veh.num);
    } else {
```

- [ ] **Edit** `code.js`. Declare `_acaReqNum` before the branch and set it in the create branch. Replace the create-branch logging line (added in Task 1.4).

old_string:
```javascript
      evtSheet.appendRow(newRow);
      Logger.log('adminCreateAppointment: created new event ' + eventId + ' #' + _admReqNum + ' for vehicle ' + veh.num);
```
new_string:
```javascript
      evtSheet.appendRow(newRow);
      _acaReqNum = _admReqNum;
      Logger.log('adminCreateAppointment: created new event ' + eventId + ' #' + _admReqNum + ' for vehicle ' + veh.num);
```

- [ ] **Edit** `code.js`. Declare `_acaReqNum` at function-local scope. Insert right after the `var firebaseVehKey = ...` line.

old_string:
```javascript
    var firebaseVehKey = veh.id || veh.num; /* use id if available, else num */
```
new_string:
```javascript
    var firebaseVehKey = veh.id || veh.num; /* use id if available, else num */
    var _acaReqNum = ''; /* unified requestNumber for FCM + firebase sync */
```

- [ ] **Edit** `code.js`. Replace the FCM regex block + pass `_acaReqNum` into `_firebaseSyncAdminAppointment`.

old_string:
```javascript
      _firebaseSyncAdminAppointment(firebaseVehKey, eventId, appointmentDate, appointmentTime, managerNote, 'admin');
      var pushTitle = '\u{1F4C5} תור נקבע: ' + appointmentDate + ' ' + appointmentTime;
      var pushBody  = 'מנהל הצי קבע לך תור במוסך ל-' + appointmentDate + ' בשעה ' + appointmentTime;
      var _gReqM2 = String(eventId).match(/-(\d+)$/);
      var _gReqN2 = _gReqM2 ? String(parseInt(_gReqM2[1], 10)) : '';
      var _fcmRes2 = _sendFcmToDriver(firebaseVehKey, pushTitle, pushBody, {
        alertType: 'garage_appointment_set', vehicleId: firebaseVehKey, eventId: eventId,
        requestNumber: _gReqN2,
```
new_string:
```javascript
      _firebaseSyncAdminAppointment(firebaseVehKey, eventId, appointmentDate, appointmentTime, managerNote, 'admin', _acaReqNum);
      var pushTitle = '\u{1F4C5} תור נקבע: ' + appointmentDate + ' ' + appointmentTime;
      var pushBody  = 'מנהל הצי קבע לך תור במוסך ל-' + appointmentDate + ' בשעה ' + appointmentTime;
      var _gReqN2 = _acaReqNum;
      var _fcmRes2 = _sendFcmToDriver(firebaseVehKey, pushTitle, pushBody, {
        alertType: 'garage_appointment_set', vehicleId: firebaseVehKey, eventId: eventId,
        requestNumber: _gReqN2,
```

### Step 2.7 — `adminCancelAppointment` FCM regex — use real field

At `18232-18233`. `headers`/`data`/`i` in scope.

- [ ] **Edit** `code.js`.

old_string:
```javascript
        var _gReqM3 = String(eventId).match(/-(\d+)$/);
        var _gReqN3 = _gReqM3 ? String(parseInt(_gReqM3[1], 10)) : '';
```
new_string:
```javascript
        var _accRnIdx = headers.indexOf('requestNumber');
        var _gReqN3 = _reqNumOrDerive(_accRnIdx >= 0 ? data[i][_accRnIdx] : '', eventId);
```

> NOTE: `_firebaseSyncAdminAppointment` already derives `_reqN` from eventId when `requestNumber` is not supplied (`18254-18256`). Since `adminSetAppointment` (`17958`) and `adminCancelAppointment` (`18228`) call it WITHOUT a requestNumber arg, those keep the legacy derivation — acceptable, because their eventIds are real and the new column will be reflected on the next `getGarageRequests`. Only `adminCreateAppointment` now passes the explicit value (Step 2.6). No further change needed in `_firebaseSyncAdminAppointment`.

### Step 2.8 — Validate & commit

- [ ] Run: `node --check code.js` — Expected: no output.
- [ ] Run: `(Get-Content code.js).Count` — Expected: ≥ 18,443.
- [ ] Commit:
```bash
git add code.js
git commit -m "refactor(garage): read requestNumber from real column with regex fallback

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 3: Replace regex derivations in index.html with real field

**Files:**
- Modify: `index.html:5735-5736` (`_acGarageRenderCard`)
- Modify: `index.html:6002-6003` (history card)
- Modify: `index.html:22947-22948` (`_showCancellationToast`)

> `getGarageRequests` now returns `requestNumber` (Task 2.2). These three sites consume `req`/objects derived from it. Prefer `req.requestNumber` and keep regex as fallback for any object that lacks it.

### Step 3.1 — `_acGarageRenderCard`

- [ ] **Edit** `index.html`.

old_string:
```javascript
  var _rM         = eid.match(/-(\d+)$/);
  var reqNum      = _rM ? String(parseInt(_rM[1], 10)) : '';
```
new_string:
```javascript
  var reqNum      = (req.requestNumber !== undefined && req.requestNumber !== null && req.requestNumber !== '')
                      ? String(req.requestNumber)
                      : (function(){ var _rM = eid.match(/-(\d+)$/); return _rM ? String(parseInt(_rM[1], 10)) : ''; })();
```

### Step 3.2 — history card (line 6002)

- [ ] **Edit** `index.html`.

old_string:
```javascript
  var _rM2     = String(req.eventId || req.id || '').match(/-(\d+)$/);
  var reqNum2  = _rM2 ? String(parseInt(_rM2[1], 10)) : '';
```
new_string:
```javascript
  var reqNum2  = (req.requestNumber !== undefined && req.requestNumber !== null && req.requestNumber !== '')
                   ? String(req.requestNumber)
                   : (function(){ var _rM2 = String(req.eventId || req.id || '').match(/-(\d+)$/); return _rM2 ? String(parseInt(_rM2[1], 10)) : ''; })();
```

### Step 3.3 — `_showCancellationToast`

- [ ] **Edit** `index.html`.

old_string:
```javascript
  var reqNumMatch = String(req.eventId || req.id || '').match(/-(\d+)$/);
  var reqNum  = reqNumMatch ? String(parseInt(reqNumMatch[1], 10)) : (req.eventId || req.id || '');
```
new_string:
```javascript
  var reqNum  = (req.requestNumber !== undefined && req.requestNumber !== null && req.requestNumber !== '')
                  ? String(req.requestNumber)
                  : (function(){ var _m = String(req.eventId || req.id || '').match(/-(\d+)$/); return _m ? String(parseInt(_m[1], 10)) : (req.eventId || req.id || ''); })();
```

### Step 3.4 — Validate & commit

- [ ] Manually scan the three edited regions for unescaped inner quotes in any `onclick="...'...'"` — none introduced here (no new onclick).
- [ ] Commit:
```bash
git add index.html
git commit -m "refactor(garage-ui): use real requestNumber field with regex fallback

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 4: Replace regex derivations in app.js with real field

**Files:**
- Modify: `driver/app.js` lines `1258`, `1376`, `2116`, `5189-5190`, `5485`, `6244-6246`

> These all already prefer a `requestNumber` property and only regex as fallback. After GAS/Firebase now carry the real field, the fallbacks become dead in practice but stay for offline-cached legacy data. The only sites worth simplifying are the two that DON'T already have a `.requestNumber ||` guard: `5189` and `5431`. `5431` already reads `r.requestNumber || _reqNum` — fine. We tidy `5189` to prefer `pending.requestNumber`.

### Step 4.1 — pending help card (line 5187-5191)

- [ ] **Edit** `app.js`.

old_string:
```javascript
  var reqNum = '';
  if (pending.eventId) {
    var m = String(pending.eventId).match(/-(\d+)$/);
    if (m) reqNum = String(parseInt(m[1], 10));
  }
```
new_string:
```javascript
  var reqNum = '';
  if (pending.requestNumber !== undefined && pending.requestNumber !== null && pending.requestNumber !== '') {
    reqNum = String(pending.requestNumber);
  } else if (pending.eventId) {
    var m = String(pending.eventId).match(/-(\d+)$/);
    if (m) reqNum = String(parseInt(m[1], 10));
  }
```

> The sites at `1258`, `1376`, `2116`, `5485`, `6244-6246` already have `X.requestNumber || (regex fallback)` form and are correct as-is — no edit needed. We leave them; the regex is now only a legacy/offline fallback.

### Step 4.2 — Validate & commit

- [ ] Run: `node --check app.js` — Expected: no output.
- [ ] Commit:
```bash
git add app.js
git commit -m "refactor(driver): prefer real requestNumber in pending help card

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 5: New GAS action `driver_garage_status` (code.js — additive)

**Files:**
- Modify: `code.js:4687-4711` (router: register action + dispatch)
- Modify: `code.js` (new function `_driverGarageStatus` — insert after `_getActiveAppointment`, ~line 15031)

Returns the current **active** (non-terminal) `garage_request` for the authenticated driver's vehicle: the highest-priority non-terminal row (priority pending/open < approved < appointment_set per the existing ranking, but for "active" we want the most relevant). We return the single best non-terminal row with its `eventId`, `requestNumber`, and `status`; `null` if none.

### Step 5.1 — Add `_driverGarageStatus` function

- [ ] **Edit** `code.js`. Insert immediately after the closing brace of `_getActiveAppointment` (just before the `// ===...` comment at line 15033).

old_string:
```javascript
    return { ok: true, appointment: best };
  } catch(e) {
    Logger.log('_getActiveAppointment error: ' + e);
    return { ok: false, error: 'server_error' };
  }
}

// ===================================================================
// Garage Calendar - getAppointments (called via google.script.run)
// ===================================================================
```
new_string:
```javascript
    return { ok: true, appointment: best };
  } catch(e) {
    Logger.log('_getActiveAppointment error: ' + e);
    return { ok: false, error: 'server_error' };
  }
}

/* Returns the current ACTIVE (non-terminal) garage_request for the driver's
 * vehicle, used by the driver app at startup to reconcile a stale local widget.
 * Non-terminal statuses: pending, open, approved, appointment_set.
 * Terminal: closed, rejected, cancelled (and anything else).
 * Picks the most relevant: appointment_set > approved > pending/open, tie-break
 * newest timestamp. Returns { ok:true, active: {eventId, requestNumber, status,
 * appointmentDate, appointmentTime} | null }. */
function _driverGarageStatus(params) {
  try {
    var auth = _validateDriverToken(params.idToken);
    if (!auth.ok) return { ok: false, error: 'unauthorized' };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var authVehicleId = ''; var authVehicleNum = '';
    var vehList = _sheetToObjects(ss, CFG.SH.VEH);
    for (var vi = 0; vi < vehList.length; vi++) {
      if ((vehList[vi].email || '').toLowerCase().trim() === auth.email) {
        authVehicleId  = vehList[vi].id  || '';
        authVehicleNum = vehList[vi].num || '';
        break;
      }
    }
    if (!authVehicleId && !authVehicleNum) return { ok: false, error: 'no_vehicle_found' };
    var sheet = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
    if (!sheet) return { ok: true, active: null };
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var idIdx   = headers.indexOf('eventId');
    var stIdx   = headers.indexOf('status');
    var typeIdx = headers.indexOf('type');
    var vIdx    = headers.indexOf('vehicleId');
    var vnIdx   = headers.indexOf('vehicleNum');
    var dtIdx   = headers.indexOf('appointmentDate');
    var tmIdx   = headers.indexOf('appointmentTime');
    var tsIdx   = headers.indexOf('timestamp');
    var reqIdx  = headers.indexOf('requestNumber');
    /* higher rank = more relevant */
    var rank = { pending: 1, open: 1, approved: 2, appointment_set: 3 };
    var best = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][typeIdx] || '') !== 'garage_request') continue;
      var st = String(data[i][stIdx] || '');
      if (!rank.hasOwnProperty(st)) continue; /* skip terminal */
      var _vid  = String(data[i][vIdx]  || '');
      var _vnum = vnIdx >= 0 ? String(data[i][vnIdx] || '') : '';
      if (_vid !== authVehicleId && _vnum !== authVehicleNum) continue;
      var ts = tsIdx >= 0 ? String(data[i][tsIdx] || '') : '';
      var cand = { row: i, rank: rank[st], status: st, ts: ts };
      if (!best || cand.rank > best.rank || (cand.rank === best.rank && cand.ts > best.ts)) {
        best = cand;
      }
    }
    if (!best) return { ok: true, active: null };
    var r = best.row;
    var _dt = data[r][dtIdx];
    var _dtStr = (_dt instanceof Date)
      ? Utilities.formatDate(_dt, 'Asia/Jerusalem', 'yyyy-MM-dd')
      : String(_dt || '').replace(/\s.*/, '').split('T')[0];
    var _tmRaw = tmIdx >= 0 ? data[r][tmIdx] : '';
    var _tm = '';
    if (_tmRaw instanceof Date && !isNaN(_tmRaw.getTime())) {
      _tm = ('0'+_tmRaw.getHours()).slice(-2) + ':' + ('0'+_tmRaw.getMinutes()).slice(-2);
    } else if (_tmRaw) {
      var _tmm = String(_tmRaw).match(/(\d{1,2}):(\d{2})/);
      _tm = _tmm ? (('0'+_tmm[1]).slice(-2) + ':' + _tmm[2]) : '';
    }
    return { ok: true, active: {
      eventId:         String(data[r][idIdx] || ''),
      requestNumber:   _reqNumOrDerive(reqIdx >= 0 ? data[r][reqIdx] : '', String(data[r][idIdx] || '')),
      status:          best.status,
      appointmentDate: _dtStr,
      appointmentTime: _tm
    } };
  } catch(e) {
    Logger.log('_driverGarageStatus error: ' + e);
    return { ok: false, error: 'server_error' };
  }
}

// ===================================================================
// Garage Calendar - getAppointments (called via google.script.run)
// ===================================================================
```

### Step 5.2 — Register action in router

- [ ] **Edit** `code.js`. Add `driver_garage_status` to the `driverActions` array.

old_string:
```javascript
  'garage_request_action','garage_set_appointment','get_garage_status','save_garage_reminder','cancel_appointment','get_active_appointment'];
```
new_string:
```javascript
  'garage_request_action','garage_set_appointment','get_garage_status','save_garage_reminder','cancel_appointment','get_active_appointment','driver_garage_status'];
```

- [ ] **Edit** `code.js`. Add the dispatch branch alongside the other driver dispatches.

old_string:
```javascript
       else if (action === 'get_active_appointment')      result = _getActiveAppointment(params);
```
new_string:
```javascript
       else if (action === 'get_active_appointment')      result = _getActiveAppointment(params);
      else if (action === 'driver_garage_status')        result = _driverGarageStatus(params);
```

### Step 5.3 — Validate & commit

- [ ] Run: `node --check code.js` — Expected: no output.
- [ ] Run: `(Get-Content code.js).Count` — Expected: ≥ 18,443.
- [ ] Commit:
```bash
git add code.js
git commit -m "feat(garage): add driver_garage_status endpoint for reconciliation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 6: Reconciliation on driver app startup (app.js — additive)

**Files:**
- Modify: `driver/app.js:1224-1247` (`loadFullData`) — add reconciliation call
- Modify: `driver/app.js` — add new function `_reconcileGarageStatus` near `_syncActiveAppointmentFromGAS`

The safety net: after vehicle data loads, ask GAS for the current active garage_request. If the local `activeGarageAppointment.eventId` differs from the returned active eventId, OR if GAS returns no active row / a terminal status, clear the local widget.

### Step 6.1 — Add `_reconcileGarageStatus`

- [ ] **Edit** `app.js`. Insert immediately before `async function _syncActiveAppointmentFromGAS() {` (line 1249).

old_string:
```javascript
async function _syncActiveAppointmentFromGAS() {
```
new_string:
```javascript
/* Startup safety net: reconcile the locally-stored activeGarageAppointment
   against GAS's authoritative active garage_request. Fixes the stale widget
   bug where a cancelled/closed request still shows (#15) because a Firebase
   garageSync update was missed while offline. */
async function _reconcileGarageStatus() {
  try {
    var r = await gasPost('driver_garage_status', {}, { silent: true });
    if (!r || !r.ok) return; /* network/auth issue — don't touch local state */
    var active = r.active; /* {eventId, requestNumber, status, ...} | null */
    var local = null;
    try { local = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null'); } catch(_) {}
    if (!local || !local.eventId) return; /* nothing local to reconcile */

    var localEventId = String(local.eventId || '');
    var serverEventId = active ? String(active.eventId || '') : '';
    var TERMINAL = { closed: 1, rejected: 1, cancelled: 1 };
    var serverTerminal = active ? !!TERMINAL[String(active.status || '')] : true;

    /* Clear if: no active server row, server row is terminal, or eventIds differ */
    if (!active || serverTerminal || serverEventId !== localEventId) {
      try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
      if (typeof _fbClearActiveAppointment === 'function') _fbClearActiveAppointment();
      if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
      console.log('[reconcile] cleared stale activeGarageAppointment local=' + localEventId + ' server=' + serverEventId + ' status=' + (active && active.status));
    }
  } catch(_e) { /* swallow — reconciliation is best-effort */ }
}

async function _syncActiveAppointmentFromGAS() {
```

### Step 6.2 — Call it from `loadFullData`

- [ ] **Edit** `app.js`. Add the call after `_initFbGarageStatusSync()` and before `_syncActiveAppointmentFromGAS()` so reconciliation removes a stale widget before the GAS sync potentially re-confirms a genuine one.

old_string:
```javascript
  _initFbGarageStatusSync();
  // Reliable fallback: poll GAS for active appointment (bypasses Firebase garageSync)
  _syncActiveAppointmentFromGAS();
```
new_string:
```javascript
  _initFbGarageStatusSync();
  // Safety net: clear stale local widget if it no longer matches an active server request
  _reconcileGarageStatus();
  // Reliable fallback: poll GAS for active appointment (bypasses Firebase garageSync)
  _syncActiveAppointmentFromGAS();
```

### Step 6.3 — Validate & commit

- [ ] Run: `node --check app.js` — Expected: no output.
- [ ] Commit:
```bash
git add app.js
git commit -m "feat(driver): reconcile stale garage widget on startup via driver_garage_status

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 7: Fix `consumed` guard in garageSync cancelled handler (app.js — surgical)

**Files:**
- Modify: `driver/app.js:1327-1344` (the `cancelled` branch of the garageSync listener)

The current guard at line 1329 (`if (!data.consumed)`) means: if a previous session already marked the cancellation `consumed:true`, a device that missed it (offline) will NOT clear its local widget. Change the condition to clear whenever the cancelled event matches the locally-active appointment's eventId, regardless of `consumed`.

### Step 7.1 — Rewrite the cancelled branch

- [ ] **Edit** `app.js`.

old_string:
```javascript
      // ── מנהל ביטל תור פעיל — בדוק לפני consumed ──
      if (data.status === 'cancelled') {
        if (!data.consumed) {
          localStorage.removeItem('activeGarageAppointment');
          _fbClearActiveAppointment();
          if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
          // Cross-channel dedup: skip toast if FCM already showed this event
          var _cDupKey = _normGarageEventKey('cancelled', data.eventId);
          if (typeof showToast === 'function' && !_garageDedupSeen(_cDupKey)) {
            var _cToast = data.setBy === 'driver'
              ? '✅ התור בוטל' // driver cancelled - soft confirm on all devices
              : '❌ התור בוטל על ידי המנהל'; // admin or unknown setBy
            if (_cToast) showToast(_cToast);
          }
          snap.ref.update({ consumed: true, consumedAt: Date.now() });
        }
        return;
      }
```
new_string:
```javascript
      // ── מנהל ביטל תור פעיל — נקה תמיד אם ה-eventId תואם, ללא תלות ב-consumed ──
      // (מכשיר שהיה offline בעת הביטול עלול לראות consumed:true ועדיין להחזיק widget ישן)
      if (data.status === 'cancelled') {
        var _localCancelAppt = null;
        try { _localCancelAppt = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null'); } catch(_) {}
        var _localCancelEid = _localCancelAppt && _localCancelAppt.eventId ? String(_localCancelAppt.eventId) : '';
        if (_localCancelEid && _localCancelEid === String(data.eventId || '')) {
          localStorage.removeItem('activeGarageAppointment');
          _fbClearActiveAppointment();
          if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
        }
        // Toast only once across channels, only when we haven't already shown it
        var _cDupKey = _normGarageEventKey('cancelled', data.eventId);
        if (!data.consumed && typeof showToast === 'function' && !_garageDedupSeen(_cDupKey)) {
          var _cToast = data.setBy === 'driver'
            ? '✅ התור בוטל' // driver cancelled - soft confirm on all devices
            : '❌ התור בוטל על ידי המנהל'; // admin or unknown setBy
          if (_cToast) showToast(_cToast);
        }
        if (!data.consumed) snap.ref.update({ consumed: true, consumedAt: Date.now() });
        return;
      }
```

> Behaviour: clearing the local widget now happens whenever the cancelled eventId matches the local appointment, even if `consumed:true`. The toast and the `consumed` write still only fire once (guarded by `!data.consumed`), preserving dedup semantics.

### Step 7.2 — Validate & commit

- [ ] Run: `node --check app.js` — Expected: no output.
- [ ] Commit:
```bash
git add app.js
git commit -m "fix(driver): clear cancelled garage widget regardless of consumed flag

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 8: `standalone` parameter in `adminCreateAppointment` (code.js — additive)

**Files:**
- Modify: `code.js:17988` (signature)
- Modify: `code.js:18034-18058` (skip bestCandidate when standalone)
- Modify: `index.html:22815-22829` (`_gcSaveAppointment` — pass standalone)

When `standalone=true`, skip the `bestCandidate` search and the B2 driver-set fallback entirely, always creating a new `ADM-...` event. Default `false` keeps existing logic.

### Step 8.1 — Add `standalone` to signature

- [ ] **Edit** `code.js`.

old_string:
```javascript
function adminCreateAppointment(vehicleNum, appointmentDate, appointmentTime, reason, managerNote, sessionToken, force) {
  _requirePerm(sessionToken, 'garage', 'approve');
```
new_string:
```javascript
function adminCreateAppointment(vehicleNum, appointmentDate, appointmentTime, reason, managerNote, sessionToken, force, standalone) {
  _requirePerm(sessionToken, 'garage', 'approve');
  var _isStandalone = (standalone === true || standalone === 'true');
```

### Step 8.2 — Skip candidate search + B2 fallback when standalone

The `bestCandidate` loop runs `18035-18055` and sets `existingSheetRow`/`eventId` at `18057-18058`. We guard the loop. Then the B2 fallback (`18089-18125`) must also be skipped.

- [ ] **Edit** `code.js`. Guard the candidate loop. Wrap the `for` with the standalone check by replacing the loop's initialization line.

old_string:
```javascript
    var bestCandidate = null;
    for (var ei = 1; ei < evtData.length; ei++) {
      var evtVehId  = String(evtData[ei][eVehIdx]  || '').trim();
```
new_string:
```javascript
    var bestCandidate = null;
    for (var ei = 1; !_isStandalone && ei < evtData.length; ei++) {
      var evtVehId  = String(evtData[ei][eVehIdx]  || '').trim();
```

- [ ] **Edit** `code.js`. Guard the B2 fallback. It begins with `if (!force) {` at line 18089. Make it also require `!_isStandalone`.

old_string:
```javascript
    /* -- B2 fallback: scan for ANY driver-set appointment for this vehicle, regardless of date -- */
    if (!force) {
      var _b2_setByIdx = evtHdr.indexOf('appointmentSetBy');
```
new_string:
```javascript
    /* -- B2 fallback: scan for ANY driver-set appointment for this vehicle, regardless of date -- */
    if (!force && !_isStandalone) {
      var _b2_setByIdx = evtHdr.indexOf('appointmentSetBy');
```

> With `_isStandalone`, `bestCandidate` stays `null` → `existingSheetRow = -1` → the function falls into the `else` (new `ADM-` event) branch automatically. No further change to the create branch needed.

### Step 8.3 — Validate code.js & commit

- [ ] Run: `node --check code.js` — Expected: no output.
- [ ] Run: `(Get-Content code.js).Count` — Expected: ≥ 18,443.
- [ ] Commit:
```bash
git add code.js
git commit -m "feat(garage): add standalone param to adminCreateAppointment

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

> NOTE: The index.html wiring of `standalone` is done in Task 9 (it depends on the new selector deciding the path).

---

## Task 9: Multi-request selector in admin modal (index.html — surgical UI)

**Files:**
- Modify: `index.html:22408-22524` (`_gcShowAppointmentModal` — build & render selectable list)
- Modify: `index.html:22526-22545` (`_gcUpdatePendingInfo` — drive banner by selection)
- Modify: `index.html:22756-22829` (`_gcSaveAppointment` — route by selection incl. standalone)

Today `_gcApprovedByVehicle[vn]` keeps ONE best candidate per vehicle. We change to keep **all** non-terminal requests per vehicle, render a selectable list when a vehicle is chosen, plus a "standalone" option, and route the save accordingly.

### Step 9.1 — Build a per-vehicle ARRAY of open requests

Replace the single-best map with a map of arrays. Keep `_gcApprovedByVehicle` name (used elsewhere) but make each value an **array** sorted by relevance. Add a parallel flat lookup `_gcRequestByEventId` for save routing.

- [ ] **Edit** `index.html`. Replace the build loop.

old_string:
```javascript
  _gcApprovedByVehicle = {};
  if (requests && requests.length) {
    var prio = { pending: 0, open: 0, approved: 1, appointment_set: 2 };
    requests.forEach(function(r) {
      var vn = String(r.vehicleNum || '').trim();
      if (!vn) return;
      var st = r.status || '';
      /* Ignore terminal states for banner purposes */
      if (st === 'closed' || st === 'rejected' || st === 'cancelled') return;
      var existing = _gcApprovedByVehicle[vn];
      var rPrio = prio[st] !== undefined ? prio[st] : 99;
      var ePrio = existing ? (prio[existing.status] !== undefined ? prio[existing.status] : 99) : 99;
      var rTs   = String(r.timestamp || '');
      var eTs   = existing ? String(existing.ts || '') : '';
      var winsByPrio = rPrio < ePrio;
      var winsByTime = (rPrio === ePrio) && (rTs > eTs);
      if (!existing || winsByPrio || winsByTime) {
        var det = r.details || {};
        _gcApprovedByVehicle[vn] = {
          eventId:         r.eventId || r.id || '',
          driverName:      r.driverName || '',
          reason:          det.reasonLabel || det.reason || r.managerNotes || '',
          description:     det.description || '',
          garageName:      det.garageName || '',
          garageAddress:   det.garageAddress || '',
          km:              det.km || 0,
          kmToService:     det.kmToService != null ? det.kmToService : null,
          ts:              r.timestamp || '',
          createdAt:       r.createdAt || r.timestamp || '',
          approvedAt:      r.approvedAt || '',
          status:          st,
          appointmentDate: r.appointmentDate || '',
          appointmentTime: r.appointmentTime || '',
          managerNotes:    r.managerNotes || '',
          cancelCount:     Number(r.cancelCount || 0),
          appointmentSetBy: String(r.appointmentSetBy || ''),
          history:         Array.isArray(r.history) ? r.history : []
        };
      }
    });
  }
```
new_string:
```javascript
  /* Map vehicleNum -> ARRAY of all non-terminal requests (newest-relevant first).
     Also build a flat eventId -> request lookup for save routing. */
  _gcApprovedByVehicle = {};
  _gcRequestByEventId = {};
  if (requests && requests.length) {
    var prio = { pending: 0, open: 0, approved: 1, appointment_set: 2 };
    requests.forEach(function(r) {
      var vn = String(r.vehicleNum || '').trim();
      if (!vn) return;
      var st = r.status || '';
      if (st === 'closed' || st === 'rejected' || st === 'cancelled') return;
      var det = r.details || {};
      var entry = {
        eventId:         r.eventId || r.id || '',
        requestNumber:   (r.requestNumber !== undefined && r.requestNumber !== null && r.requestNumber !== '')
                           ? String(r.requestNumber)
                           : (function(){ var _m = String(r.eventId || r.id || '').match(/-(\d+)$/); return _m ? String(parseInt(_m[1], 10)) : ''; })(),
        driverName:      r.driverName || '',
        reason:          det.reasonLabel || det.reason || r.managerNotes || '',
        description:     det.description || '',
        garageName:      det.garageName || '',
        garageAddress:   det.garageAddress || '',
        km:              det.km || 0,
        kmToService:     det.kmToService != null ? det.kmToService : null,
        ts:              r.timestamp || '',
        createdAt:       r.createdAt || r.timestamp || '',
        approvedAt:      r.approvedAt || '',
        status:          st,
        appointmentDate: r.appointmentDate || '',
        appointmentTime: r.appointmentTime || '',
        managerNotes:    r.managerNotes || '',
        cancelCount:     Number(r.cancelCount || 0),
        appointmentSetBy: String(r.appointmentSetBy || ''),
        history:         Array.isArray(r.history) ? r.history : []
      };
      if (!_gcApprovedByVehicle[vn]) _gcApprovedByVehicle[vn] = [];
      _gcApprovedByVehicle[vn].push(entry);
      if (entry.eventId) _gcRequestByEventId[entry.eventId] = entry;
    });
    /* sort each vehicle's list: higher priority first, then newest timestamp */
    Object.keys(_gcApprovedByVehicle).forEach(function(vn) {
      _gcApprovedByVehicle[vn].sort(function(a, b) {
        var pa = prio[a.status] !== undefined ? prio[a.status] : 99;
        var pb = prio[b.status] !== undefined ? prio[b.status] : 99;
        if (pb !== pa) return pb - pa; /* higher prio first */
        return String(b.ts).localeCompare(String(a.ts)); /* newest first */
      });
    });
  }
```

### Step 9.2 — Declare the new globals

- [ ] **Edit** `index.html`. Next to the existing `_gcApprovedByVehicle` declaration (line 22004), add `_gcRequestByEventId` and a `_gcSelectedRequest` holder.

old_string:
```javascript
var _gcApprovedByVehicle = {};  // vehicleNum -> {eventId, reason, ts, driverName}
```
new_string:
```javascript
var _gcApprovedByVehicle = {};  // vehicleNum -> [ {eventId, requestNumber, status, ...}, ... ]
var _gcRequestByEventId  = {};  // eventId -> request entry (flat lookup for save routing)
var _gcSelectedRequest   = null; // currently chosen request entry, or null for standalone
```

### Step 9.3 — Render the request list in `_gcUpdatePendingInfo`

When a vehicle is selected, render a selectable list of its open requests plus a standalone option. Selecting an item shows the matching banner.

- [ ] **Edit** `index.html`. Replace the whole `_gcUpdatePendingInfo` function.

old_string:
```javascript
function _gcUpdatePendingInfo(val) {
  var el = document.getElementById('gcal-pending-info');
  if (!el) return;
  if (!val || val.indexOf('__veh__') !== 0) { el.innerHTML = ''; return; }
  var vn  = val.replace('__veh__', '');
  var req = _gcApprovedByVehicle[vn];
  if (!req) {
    /* No open garage request for this vehicle — show direct-appointment banner */
    el.innerHTML = _glbRenderDirectBanner(vn);
    return;
  }
  el.innerHTML = _glbRenderBanner(req);
  if (req.reason) {
    var chips = document.querySelectorAll('#gcal-reason-chips .gcal-reason-chip');
    chips.forEach(function(c) {
      c.classList.remove('grc-active');
      if (c.getAttribute('data-reason') === req.reason) c.classList.add('grc-active');
    });
  }
}
```
new_string:
```javascript
function _gcUpdatePendingInfo(val) {
  var el = document.getElementById('gcal-pending-info');
  if (!el) return;
  _gcSelectedRequest = null;
  if (!val || val.indexOf('__veh__') !== 0) { el.innerHTML = ''; return; }
  var vn   = val.replace('__veh__', '');
  var list = _gcApprovedByVehicle[vn] || [];

  /* Build selectable list: one row per open request + a standalone option */
  var STATUS_HE = { pending: 'ממתינה', open: 'פתוחה', approved: 'מאושרת', appointment_set: 'תור נקבע' };
  var itemsHtml = list.map(function(req, idx) {
    var rn   = req.requestNumber ? ('#' + _gcEsc(req.requestNumber)) : '';
    var dt   = req.appointmentDate
                 ? String(req.appointmentDate).split('-').reverse().join('/')
                 : (req.createdAt ? new Date(req.createdAt).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit' }) : '');
    var desc = req.reason || req.description || 'בקשת מוסך';
    var st   = STATUS_HE[req.status] || req.status || '';
    return '<div class="gcal-req-item" data-eid="' + _gcEsc(req.eventId) + '" onclick="_gcSelectRequest(this.getAttribute(\'data-eid\'))" ' +
           'style="cursor:pointer;border:1.5px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;gap:8px;align-items:center;justify-content:space-between">' +
           '<span style="font-weight:700;color:#0f3460">' + rn + ' · ' + _gcEsc(desc) + '</span>' +
           '<span style="font-size:11px;color:#64748b">' + _gcEsc(dt) + ' · ' + _gcEsc(st) + '</span>' +
           '</div>';
  }).join('');

  var standaloneHtml =
    '<div class="gcal-req-item gcal-req-standalone" data-eid="" onclick="_gcSelectRequest(\'\')" ' +
    'style="cursor:pointer;border:1.5px dashed #16a34a;border-radius:10px;padding:10px 12px;margin-bottom:8px;color:#15803d;font-weight:700">' +
    'תור עצמאי (ללא תקלה קיימת)' +
    '</div>';

  el.innerHTML =
    (list.length ? '<div style="font-size:12px;color:#64748b;margin:4px 0 6px">בקשות מוסך פתוחות לרכב זה:</div>' : '') +
    itemsHtml + standaloneHtml +
    '<div id="gcal-req-banner" style="margin-top:8px"></div>';

  /* Auto-select: if exactly one open request, select it; else standalone */
  if (list.length === 1) { _gcSelectRequest(list[0].eventId); }
  else { _gcSelectRequest(''); }
}

/* Selects a specific open request (by eventId) or standalone (eventId === ''). */
function _gcSelectRequest(eventId) {
  var banner = document.getElementById('gcal-req-banner');
  document.querySelectorAll('#gcal-pending-info .gcal-req-item').forEach(function(it) {
    var sel = it.getAttribute('data-eid') === eventId;
    it.style.boxShadow = sel ? '0 0 0 2px #0f3460 inset' : 'none';
  });
  if (!eventId) {
    _gcSelectedRequest = null;
    var selEl = document.getElementById('gcal-sel-request');
    var vn = selEl ? selEl.value.replace('__veh__', '') : '';
    if (banner) banner.innerHTML = _glbRenderDirectBanner(vn);
    return;
  }
  var req = _gcRequestByEventId[eventId] || null;
  _gcSelectedRequest = req;
  if (banner && req) banner.innerHTML = _glbRenderBanner(req);
  if (req && req.reason) {
    var chips = document.querySelectorAll('#gcal-reason-chips .gcal-reason-chip');
    chips.forEach(function(c) {
      c.classList.remove('grc-active');
      if (c.getAttribute('data-reason') === req.reason) c.classList.add('grc-active');
    });
  }
}
```

### Step 9.4 — Route the save by selection (incl. standalone) in `_gcSaveAppointment`

The pending-block at `22762-22769` reads `_gcApprovedByVehicle[entityId]` as an object — now it is an array. Update the pending-block to consult `_gcSelectedRequest`, and route: a selected request → `adminSetAppointment(eventId, ...)`; standalone → `adminCreateAppointment(..., standalone=true)`.

- [ ] **Edit** `index.html`. Replace the pending-block guard.

old_string:
```javascript
  /* Block save if vehicle has a pending-unapproved request */
  if (isDirectVeh) {
    var _pendingReq = _gcApprovedByVehicle && _gcApprovedByVehicle[entityId];
    if (_pendingReq && _pendingReq.status === 'pending') {
      _gcAlert('לא ניתן לקבוע תור — קיימת בקשת מוסך ממתינה לאישור עבור רכב זה');
      return;
    }
  }
```
new_string:
```javascript
  /* If a specific open request is selected, block when it is still pending */
  if (isDirectVeh && _gcSelectedRequest && _gcSelectedRequest.status === 'pending') {
    _gcAlert('לא ניתן לקבוע תור — בקשת מוסך זו עדיין ממתינה לאישור');
    return;
  }
```

- [ ] **Edit** `index.html`. Replace the routing block at the end of `_gcSaveAppointment`.

old_string:
```javascript
  if (isDirectVeh) {
    /* Vehicle selected directly from DB — create or update event */
    _gcSavePayload = { entityId: entityId, dateKey: dateKey, time: time, reason: reason, note: note, isDirectVeh: true };
    google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .adminCreateAppointment(entityId, dateKey, time, reason || '', note || '', APP_SESSION, false);
  } else {
    /* Existing event selected — update appointment date on it */
    _gcSavePayload = { entityId: entityId, dateKey: dateKey, time: time, reason: reason, note: note };
    google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .adminSetAppointment(entityId, dateKey, time, (reason ? reason + (note ? ' — ' + note : '') : note) || '', APP_SESSION, false);
  }
}
```
new_string:
```javascript
  if (isEdit) {
    /* Edit mode (existingEventId came in) — update that event directly */
    _gcSavePayload = { entityId: entityId, dateKey: dateKey, time: time, reason: reason, note: note };
    google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .adminSetAppointment(entityId, dateKey, time, (reason ? reason + (note ? ' — ' + note : '') : note) || '', APP_SESSION, false);
  } else if (_gcSelectedRequest && _gcSelectedRequest.eventId) {
    /* A specific open request was selected — set the appointment on it */
    _gcSavePayload = { entityId: _gcSelectedRequest.eventId, dateKey: dateKey, time: time, reason: reason, note: note };
    google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .adminSetAppointment(_gcSelectedRequest.eventId, dateKey, time, (reason ? reason + (note ? ' — ' + note : '') : note) || '', APP_SESSION, false);
  } else {
    /* Standalone: no existing request — always create a fresh ADM- event */
    _gcSavePayload = { entityId: entityId, dateKey: dateKey, time: time, reason: reason, note: note, standalone: true };
    google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .adminCreateAppointment(entityId, dateKey, time, reason || '', note || '', APP_SESSION, false, true);
  }
}
```

> NOTE: `isEdit` is in scope inside `_gcSaveAppointment`? Verify: `existingEventId` is the second param of `_gcSaveAppointment`. Define `var isEdit = !!existingEventId;` at the top of `_gcSaveAppointment`. Add it.

- [ ] **Edit** `index.html`. Add `isEdit` at the top of `_gcSaveAppointment`.

old_string:
```javascript
function _gcSaveAppointment(dateKey, existingEventId) {
  var selEl   = document.getElementById('gcal-sel-request');
  var rawId   = existingEventId || (selEl && selEl.value);
  var isDirectVeh = !!(rawId && rawId.indexOf('__veh__') === 0);
  var entityId    = isDirectVeh ? rawId.replace('__veh__', '') : rawId;
```
new_string:
```javascript
function _gcSaveAppointment(dateKey, existingEventId) {
  var isEdit  = !!existingEventId;
  var selEl   = document.getElementById('gcal-sel-request');
  var rawId   = existingEventId || (selEl && selEl.value);
  var isDirectVeh = !!(rawId && rawId.indexOf('__veh__') === 0);
  var entityId    = isDirectVeh ? rawId.replace('__veh__', '') : rawId;
```

### Step 9.5 — Reset `_gcSelectedRequest` when modal opens

- [ ] **Edit** `index.html`. At the top of `_gcShowAppointmentModal`, reset the selection so a stale value from a previous open can't leak.

old_string:
```javascript
function _gcShowAppointmentModal(dateKey, requests, existingEventId, existingTime, existingReason, existingNote, existingDriverName, existingVehicleNum) {
  var d     = new Date(dateKey + 'T00:00:00');
```
new_string:
```javascript
function _gcShowAppointmentModal(dateKey, requests, existingEventId, existingTime, existingReason, existingNote, existingDriverName, existingVehicleNum) {
  _gcSelectedRequest = null;
  var d     = new Date(dateKey + 'T00:00:00');
```

### Step 9.6 — String-escaping scan & commit

- [ ] Manually verify the new `onclick="_gcSelectRequest(this.getAttribute('data-eid'))"` and `onclick="_gcSelectRequest('')"` strings: the inner single quotes inside the double-quoted HTML attribute are produced by `\'` in the JS string literal — confirm each `\'` is present and balanced in the edited block. There are exactly four `\'` (two in the list item, two in standalone). Confirm count.
- [ ] Search the edited region for any `font-family:'` — none introduced.
- [ ] Commit:
```bash
git add index.html
git commit -m "feat(garage-ui): multi-request selector + standalone option in appointment modal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Then: `git rev-parse --short HEAD`

---

## Task 10: Deploy & Verify

**Files:** none modified — deploy + manual verification.

### Step 10.1 — Final integrity checks (GAS)

- [ ] Run: `node --check code.js` — Expected: no output.
- [ ] Run: `node --check app.js` (in `driver/`) — Expected: no output.
- [ ] Run: `(Get-Content code.js).Count` — Expected: ≥ 18,443.
- [ ] Run: `(Get-Content index.html).Count` — Expected: ≥ 23,044.

### Step 10.2 — Deploy GAS backend + UI

- [ ] From `13.4.26/`, run: `pwsh .\clasp-push.ps1`
  - Expected: integrity checks pass, `clasp push -f` succeeds, `clasp deploy --deploymentId AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP` runs, `.gas-integrity` updated.
  - Do NOT use `clasp push` directly. Do NOT pass `-Force` unless a deliberate shrink (not the case here).

### Step 10.3 — Deploy driver PWA

- [ ] Deploy `driver/app.js` per the driver-app deployment process used in this repo (the PWA is served from its own host; if there is a `driver/clasp-push.ps1` or equivalent, use it; otherwise commit + push to the hosting branch). Confirm `node --check app.js` passed in 10.1 before deploying.

### Step 10.4 — Manual verification matrix

- [ ] **New driver request numbering:** As a driver, submit two `garage_request` reports for the same vehicle. Confirm in the sheet that the `requestNumber` column shows `1` then `2` (per-vehicle sequential), and the EVENT email/Firebase carry the same number.
- [ ] **Admin approve shows real number:** In admin UI, approve the first request. Confirm the FCM/toast shows `#1` (matching the column, not the eventId trailing integer).
- [ ] **Multi-request selector:** Create two open requests for one vehicle. Open the appointment modal, select that vehicle. Confirm BOTH requests appear as `#n · תאריך · תיאור · סטטוס`, plus the "תור עצמאי (ללא תקלה קיימת)" option. Select each → confirm the matching `_glbRenderBanner` / `_glbRenderDirectBanner` renders.
- [ ] **Standalone path:** Select "תור עצמאי", set a time, save. Confirm a NEW `ADM-...` event is created (not attached to either open request) with its own `requestNumber`.
- [ ] **Set on selected request:** Select request `#1`, save. Confirm `adminSetAppointment` updated that exact event (status `appointment_set`), and `#2` remains untouched.
- [ ] **Reconciliation safety net:** On a driver device, manually set a stale `activeGarageAppointment` in localStorage with an eventId that is now cancelled/closed server-side. Reload the app. Confirm `_reconcileGarageStatus` clears the widget on startup.
- [ ] **consumed-flag fix:** Cancel an active appointment from admin while the driver device is offline (so it misses the listener and the node is later `consumed:true`). Bring the device online. Confirm the listener now clears the local widget despite `consumed:true` because the eventId matches.
- [ ] **Legacy rows:** Confirm an old request row (blank `requestNumber` column) still displays a number via the regex fallback in `_reqNumOrDerive`.

### Step 10.5 — Final commit (if any verification fixes were needed)

- [ ] If verification surfaced fixes, commit them with a descriptive message ending in the Co-Authored-By line, then `git rev-parse --short HEAD`. Otherwise no commit needed.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Feature 1 (requestNumber real field + per-vehicle counter + remove derivations): Tasks 1, 2, 3, 4. ✓
- Feature 2 (multi-request selector + standalone option + banner routing): Task 9. ✓
- Feature 3 (`standalone` param in `adminCreateAppointment`): Task 8 (backend) + Task 9.4 (wiring). ✓
- Feature 4 (reconciliation on startup via new `driver_garage_status`): Task 5 (endpoint) + Task 6 (call). ✓
- Feature 5 (consumed-flag guard fix): Task 7. ✓

**Type/name consistency:** `_gcApprovedByVehicle` changed from object→array of entries; all consumers updated (build loop 9.1, `_gcUpdatePendingInfo` 9.3, `_gcSaveAppointment` pending-block 9.4). New globals `_gcRequestByEventId`, `_gcSelectedRequest` declared in 9.2. New GAS helpers `_reqNumOrDerive` and `_nextVehicleRequestNumber` defined before first use (Tasks 2.1, 1.2). `adminCreateAppointment` 7th param `force` preserved; `standalone` added as 8th — index.html call passes 8 positional args matching. `_firebaseSyncAdminAppointment` 7th param `requestNumber` already existed; only `adminCreateAppointment` now passes it.

**Placeholder scan:** No TBD/TODO; every code step contains full code. Counter strategy is concrete (max+1 with legacy fallback). Banner functions reused, not re-described.

**Known caveat surfaced for the executor:** the `_gcApprovedByVehicle` array migration must be applied atomically with all three consumer edits in Task 9 — do not deploy index.html between 9.1 and 9.4.
