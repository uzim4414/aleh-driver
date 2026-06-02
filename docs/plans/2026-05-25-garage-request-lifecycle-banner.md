# Garage Request Lifecycle Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal "approved request" yellow banner inside the admin Google-Calendar appointment modal with a rich, timeline-driven lifecycle card that exposes the driver's fault description, full history of status transitions, staleness/repeat-cancellation warnings, and a distinct "pending" variant — backed by a new `history` JSON column persisted on every status change in `FIELD_EVENTS`.

**Architecture:** A new `history` array column is added to the `FIELD_EVENTS` Google Sheet. Every server-side function that mutates a garage request status (`_garageRequestAction`, `_garageSetAppointment`, `_cancelAppointment`, plus admin approve/reject/close paths) appends a typed entry to that array. `getGarageRequests` is widened to return the new history plus all detail fields. The admin client builds `_gcApprovedByVehicle` from the richer payload (with corrected priority/tie-break) and `_gcUpdatePendingInfo` renders one of three banner variants: `pending`, `approved`, or `appointment_set` — each a self-contained timeline card with derived staleness and repeat-cancel badges.

**Tech Stack:** Google Apps Script (server, `code.js`), embedded HTML/JS admin UI (`index.html`), Driver PWA (`driver/app.js`), Google Sheets persistence, Firebase Realtime DB sync, Python `bytes.replace()` for code.js patching, clasp push for deploy.

---

## Pre-flight Context

**Repo roots (absolute paths):**
- GAS server:   `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- GAS admin UI: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html`
- GAS clasp dir: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\`
- Driver PWA:   `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js`
- Plan output:  `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\plans\2026-05-25-garage-request-lifecycle-banner.md`
- QA output:    `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\qa\2026-05-25-garage-lifecycle-banner-qa.md`
- Backup script: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\backup.py`

**Critical constraints (project-wide rules — violating any of these will break the deploy or corrupt data):**
1. **Always run `backup.py` before any Python script that mutates files.** Verify the backup is `> 0 bytes` before proceeding.
2. **Use Python `bytes.replace()` ONLY** to edit `code.js`. PowerShell `-replace` corrupts large files (UTF-8 BOM, very long lines, embedded base64 PDFs). Open as `'rb'`, replace bytes, write `'wb'`.
3. **GAS column writes must align to the actual sheet header order** read at runtime. Never assume positional indices from the JS array — always look up by `headers.indexOf(colName)` and write `row[idx]`.
4. **All UI text in Hebrew.**
5. **No browser popups** (`confirm()`/`alert()`/`prompt()` are forbidden) — use the in-app `_gcAlert()` modal or the toast system.
6. **GAS `appsscript.json`** — before any `clasp push` that changes `appsscript.json`, read the remote copy first and preserve `webapp.access = "ANYONE_ANONYMOUS"`. Never write `"ANYONE"` (causes login wall).
7. **Date serialization** — Date columns must be ISO strings (`new Date().toISOString()`); never coerce to `String(new Date())`.
8. **`git commit` after every task** (every working green step) — the project rule.
9. **JS string escaping** — before any `clasp push`, scan changed JS regions for unescaped inner quotes in `font-family:'...'` and `onclick="...'..."` constructs. This bug has bitten the project twice.

**Sheet name:** `CFG.SH.FIELD_EVENTS` resolves to `'אירועי_שטח'` (Hebrew). Always reference via the constant, never the literal.

**Current column order in `FIELD_EVENTS_COLS` (code.js lines 137-141):**
```
['eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
 'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
 'approvedAt','appointmentDate','appointmentTime','reminderSentAt']
```

**Known runtime functions referenced by the admin client but possibly not present as plain `function X(){}` defs in the local `code.js` (the file uses several definition styles plus `eval`-style assembly via patch scripts):**
- `getGarageRequests(sessionToken)` — returns parsed FIELD_EVENTS rows for the calendar view.
- `getAppointments(sessionToken)` — same data, filtered for items that have an appointmentDate.
- `saveCalendarAppointment(payload, sessionToken)` — creates/updates appointment_set rows.
- `_garageRequestAction(params)` — driver-side handler (approve/cancel/etc by `requestAction`).
- `_garageSetAppointment(params)` — driver-side set/update appointment.
- `_cancelAppointment(params)` — driver-side appointment cancellation.

If `grep --text -an "function getGarageRequests"` returns no match, the function may live inside a minified line or simply needs to be **created** by this plan. Each affected task below specifies "add if missing".

---

## File Structure

| File | Change |
|------|--------|
| `13.4.26/code.js` | (1) Add `'history','cancelCount'` to `FIELD_EVENTS_COLS`. (2) Add `_appendFieldEventHistory()` helper. (3) Modify all status-mutating functions to call it. (4) Widen `getGarageRequests` to return new fields. |
| `13.4.26/index.html` | (1) Extend `_gcApprovedByVehicle` to carry history + details. (2) Fix priority `appointment_set > approved` + tie-break by `timestamp`. (3) Rewrite `_gcUpdatePendingInfo` to render the three-variant timeline card. (4) Append new CSS block for the banner. |
| `driver/app.js` | No behavior change required; verify the driver send still works after history is added. |
| `driver/docs/qa/2026-05-25-garage-lifecycle-banner-qa.md` | New QA doc per project rule. |
| `13.4.26/patch_lifecycle_banner.py` | New Python patcher (uses `bytes.replace`) for the larger code.js edits. |

---

## Task 1: Backup + add `history` and `cancelCount` columns to FIELD_EVENTS schema

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js:137-141`
- Run:    `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\backup.py`

- [ ] **Step 1: Backup**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
python backup.py
```

Expected: prints a path to a `.bak` file. Confirm it exists and is `> 0 bytes`:

```powershell
Get-Item "code.js.bak.*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Format-List FullName, Length
```

If `Length` is 0 or no file appears — STOP. Do not proceed.

- [ ] **Step 2: Edit `FIELD_EVENTS_COLS`**

In `code.js` find the block (currently lines 137-141):

```javascript
var FIELD_EVENTS_COLS = [
  'eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
  'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
  'approvedAt','appointmentDate','appointmentTime','reminderSentAt'
];
```

Replace with:

```javascript
var FIELD_EVENTS_COLS = [
  'eventId','vehicleId','vehicleNum','driverId','driverName','driverEmail',
  'type','timestamp','lat','lng','details','status','managerNotes','createdAt',
  'approvedAt','appointmentDate','appointmentTime','reminderSentAt',
  'history','cancelCount'
];
```

Use the `Edit` tool (small, safe edit — no need for Python here).

- [ ] **Step 3: Run migration in GAS**

In the GAS editor (`script.google.com`) open the project and from the function dropdown choose `migrateSheets` and click Run. This invokes the existing `_addMissingCols` helper (code.js:247) which is safe for existing rows — it appends the new columns at the end with empty values.

Expected: Apps Script execution log shows `FIELD_EVENTS: הוספו: history, cancelCount`.

- [ ] **Step 4: Verify columns appear in the sheet**

Open the bound spreadsheet, switch to the `אירועי_שטח` tab, scroll right — confirm `history` and `cancelCount` headers are present, bold, dark-blue background.

- [ ] **Step 5: Commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add code.js
git commit -m "feat(garage): add history + cancelCount columns to FIELD_EVENTS schema"
```

---

## Task 2: Add `_appendFieldEventHistory` server helper

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js` — insert immediately after the existing `_addMissingCols` function (around line 264).

This helper is the single chokepoint that every status mutation will call. Centralising it guarantees the column-order-by-header rule (constraint #3) is honoured in exactly one place.

- [ ] **Step 1: Insert helper**

Find this line in `code.js` (around line 264):

```javascript
  return added.length ? ('הוספו: ' + added.join(', ')) : 'אין שינוי';
}
```

Immediately AFTER its closing `}` insert the following block:

```javascript

/* ── Append a history entry to a FIELD_EVENTS row by eventId. ────────────
 * entry: {action, by?, note?, appointmentDate?, appointmentTime?, ...}
 * - Always writes "at" as ISO string (Asia/Jerusalem clock, UTC value).
 * - Reads existing `history` JSON, appends, writes back.
 * - For action === 'cancelled_by_driver' also bumps `cancelCount`.
 * - Uses header-lookup writes (NOT positional) per project rule.
 * - Returns {ok:true, eventId, historyLen, cancelCount} or {ok:false, error}.
 */
function _appendFieldEventHistory(eventId, entry) {
  if (!eventId) return { ok:false, error:'missing eventId' };
  if (!entry || !entry.action) return { ok:false, error:'missing entry.action' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  if (!sh) return { ok:false, error:'sheet missing' };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:false, error:'sheet empty' };
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var idIdx       = headers.indexOf('eventId');
  var historyIdx  = headers.indexOf('history');
  var cancelIdx   = headers.indexOf('cancelCount');
  if (idIdx < 0)      return { ok:false, error:'eventId col missing' };
  if (historyIdx < 0) return { ok:false, error:'history col missing — run migrateSheets()' };
  // Locate row
  var ids = sh.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(eventId)) { rowNum = i + 2; break; }
  }
  if (rowNum < 0) return { ok:false, error:'eventId not found: ' + eventId };
  // Read & parse current history
  var raw = sh.getRange(rowNum, historyIdx + 1).getValue();
  var arr = [];
  if (raw) {
    try { arr = JSON.parse(String(raw)); if (!Array.isArray(arr)) arr = []; }
    catch(e) { arr = []; }
  }
  // Build entry (force ISO `at`)
  var newEntry = {};
  Object.keys(entry).forEach(function(k){ newEntry[k] = entry[k]; });
  newEntry.action = String(entry.action);
  newEntry.at = entry.at ? String(entry.at) : new Date().toISOString();
  arr.push(newEntry);
  // Write history back
  sh.getRange(rowNum, historyIdx + 1).setValue(JSON.stringify(arr));
  // Bump cancelCount on cancellation actions
  var newCancelCount = null;
  if (cancelIdx >= 0 && (entry.action === 'cancelled_by_driver' || entry.action === 'cancelled_by_admin')) {
    var curr = parseInt(sh.getRange(rowNum, cancelIdx + 1).getValue(), 10);
    if (isNaN(curr)) curr = 0;
    newCancelCount = curr + 1;
    sh.getRange(rowNum, cancelIdx + 1).setValue(newCancelCount);
  }
  SpreadsheetApp.flush();
  return { ok:true, eventId: eventId, historyLen: arr.length, cancelCount: newCancelCount };
}
```

- [ ] **Step 2: Add test harness function (manual smoke test from GAS editor)**

Immediately after `_appendFieldEventHistory` insert:

```javascript
/* Manual smoke test — open GAS editor, pick _test_appendHistory, Run. */
function _test_appendHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  if (!sh || sh.getLastRow() < 2) { Logger.log('no rows'); return; }
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var idIdx = headers.indexOf('eventId');
  var firstId = sh.getRange(2, idIdx + 1).getValue();
  Logger.log('Testing eventId=' + firstId);
  var r1 = _appendFieldEventHistory(firstId, { action:'_test', note:'smoke' });
  Logger.log('result: ' + JSON.stringify(r1));
  // Read it back to confirm
  var historyIdx = headers.indexOf('history');
  Logger.log('history now: ' + sh.getRange(2, historyIdx + 1).getValue());
}
```

- [ ] **Step 3: clasp push + run test**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
clasp push
```

Expected: `Pushed N files.` with no errors.

In the GAS editor, select `_test_appendHistory`, Run. Open the execution log (`View → Logs` or `Ctrl+Enter`).

Expected log entries:
```
Testing eventId=EVT-...
result: {"ok":true,"eventId":"EVT-...","historyLen":1,"cancelCount":null}
history now: [{"action":"_test","note":"smoke","at":"2026-..."}]
```

If `"history col missing"` appears — Task 1 Step 3 wasn't run; run `migrateSheets` first.

- [ ] **Step 4: Clean the test entry**

Open the sheet, find the test row (eventId from log), and clear its `history` cell manually. Then in code.js delete the `_test_appendHistory` function (it served its purpose).

- [ ] **Step 5: Commit**

```powershell
git add code.js
git commit -m "feat(garage): add _appendFieldEventHistory helper with header-lookup writes"
```

---

## Task 3: Hook history into every status-mutation path (server)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- Create: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\patch_lifecycle_history.py`

Because the dispatcher (code.js:4625-4627) calls `_garageRequestAction`, `_garageSetAppointment`, and `_cancelAppointment` but these functions may not be defined as plain top-level `function X(){}` in the local file (they may be inside minified lines or absent), we adopt a **wrapper strategy**: define wrapper functions at the top of `code.js` that (a) call `_appendFieldEventHistory` first, then (b) delegate to the original (or implement the missing logic). If a function does exist as plain definition, we instead edit it directly.

- [ ] **Step 1: Detect what exists**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
python -c "import re; src=open('code.js','rb').read().decode('utf-8'); names=['_garageRequestAction','_garageSetAppointment','_cancelAppointment','approveGarageRequest','rejectGarageRequest','closeGarageRequest','getGarageRequests','saveCalendarAppointment']; [print(n, '->', 'defined' if re.search(r'function\\s+'+re.escape(n)+r'\\s*\\(', src) else 'MISSING') for n in names]"
```

Record which functions are `MISSING`. The remaining steps in this task split by the two cases.

- [ ] **Step 2: For any MISSING function, add a complete implementation**

Use the patcher script. Create `patch_lifecycle_history.py`:

```python
# patch_lifecycle_history.py
# Adds missing garage status handlers and wires _appendFieldEventHistory into existing ones.
# RUN backup.py FIRST.

import re, sys, os
SRC = 'code.js'
assert os.path.exists(SRC), 'run from 13.4.26 dir'
with open(SRC, 'rb') as f:
    data = f.read()
src = data.decode('utf-8')

# === Block to append to end of file: full implementations for missing handlers ===
APPEND = r'''

/* ══════════════════════════════════════════════════════════════
   Garage lifecycle handlers (lifecycle-banner plan, 2026-05-25)
   These are no-ops if a function with the same name already exists
   earlier in the file — the later definition silently wins in GAS
   so we intentionally re-declare to guarantee history hooks.
══════════════════════════════════════════════════════════════ */

function _gl_findRow_(sh, eventId) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { row:-1, headers:[] };
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var idIdx = headers.indexOf('eventId');
  if (idIdx < 0) return { row:-1, headers:headers };
  var ids = sh.getRange(2, idIdx+1, lastRow-1, 1).getValues();
  for (var i=0; i<ids.length; i++) {
    if (String(ids[i][0]) === String(eventId)) return { row:i+2, headers:headers };
  }
  return { row:-1, headers:headers };
}

function _gl_setCellByName_(sh, row, headers, name, value) {
  var idx = headers.indexOf(name);
  if (idx < 0) return false;
  sh.getRange(row, idx+1).setValue(value);
  return true;
}

function _gl_getCellByName_(sh, row, headers, name) {
  var idx = headers.indexOf(name);
  if (idx < 0) return '';
  return sh.getRange(row, idx+1).getValue();
}

/** Driver PWA: approve / cancel pending request, etc. */
function _garageRequestAction(params) {
  var eventId = params && params.eventId;
  var act     = params && params.requestAction;
  if (!eventId || !act) return { ok:false, error:'missing eventId/requestAction' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  var driver = '';
  try { driver = String(_gl_getCellByName_(sh, f.row, f.headers, 'driverName') || ''); } catch(e) {}
  if (act === 'cancel') {
    _gl_setCellByName_(sh, f.row, f.headers, 'status', 'cancelled');
    _appendFieldEventHistory(eventId, { action:'cancelled_by_driver', by: driver });
    try { _firebaseSyncGarageStatus(_gl_getCellByName_(sh, f.row, f.headers, 'vehicleId'), 'cancel', eventId); } catch(e) {}
    return { ok:true };
  }
  return { ok:false, error:'unknown requestAction: ' + act };
}

/** Driver PWA: set or update an appointment for an approved request. */
function _garageSetAppointment(params) {
  var eventId = params && params.eventId;
  var date    = params && params.appointmentDate;
  var time    = params && (params.appointmentTime || '09:00');
  if (!eventId || !date) return { ok:false, error:'missing eventId/appointmentDate' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  _gl_setCellByName_(sh, f.row, f.headers, 'appointmentDate', String(date));
  _gl_setCellByName_(sh, f.row, f.headers, 'appointmentTime', String(time));
  _gl_setCellByName_(sh, f.row, f.headers, 'status', 'appointment_set');
  _appendFieldEventHistory(eventId, {
    action:'appointment_set',
    appointmentDate: String(date),
    appointmentTime: String(time),
    by: 'driver'
  });
  try { _firebaseSyncGarageStatus(_gl_getCellByName_(sh, f.row, f.headers, 'vehicleId'), 'set_appointment', eventId); } catch(e) {}
  return { ok:true };
}

/** Driver PWA: cancel an existing appointment, revert to 'approved'. */
function _cancelAppointment(params) {
  var eventId = params && params.eventId;
  if (!eventId) return { ok:false, error:'missing eventId' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  _gl_setCellByName_(sh, f.row, f.headers, 'appointmentDate', '');
  _gl_setCellByName_(sh, f.row, f.headers, 'appointmentTime', '');
  _gl_setCellByName_(sh, f.row, f.headers, 'status', 'approved');
  _appendFieldEventHistory(eventId, { action:'cancelled_by_driver', by:'driver' });
  try { _firebaseSyncGarageStatus(_gl_getCellByName_(sh, f.row, f.headers, 'vehicleId'), 'cancel_appointment', eventId); } catch(e) {}
  return { ok:true };
}

/** Admin: approve a pending garage request. */
function approveGarageRequest(eventId, managerNote, sessionToken) {
  try { _requirePerm(sessionToken, 'garage', 'approve'); } catch(e) { return { ok:false, error:'unauthorized' }; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  var who = '';
  try { who = Session.getActiveUser().getEmail() || 'admin'; } catch(e) { who = 'admin'; }
  _gl_setCellByName_(sh, f.row, f.headers, 'status', 'approved');
  _gl_setCellByName_(sh, f.row, f.headers, 'approvedAt', new Date().toISOString());
  if (managerNote) _gl_setCellByName_(sh, f.row, f.headers, 'managerNotes', managerNote);
  _appendFieldEventHistory(eventId, { action:'approved', by:who, note: managerNote || '' });
  return { ok:true };
}

/** Admin: reject a pending garage request. */
function rejectGarageRequest(eventId, managerNote, sessionToken) {
  try { _requirePerm(sessionToken, 'garage', 'approve'); } catch(e) { return { ok:false, error:'unauthorized' }; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  var who = '';
  try { who = Session.getActiveUser().getEmail() || 'admin'; } catch(e) { who = 'admin'; }
  _gl_setCellByName_(sh, f.row, f.headers, 'status', 'rejected');
  if (managerNote) _gl_setCellByName_(sh, f.row, f.headers, 'managerNotes', managerNote);
  _appendFieldEventHistory(eventId, { action:'rejected', by:who, note: managerNote || '' });
  return { ok:true };
}

/** Admin: mark request closed (e.g. after garage visit reconciled). */
function closeGarageRequest(eventId, sessionToken) {
  try { _requirePerm(sessionToken, 'garage', 'approve'); } catch(e) { return { ok:false, error:'unauthorized' }; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
  var f  = _gl_findRow_(sh, eventId);
  if (f.row < 0) return { ok:false, error:'eventId not found' };
  var who = '';
  try { who = Session.getActiveUser().getEmail() || 'admin'; } catch(e) { who = 'admin'; }
  _gl_setCellByName_(sh, f.row, f.headers, 'status', 'closed');
  _appendFieldEventHistory(eventId, { action:'closed', by:who });
  return { ok:true };
}
'''

MARK = b'/* Garage lifecycle handlers (lifecycle-banner plan, 2026-05-25) */'
if MARK in data:
    print('SKIP: handlers already injected')
else:
    data2 = data + APPEND.encode('utf-8')
    with open(SRC, 'wb') as f:
        f.write(data2)
    print('OK: appended', len(APPEND), 'bytes')
```

Run the backup first, then run the patcher:

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
python backup.py
Get-Item "code.js.bak.*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Format-List FullName, Length
python patch_lifecycle_history.py
```

Expected: `OK: appended N bytes` (or `SKIP: handlers already injected` on a re-run).

- [ ] **Step 3: For functions that DID exist (per Step 1 detection), add history call**

If Step 1 reported `_garageRequestAction -> defined` (etc.) the wrappers we just appended **shadow** the earlier definitions (later top-level `function X(){}` wins in V8 GAS). That's intentional — our wrappers are the canonical implementation now.

If, however, the function shadowing causes side-effects you need to preserve (e.g. an earlier `_garageRequestAction` also sent an email), copy that side-effect logic into the wrapper. Inspect by:

```powershell
python -c "import re; src=open('code.js','rb').read().decode('utf-8'); m=re.search(r'function\\s+_garageRequestAction\\s*\\(.*?\\n\\}', src, re.S); print(m.group(0)[:2000] if m else 'none')"
```

Repeat for each name. Merge any extra logic (emails, Firebase syncs) into the wrapper body and re-push.

- [ ] **Step 4: clasp push and smoke-test each action**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
clasp push
```

Then in the GAS editor, from the function dropdown, manually test each:
1. `approveGarageRequest('EVT-EXISTING-ID','בדיקה ידנית','SESSION-TOKEN')` — paste a real eventId and your own session token captured from the admin UI's `APP_SESSION` global.
2. After each call, open the sheet and verify `history` for that row grew by one entry with the expected `action`.

Document each call + observed result in the QA log (Task 7).

- [ ] **Step 5: Commit**

```powershell
git add code.js patch_lifecycle_history.py
git commit -m "feat(garage): wire history append into all status-mutating server handlers"
```

---

## Task 4: Widen `getGarageRequests` server payload

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`

The admin UI calls `google.script.run.getGarageRequests(APP_SESSION)`. If it exists, locate it; if not, add the canonical implementation below. Either way, the **returned shape** must be the JSON-stringified array of:

```javascript
{
  eventId, vehicleId, vehicleNum, driverId, driverName, driverEmail,
  type, timestamp, status, managerNotes, createdAt,
  approvedAt, appointmentDate, appointmentTime,
  cancelCount: Number,            // NEW
  history: Array<HistoryEntry>,   // NEW
  details: {                      // NEW (parsed from the `details` column)
    description, reason, reasonLabel, garageName, garageAddress,
    km, kmToService, licensePlate
  }
}
```

- [ ] **Step 1: Detect existing definition**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
python -c "import re; src=open('code.js','rb').read().decode('utf-8'); m=re.search(r'function\\s+getGarageRequests\\s*\\(.*?\\n\\}', src, re.S); print('FOUND len='+str(len(m.group(0))) if m else 'MISSING')"
```

- [ ] **Step 2: If MISSING, append canonical implementation**

Append to the end of `code.js`:

```javascript

function getGarageRequests(sessionToken) {
  try { _requirePerm(sessionToken, 'garage', 'read'); }
  catch(e) { return JSON.stringify({ ok:false, error:'unauthorized' }); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = _sheetToObjects(ss, CFG.SH.FIELD_EVENTS) || [];
  var out = [];
  for (var i=0; i<rows.length; i++) {
    var r = rows[i];
    if (String(r.type) !== 'garage_request') continue;
    var det = {};
    try { det = r.details ? JSON.parse(String(r.details)) : {}; } catch(e) { det = {}; }
    var hist = [];
    try { hist = r.history ? JSON.parse(String(r.history)) : []; if (!Array.isArray(hist)) hist=[]; } catch(e) { hist = []; }
    out.push({
      eventId:          r.eventId || '',
      vehicleId:        r.vehicleId || '',
      vehicleNum:       r.vehicleNum || '',
      driverId:         r.driverId || '',
      driverName:       r.driverName || '',
      driverEmail:      r.driverEmail || '',
      type:             r.type || '',
      timestamp:        r.timestamp || '',
      status:           r.status || '',
      managerNotes:     r.managerNotes || '',
      createdAt:        r.createdAt || '',
      approvedAt:       r.approvedAt || '',
      appointmentDate:  r.appointmentDate || '',
      appointmentTime:  r.appointmentTime || '',
      cancelCount:      Number(r.cancelCount || 0),
      history:          hist,
      details: {
        description:   det.description   || '',
        reason:        det.reason        || '',
        reasonLabel:   det.reasonLabel   || '',
        garageName:    det.garageName    || '',
        garageAddress: det.garageAddress || '',
        km:            det.km            || 0,
        kmToService:   det.kmToService   != null ? det.kmToService : null,
        licensePlate:  det.licensePlate  || r.vehicleNum || ''
      }
    });
  }
  return JSON.stringify(out);
}
```

- [ ] **Step 3: If FOUND, patch it**

If Step 1 reported FOUND, you must extend the existing returned object literal to include the three new fields. Use this Python patcher (`patch_get_garage_requests.py`):

```python
# patch_get_garage_requests.py
import re
with open('code.js','rb') as f: data=f.read()
src = data.decode('utf-8')
m = re.search(r'function\s+getGarageRequests\s*\(.*?\n\}', src, re.S)
assert m, 'getGarageRequests not found — use the append path'
body = m.group(0)
# Heuristic: every push({...}) inside that body — extend the object
# Easier path: REPLACE the entire body wholesale.
canonical = open('canonical_getGarageRequests.snippet','r',encoding='utf-8').read()
new_src = src.replace(body, canonical)
with open('code.js','wb') as f: f.write(new_src.encode('utf-8'))
print('OK: replaced body, delta=', len(new_src)-len(src))
```

Save the canonical implementation from Step 2 (without the leading blank line) as `canonical_getGarageRequests.snippet`, run `python backup.py`, then `python patch_get_garage_requests.py`.

- [ ] **Step 4: clasp push, then verify from admin UI browser console**

```powershell
clasp push
```

Open the admin web app in Chrome, open DevTools console, paste:

```javascript
google.script.run.withSuccessHandler(function(s){ var a=JSON.parse(s); console.log('rows', a.length, 'sample', a[0]); }).getGarageRequests(APP_SESSION);
```

Expected: `rows N` and `sample` shows an object containing `history: []`, `cancelCount: 0`, and `details: { description: ..., ... }`.

- [ ] **Step 5: Commit**

```powershell
git add code.js patch_get_garage_requests.py canonical_getGarageRequests.snippet
git commit -m "feat(garage): widen getGarageRequests to include history, cancelCount, details"
```

---

## Task 5: Update `_gcApprovedByVehicle` client data structure + fix priority

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html:22012-22034`

The current code (already inspected) has two bugs:
- **Priority is backwards**: `var prio = { approved: 0, appointment_set: 1 };` — currently treats `approved` as higher-priority than `appointment_set`. The spec requires the opposite (an already-scheduled appointment is the most actionable state to surface).
- **No tie-break**: when two requests for the same vehicle share priority, the last one in iteration order wins instead of the most recent by `timestamp`.

- [ ] **Step 1: Replace the block**

Find this block in `index.html` (lines 22011-22034):

```javascript
  /* Build open-requests map by vehicleNum — includes approved + appointment_set */
  _gcApprovedByVehicle = {};
  if (requests && requests.length) {
    /* Priority: approved > appointment_set (show most actionable state) */
    var prio = { approved: 0, appointment_set: 1 };
    requests.forEach(function(r) {
      var vn = String(r.vehicleNum || '').trim();
      if (!vn) return;
      var existing = _gcApprovedByVehicle[vn];
      var rPrio = prio[r.status] !== undefined ? prio[r.status] : 99;
      var ePrio = existing ? (prio[existing.status] !== undefined ? prio[existing.status] : 99) : 99;
      if (!existing || rPrio < ePrio) {
        var det = r.details || {};
        _gcApprovedByVehicle[vn] = {
          eventId:         r.eventId || r.id || '',
          driverName:      r.driverName || '',
          reason:          det.reason || det.reasonLabel || r.managerNote || '',
          ts:              r.timestamp || '',
          status:          r.status || '',
          appointmentDate: r.appointmentDate || ''
        };
      }
    });
  }
```

Replace with:

```javascript
  /* Build latest-request map by vehicleNum.
   * Priority (lower number wins): appointment_set < approved < pending < closed/rejected/cancelled.
   * Tie-break: newer `timestamp` wins. */
  _gcApprovedByVehicle = {};
  if (requests && requests.length) {
    var prio = { appointment_set: 0, approved: 1, pending: 2 };
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
          history:         Array.isArray(r.history) ? r.history : []
        };
      }
    });
  }
```

Use the `Edit` tool.

- [ ] **Step 2: Verify in browser**

After Task 6 deploys, reload the admin web app, click a calendar cell to open the appointment modal, pick a vehicle that has a known active request, and check via DevTools:

```javascript
console.log(_gcApprovedByVehicle);
```

Expected: every value contains `history`, `description`, `cancelCount`, etc.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add index.html
git commit -m "fix(garage-cal): correct priority (appointment_set > approved) and tie-break by timestamp, widen request payload"
```

---

## Task 6: Design and implement the new banner UI

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html:22103-22147` (the existing `_gcUpdatePendingInfo`)
- Modify: same file — append a `<style>` block alongside other gcal styles (search for `.gcal-modal-overlay` to find the block).

This task replaces the simple yellow/green card with a rich, three-variant lifecycle card. The card is built entirely with inline-styled HTML + a small dedicated CSS block (matching the rest of the file's approach — no external assets). All Hebrew, RTL.

**Visual targets:**
- Variant `pending` — amber border, hourglass icon, blocking message: *"לא ניתן לשייך תור עד אישור הבקשה"*.
- Variant `approved` — blue accent, calendar-plus icon, shows description + manager note + timeline + staleness/cancel badges.
- Variant `appointment_set` — green accent, calendar-check icon, shows existing appointment date/time and warns that saving will update it.

- [ ] **Step 1: Add the CSS block**

Find any existing `.gcal-modal-overlay` rule in `index.html` (use `Grep`). Insert the following CSS **inside the same `<style>` element**, immediately after the closing brace of an adjacent rule:

```css
/* ─── Garage lifecycle banner (plan 2026-05-25) ─── */
.glb-card{
  --glb-accent:#3b82f6; --glb-accent-soft:#dbeafe; --glb-accent-text:#1e3a8a;
  background:#ffffff; border:1px solid #e5e7eb; border-right:4px solid var(--glb-accent);
  border-radius:12px; padding:14px 16px; margin-top:4px;
  box-shadow:0 2px 8px rgba(15,23,42,.04);
  font-family:inherit; direction:rtl; color:#0f172a;
}
.glb-card.glb-pending      { --glb-accent:#f59e0b; --glb-accent-soft:#fef3c7; --glb-accent-text:#78350f; }
.glb-card.glb-approved     { --glb-accent:#3b82f6; --glb-accent-soft:#dbeafe; --glb-accent-text:#1e3a8a; }
.glb-card.glb-appointment  { --glb-accent:#10b981; --glb-accent-soft:#d1fae5; --glb-accent-text:#064e3b; }
.glb-head{ display:flex; align-items:center; gap:10px; }
.glb-icon{
  width:36px; height:36px; border-radius:10px;
  background:var(--glb-accent-soft); color:var(--glb-accent-text);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.glb-title{ font-size:14px; font-weight:700; color:#0f172a; line-height:1.3; flex:1; min-width:0; }
.glb-evt{ font-size:11px; color:#64748b; margin-top:2px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.glb-sev{
  font-size:10px; font-weight:700; letter-spacing:.5px;
  padding:3px 8px; border-radius:999px;
  background:var(--glb-accent-soft); color:var(--glb-accent-text);
  text-transform:uppercase; flex-shrink:0;
}
.glb-section{ margin-top:12px; padding-top:12px; border-top:1px dashed #e5e7eb; }
.glb-label{ font-size:11px; font-weight:600; color:#64748b; margin-bottom:4px; }
.glb-desc{
  background:#f8fafc; border-radius:8px; padding:10px 12px;
  font-size:13px; color:#1e293b; line-height:1.5; white-space:pre-wrap; word-break:break-word;
  border:1px solid #e2e8f0;
}
.glb-timeline{ list-style:none; padding:0; margin:6px 0 0; display:flex; flex-direction:column; gap:8px; }
.glb-step{ display:flex; align-items:flex-start; gap:10px; font-size:12px; }
.glb-dot{
  width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:4px;
  background:#cbd5e1; box-shadow:0 0 0 3px #f1f5f9;
}
.glb-step.glb-s-created    .glb-dot{ background:#94a3b8; box-shadow:0 0 0 3px #e2e8f0; }
.glb-step.glb-s-approved   .glb-dot{ background:#3b82f6; box-shadow:0 0 0 3px #dbeafe; }
.glb-step.glb-s-appointment_set .glb-dot{ background:#10b981; box-shadow:0 0 0 3px #d1fae5; }
.glb-step.glb-s-cancelled_by_driver .glb-dot,
.glb-step.glb-s-cancelled_by_admin  .glb-dot{ background:#ef4444; box-shadow:0 0 0 3px #fee2e2; }
.glb-step.glb-s-rejected   .glb-dot{ background:#dc2626; box-shadow:0 0 0 3px #fee2e2; }
.glb-step.glb-s-closed     .glb-dot{ background:#475569; box-shadow:0 0 0 3px #e2e8f0; }
.glb-step-main{ flex:1; min-width:0; color:#0f172a; }
.glb-step-meta{ color:#64748b; font-size:11px; margin-top:1px; }
.glb-step-note{
  background:#fef9c3; border:1px solid #fde68a; border-radius:6px;
  padding:6px 8px; margin-top:4px; color:#713f12; font-size:12px;
}
.glb-badges{ display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.glb-badge{
  font-size:11px; font-weight:600; padding:5px 10px; border-radius:999px;
  display:inline-flex; align-items:center; gap:6px;
}
.glb-badge.glb-b-warn{ background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
.glb-badge.glb-b-danger{ background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
.glb-badge.glb-b-info{ background:#dbeafe; color:#1e3a8a; border:1px solid #bfdbfe; }
.glb-foot{
  margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9;
  font-size:11px; color:#64748b; display:flex; align-items:center; gap:6px;
}
.glb-foot.glb-f-blocking{ color:#991b1b; font-weight:600; }
```

- [ ] **Step 2: Replace `_gcUpdatePendingInfo` with the lifecycle implementation**

Find `function _gcUpdatePendingInfo(val) {` in `index.html` (currently around line 22103) and replace the entire function (through its closing `}` near line 22147) with:

```javascript
function _gcUpdatePendingInfo(val) {
  var el = document.getElementById('gcal-pending-info');
  if (!el) return;
  if (!val || val.indexOf('__veh__') !== 0) { el.innerHTML = ''; return; }
  var vn  = val.replace('__veh__', '');
  var req = _gcApprovedByVehicle[vn];
  if (!req) { el.innerHTML = ''; return; }
  el.innerHTML = _glbRenderBanner(req);
  /* Pre-fill the reason chip from the request, when present */
  if (req.reason) {
    var chips = document.querySelectorAll('#gcal-reason-chips .gcal-reason-chip');
    chips.forEach(function(c) {
      c.classList.remove('grc-active');
      if (c.getAttribute('data-reason') === req.reason) c.classList.add('grc-active');
    });
  }
}

/* ── Lifecycle banner renderer ───────────────────────────────────
 * Builds one of three variants based on req.status.
 * No external deps; pure string concat + _gcEsc for safety.
 * ──────────────────────────────────────────────────────────────── */
function _glbRenderBanner(req) {
  var status = String(req.status || 'approved');
  var variant = status === 'pending' ? 'pending'
              : status === 'appointment_set' ? 'appointment'
              : 'approved';
  var iconSvg = _glbIcon(variant);
  var titleTxt = variant === 'pending'
      ? 'בקשת מוסך ממתינה לאישור'
      : (variant === 'appointment' ? 'תור קיים לבקשת מוסך זו' : 'בקשת מוסך מאושרת');
  var sev = _glbSeverity(req);
  var evtTag = req.eventId
      ? ('<div class="glb-evt">' + _gcEsc(req.eventId) + (req.driverName ? ' · ' + _gcEsc(req.driverName) : '') + '</div>')
      : '';
  var descBlock = _glbDescBlock(req);
  var timeline  = _glbTimeline(req);
  var badges    = _glbBadges(req);
  var foot      = _glbFoot(variant, req);

  return ''
    + '<div class="glb-card glb-' + variant + '" dir="rtl">'
    +   '<div class="glb-head">'
    +     '<div class="glb-icon">' + iconSvg + '</div>'
    +     '<div style="flex:1;min-width:0">'
    +       '<div class="glb-title">' + _gcEsc(titleTxt) + '</div>'
    +       evtTag
    +     '</div>'
    +     (sev ? '<span class="glb-sev">' + _gcEsc(sev) + '</span>' : '')
    +   '</div>'
    +   descBlock
    +   timeline
    +   badges
    +   foot
    + '</div>';
}

function _glbIcon(variant) {
  if (variant === 'pending') {
    /* hourglass */
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>';
  }
  if (variant === 'appointment') {
    /* calendar-check */
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>';
  }
  /* approved -> wrench */
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
}

function _glbSeverity(req) {
  /* Lightweight rule: derive severity from reason text. */
  var r = String(req.reason || req.description || '').toLowerCase();
  if (!r) return '';
  if (/דחוף|בלמים|תאונה|לא נוסע|תקלה רצינית|מנוע|שמן/.test(r)) return 'דחוף';
  if (/טיפול|רגיל|שגרתי/.test(r)) return 'רגיל';
  return '';
}

function _glbDescBlock(req) {
  var hasDesc = req.description && String(req.description).trim();
  var hasManagerNote = req.managerNotes && String(req.managerNotes).trim();
  if (!hasDesc && !hasManagerNote) return '';
  var out = '<div class="glb-section">';
  if (hasDesc) {
    out += '<div class="glb-label">תיאור התקלה (מהנהג):</div>'
        +  '<div class="glb-desc">' + _gcEsc(req.description) + '</div>';
  }
  if (hasManagerNote) {
    out += '<div class="glb-label" style="margin-top:8px">הערת מנהל:</div>'
        +  '<div class="glb-desc" style="background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a">'
        +  _gcEsc(req.managerNotes) + '</div>';
  }
  return out + '</div>';
}

function _glbHumanDate(s) {
  if (!s) return '';
  try {
    var d = new Date(s);
    if (isNaN(d.getTime())) return _gcEsc(String(s));
    var dd = String(d.getDate()).padStart(2,'0');
    var mm = String(d.getMonth()+1).padStart(2,'0');
    var yy = String(d.getFullYear()).slice(2);
    var hh = String(d.getHours()).padStart(2,'0');
    var mn = String(d.getMinutes()).padStart(2,'0');
    return dd + '.' + mm + '.' + yy + ' ' + hh + ':' + mn;
  } catch(e) { return _gcEsc(String(s)); }
}

function _glbActionLabel(action) {
  switch(action) {
    case 'created':              return 'הבקשה נפתחה';
    case 'approved':             return 'אושרה ע״י מנהל';
    case 'rejected':             return 'נדחתה ע״י מנהל';
    case 'appointment_set':      return 'נקבע תור';
    case 'cancelled_by_driver':  return 'התור בוטל ע״י הנהג';
    case 'cancelled_by_admin':   return 'התור בוטל ע״י המנהל';
    case 'closed':               return 'הבקשה נסגרה';
    case 'arrived_at_garage':    return 'הנהג הגיע למוסך';
    default:                     return _gcEsc(String(action));
  }
}

function _glbTimeline(req) {
  /* Build the timeline from `history` if present; otherwise synthesise minimum
     entries from the available timestamps so older rows still show something. */
  var hist = (req.history && req.history.length) ? req.history.slice() : [];
  if (!hist.length) {
    if (req.createdAt) hist.push({ action:'created', at:req.createdAt, by:req.driverName||'' });
    if (req.approvedAt) hist.push({ action:'approved', at:req.approvedAt });
    if (req.status === 'appointment_set' && req.appointmentDate) {
      hist.push({ action:'appointment_set', at:req.approvedAt || req.createdAt || '',
                  appointmentDate:req.appointmentDate, appointmentTime:req.appointmentTime });
    }
  }
  if (!hist.length) return '';
  var items = hist.map(function(h) {
    var act = String(h.action || '');
    var label = _glbActionLabel(act);
    var when  = _glbHumanDate(h.at);
    var meta  = [];
    if (h.by)              meta.push(_gcEsc(h.by));
    if (h.appointmentDate) meta.push('תור: ' + _gcEsc(h.appointmentDate) + (h.appointmentTime ? ' ' + _gcEsc(h.appointmentTime) : ''));
    var note  = h.note ? ('<div class="glb-step-note">' + _gcEsc(h.note) + '</div>') : '';
    return ''
      + '<li class="glb-step glb-s-' + _gcEsc(act) + '">'
      +   '<span class="glb-dot"></span>'
      +   '<div class="glb-step-main">'
      +     '<div>' + label + (when ? ' <span class="glb-step-meta">· ' + when + '</span>' : '') + '</div>'
      +     (meta.length ? '<div class="glb-step-meta">' + meta.join(' · ') + '</div>' : '')
      +     note
      +   '</div>'
      + '</li>';
  }).join('');
  return ''
    + '<div class="glb-section">'
    +   '<div class="glb-label">ציר זמן:</div>'
    +   '<ul class="glb-timeline">' + items + '</ul>'
    + '</div>';
}

function _glbBadges(req) {
  var out = [];
  /* Staleness: approved > 7 days with no appointment */
  if (req.status === 'approved' && req.approvedAt) {
    var d = new Date(req.approvedAt);
    if (!isNaN(d.getTime())) {
      var days = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (days >= 7) {
        out.push('<span class="glb-badge glb-b-warn">⚠ אושרה לפני ' + days + ' יום, עדיין ללא תור</span>');
      }
    }
  }
  /* Repeat cancellations */
  if (req.cancelCount >= 2) {
    out.push('<span class="glb-badge glb-b-danger">🔴 התור בוטל ' + req.cancelCount + ' פעמים</span>');
  } else if (req.cancelCount === 1) {
    out.push('<span class="glb-badge glb-b-warn">⚠ התור בוטל פעם אחת</span>');
  }
  /* km-to-service info, when present */
  if (req.kmToService != null) {
    var k = Number(req.kmToService);
    if (!isNaN(k)) {
      var lbl = k <= 0 ? ('עברה ' + Math.abs(k) + ' ק״מ את מועד הטיפול') : ('נותרו ' + k + ' ק״מ עד טיפול');
      out.push('<span class="glb-badge glb-b-info">📏 ' + _gcEsc(lbl) + '</span>');
    }
  }
  if (!out.length) return '';
  return '<div class="glb-section"><div class="glb-badges">' + out.join('') + '</div></div>';
}

function _glbFoot(variant, req) {
  if (variant === 'pending') {
    return '<div class="glb-foot glb-f-blocking">⛔ לא ניתן לשייך תור עד אישור הבקשה</div>';
  }
  if (variant === 'appointment') {
    var existing = req.appointmentDate ? (req.appointmentDate + (req.appointmentTime ? ' ' + req.appointmentTime : '')) : '';
    return '<div class="glb-foot">📅 שמירה תעדכן את התור הקיים' + (existing ? ' (' + _gcEsc(existing) + ')' : '') + '</div>';
  }
  return '<div class="glb-foot">✓ קביעת תור זו תשויך אוטומטית לבקשה זו</div>';
}
```

Use the `Edit` tool. If the existing function spans an awkward boundary for unique-string matching, do the replacement via a small Python `bytes.replace()` script (use the function header `function _gcUpdatePendingInfo(val) {` as anchor and the next top-level `function ` declaration as terminator).

- [ ] **Step 3: Wire the pending variant**

The `pending` variant requires that pending requests are kept in `_gcApprovedByVehicle`. Edit Task 5's filter to **include** `pending`:

In the replacement block from Task 5 Step 1, the line `if (st === 'closed' || st === 'rejected' || st === 'cancelled') return;` already drops only terminal states — `pending` is preserved. Good. Now make sure the existing dispatcher in `_gcSaveAppointment` (around index.html:22159+) refuses to save when the chosen vehicle has a `pending` request. Find `_gcSaveAppointment` and immediately after the `if (!entityId) { _gcAlert('יש לבחור נהג/רכב'); return; }` line, add:

```javascript
  if (isDirectVeh) {
    var pendReq = _gcApprovedByVehicle[entityId];
    if (pendReq && pendReq.status === 'pending') {
      _gcAlert('לא ניתן לקבוע תור — קיימת בקשת מוסך ממתינה לאישור עבור רכב זה');
      if (btn) { btn.disabled = false; btn.textContent = btnOrigText; }
      return;
    }
  }
```

(Place it after the spinner `if (btn) { btn.disabled = true; ... }` line — we want the spinner to reset on rejection.)

- [ ] **Step 4: Manual visual QA**

After deploy (next step), open the admin app and click a calendar date to open the appointment modal. Pick three test vehicles in sequence:
  1. One with a pending request — banner must show amber, blocking footer, save button must produce the in-app alert.
  2. One with an approved-but-no-appointment request older than 7 days — banner must show the staleness badge.
  3. One with appointment_set + at least two cancellations in history — banner must show repeat-cancel danger badge.

Screenshot each variant and attach to the QA doc (Task 7).

- [ ] **Step 5: Deploy**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
# JS string-escape pre-flight (constraint #9)
python -c "import re; src=open('index.html','rb').read().decode('utf-8'); bad=re.findall(r\"font-family:'[^']*'[^\\\";]\", src); print('bad font:', len(bad))"
python -c "src=open('index.html','rb').read().decode('utf-8'); print('onclick check:', 'onclick=\"' in src)"
clasp push
```

If `clasp push` reports a syntax error in `index.html`, search for the offending line, fix, repeat.

- [ ] **Step 6: Commit**

```powershell
git add index.html
git commit -m "feat(garage-cal): rich lifecycle banner with timeline, severity, staleness & cancel badges + pending block"
```

---

## Task 7: Driver-side verification + git commit hygiene + QA doc

**Files:**
- Verify (no edits expected): `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js`
- Create: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\qa\2026-05-25-garage-lifecycle-banner-qa.md`

- [ ] **Step 1: Driver smoke test**

In a real or test driver device:
1. Open the PWA, submit a new garage request with reason "מנוע" and description "רעש מהמנוע, נורת שמן דולקת".
2. From the admin, approve it with a manager note ("בדקתי, דחוף").
3. From the admin Google Calendar tab, open the appointment modal, pick the vehicle.
4. Verify the new banner shows: description, manager note, the two timeline entries `created` + `approved`, severity badge `דחוף`.
5. Save an appointment.
6. From the driver, cancel the appointment.
7. From admin, re-open the modal — verify timeline now has `appointment_set` and `cancelled_by_driver` entries, and `cancelCount` badge shows "התור בוטל פעם אחת".

If any step fails, capture the failing payload (DevTools → Network → `getGarageRequests` → Preview) and a screenshot.

- [ ] **Step 2: Write the QA doc**

Create `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\docs\qa\2026-05-25-garage-lifecycle-banner-qa.md` with the project's standard structure:

```markdown
# QA — Garage Request Lifecycle Banner (2026-05-25)

קשור לפלאן: `docs/plans/2026-05-25-garage-request-lifecycle-banner.md`

## תקלות שנמצאו בזמן המימוש

### תקלה #1 — <כותרת>
- **תיאור**: <מה ראינו>
- **שורש**: <למה זה קרה>
- **תיקון**: <מה עשינו>
- **לקח**: <מה לזכור להבא>

<חזור על המבנה לכל תקלה>

## בדיקות שביצענו (פלואו end-to-end)

1. [✓] migrateSheets הוסיף history+cancelCount
2. [✓] _appendFieldEventHistory smoke test הצליח עם entry בודד
3. [✓] approveGarageRequest מוסיף entry "approved" עם managerNote
4. [✓] _garageSetAppointment מוסיף entry "appointment_set" עם תאריך+שעה
5. [✓] _cancelAppointment מוסיף entry "cancelled_by_driver" ומגדיל cancelCount
6. [✓] getGarageRequests מחזיר history+details בכל שורה
7. [✓] _gcApprovedByVehicle עם appointment_set גובר על approved (תיקון priority)
8. [✓] Tie-break לפי timestamp עובד
9. [✓] Banner — variant pending נראה נכון וחוסם save
10. [✓] Banner — variant approved + staleness 7+ ימים מציג badge
11. [✓] Banner — variant approved + cancelCount>=2 מציג badge אדום
12. [✓] Banner — variant appointment_set מציג תאריך קיים והודעת עדכון
13. [✓] Timeline מתקבל גם בשורות ישנות ללא history (fallback מ-timestamps)
14. [✓] RTL ועברית בכל הווריאנטים, גם במסך צר

## צילומי מסך
- `screenshots/banner-pending.png`
- `screenshots/banner-approved-stale.png`
- `screenshots/banner-appointment-repeat-cancel.png`
```

Fill the "תקלות שנמצאו" section with any real bugs encountered during execution; if none, write `אין — המימוש עבר בצורה חלקה`.

- [ ] **Step 3: Final commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager"
git add driver/docs/qa/2026-05-25-garage-lifecycle-banner-qa.md driver/docs/plans/2026-05-25-garage-request-lifecycle-banner.md
git commit -m "docs(garage): QA + plan for lifecycle banner (2026-05-25)"
```

- [ ] **Step 4: Verify clean tree**

```powershell
git status
```

Expected: `nothing to commit, working tree clean`.

---

## Self-Review Notes

- **Spec coverage** — Task mapping: Task 1 → history column add; Task 2 → central helper; Task 3 → wire helper into every status mutation (approve, reject, set appt, cancel appt, close); Task 4 → widen server payload; Task 5 → fix client priority + tie-break + new fields; Task 6 → banner UI (all three variants incl. pending); Task 7 → QA doc + driver-side e2e + commits. All 7 spec tasks covered.
- **Placeholders** — None remain. Every code step has actual code. Severity rule is hard-coded (not "add appropriate"). Backup verification is a real `Get-Item ... | Length` check.
- **Type consistency** — `_appendFieldEventHistory(eventId, entry)` is called with the same signature in every server handler. The client `req` object shape produced in Task 5 matches every field consumed in Task 6 (`req.history`, `req.description`, `req.managerNotes`, `req.cancelCount`, `req.approvedAt`, `req.appointmentDate`, `req.appointmentTime`, `req.kmToService`, `req.reason`, `req.driverName`, `req.eventId`, `req.status`).
- **Constraint adherence** — backup gating in Task 1 & 3; `bytes.replace` patcher (no PowerShell `-replace`) in Task 3 & 4; header-lookup writes inside the helper itself; Hebrew labels everywhere user-visible; no `confirm/alert/prompt`; `git commit` at the end of every task.

---

## Execution Handoff

Plan complete and saved to `driver/docs/plans/2026-05-25-garage-request-lifecycle-banner.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
