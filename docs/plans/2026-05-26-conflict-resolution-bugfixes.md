# Conflict Resolution Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 bugs found in deep Opus code review of the garage conflict resolution feature (2026-05-25).

**Architecture:** Python bytes.replace() patchers per file (CRLF-safe). One patcher per task. Always run backup.py before writing. Deploy with clasp push. Git commit after each task.

**Tech Stack:** Google Apps Script (code.js — CRLF), Fleet Manager HTML (index.html — CRLF), Driver PWA (app.js — LF), Python 3, clasp

**Source:** Opus code review 2026-05-26. QA doc: `driver/docs/qa/2026-05-26-conflict-resolution-bugfixes-qa.md`

---

## Files Modified

| File | Tasks |
|------|-------|
| `13.4.26/code.js` | T2, T3, T4, T5 |
| `13.4.26/index.html` | T1, T3 |
| `driver/app.js` | T6 |

---

## Bug Reference

| # | Severity | File | Description |
|---|----------|------|-------------|
| B1 | HIGH | index.html | `appointmentSetBy` missing from `_gcApprovedByVehicle` → badge dead |
| B2 | HIGH | code.js | `adminCreateAppointment` has no conflict detection |
| B3 | HIGH | index.html | `_gcConflictKeep` + `_gcConflictOverride` don't close original modal or refresh calendar |
| B4 | MEDIUM | code.js+app.js | Firebase appointment_set payload missing `setBy` → "המנהל שינה" toast fires for driver's own update |
| B5 | MEDIUM | app.js | Staleness guard too aggressive — suppresses legit admin update when timestamps close |
| B6 | MEDIUM | app.js | Driver self-cancel on device B: no toast at all |
| B7 | MEDIUM | code.js | `_cdDate` is Date object → `String()` = "Tue May 26…" → noop never fires + conflict dialog shows garbled date |
| B8 | LOW | code.js | `cancelledTime` uses `String(Date)` → "1899-12-30 09:00:00" in FCM payload |
| B9 | LOW | code.js | Conflict guard skips when `appointmentSetBy=driver` but `appointmentDate` empty |
| B10 | LOW | index.html | Conflict modal has no overlay-click-dismiss |

---

## Task 1 — index.html: Fix badge mapping + modal UX (B1, B3, B10)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html`
- Patcher: `C:\tmp\fix_t1_html.py`

### What's broken

**B1:** `_gcApprovedByVehicle` object literal (L22112–22130) never copies `appointmentSetBy` from `r`. `_glbFoot` reads `req.appointmentSetBy` → always `undefined` → badge never renders.

**B3a:** `_gcConflictKeep` (L22533) closes conflict overlay + shows alert but leaves `gcal-modal-overlay` open with stale form. Admin can click "קבע תור" again, triggering another conflict cycle. Calendar not refreshed → driver's appointment not visible.

**B3b:** `_gcConflictOverride` success handler (L22548) calls `_acLoadGarageCalendar()` but never removes `gcal-modal-overlay` → form stays open over refreshed calendar.

**B10:** `_gcShowConflictModal` (L22524) appends overlay without `addEventListener` for click-outside. Every other modal in codebase has it.

- [ ] **Step 1: Backup**

```powershell
python "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\backup.py"
```

Verify output shows `> 0 bytes` for `index.html`.

- [ ] **Step 2: Write patcher**

Create `C:\tmp\fix_t1_html.py`:

```python
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

results = []
N = b'\r\n'

def rb(raw, old, new, label, count=1):
    if old not in raw:
        results.append(f'WARNING: anchor not found — {label}')
        return raw
    n = raw.count(old)
    if n > count:
        results.append(f'WARNING: anchor appears {n}x (expected {count}) — {label}')
        return raw
    results.append(f'OK: {label}')
    return raw.replace(old, new, count)

html_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html'
with open(html_path, 'rb') as f:
    html = f.read()

orig_size = len(html)

# ── B1: Add appointmentSetBy to _gcApprovedByVehicle mapping ─────────────────
# Anchor: the cancelCount line followed by the history line (unique ending of the object)
html = rb(html,
    b"          cancelCount:     Number(r.cancelCount || 0)," + N +
    b"          history:         Array.isArray(r.history) ? r.history : []",
    b"          cancelCount:     Number(r.cancelCount || 0)," + N +
    b"          appointmentSetBy: String(r.appointmentSetBy || '')," + N +
    b"          history:         Array.isArray(r.history) ? r.history : []",
    "B1: add appointmentSetBy to _gcApprovedByVehicle"
)

# ── B3a: _gcConflictKeep — close original modal + refresh calendar ────────────
# Hebrew: \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c \xd7\x94\xd7\xa0\xd7\x94\xd7\x92 \xd7\xa0\xd7\xa9\xd7\x9e\xd7\xa8 \xd7\x9c\xd7\x9c\xd7\x90 \xd7\xa9\xd7\x99\xd7\xa0\xd7\x95\xd7\x99.
html = rb(html,
    b"function _gcConflictKeep() {" + N +
    b"  _gcConflictCancel();" + N +
    b"  _gcAlert('\xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c \xd7\x94\xd7\xa0\xd7\x94\xd7\x92 \xd7\xa0\xd7\xa9\xd7\x9e\xd7\xa8 \xd7\x9c\xd7\x9c\xd7\x90 \xd7\xa9\xd7\x99\xd7\xa0\xd7\x95\xd7\x99.');" + N +
    b"}",
    b"function _gcConflictKeep() {" + N +
    b"  _gcConflictCancel();" + N +
    b"  var _origOv = document.getElementById('gcal-modal-overlay');" + N +
    b"  if (_origOv) _origOv.remove();" + N +
    b"  _gcFilter = 'all'; _gcVehicleFilter = '';" + N +
    b"  _acLoadGarageCalendar();" + N +
    b"  _gcAlert('\xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c \xd7\x94\xd7\xa0\xd7\x94\xd7\x92 \xd7\xa0\xd7\xa9\xd7\x9e\xd7\xa8 \xd7\x9c\xd7\x9c\xd7\x90 \xd7\xa9\xd7\x99\xd7\xa0\xd7\x95\xd7\x99.');" + N +
    b"}",
    "B3a: _gcConflictKeep close original modal + refresh calendar"
)

# ── B3b: _gcConflictOverride success handler — close gcal-modal-overlay ───────
# Hebrew: \xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: = שגיאה:
html = rb(html,
    b"      if (res.ok) { _gcFilter='all'; _gcVehicleFilter=''; _acLoadGarageCalendar(); }" + N +
    b"      else { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + (res.error||'unknown')); }",
    b"      if (res.ok) {" + N +
    b"        var _origOv2 = document.getElementById('gcal-modal-overlay');" + N +
    b"        if (_origOv2) _origOv2.remove();" + N +
    b"        _gcFilter='all'; _gcVehicleFilter=''; _acLoadGarageCalendar();" + N +
    b"      } else { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + (res.error||'unknown')); }",
    "B3b: _gcConflictOverride success close gcal-modal-overlay"
)

# ── B10: _gcShowConflictModal — add overlay-click-dismiss ────────────────────
html = rb(html,
    b"  document.body.appendChild(ov);" + N +
    b"}" + N +
    N +
    b"function _gcConflictCancel()",
    b"  ov.addEventListener('click', function(e){ if (e.target === ov) _gcConflictCancel(); });" + N +
    b"  document.body.appendChild(ov);" + N +
    b"}" + N +
    N +
    b"function _gcConflictCancel()",
    "B10: conflict modal overlay-click-dismiss"
)

assert len(html) > orig_size, f'SAFETY: html shrank from {orig_size} to {len(html)}'

with open(html_path + '.tmp', 'wb') as f: f.write(html)
os.replace(html_path + '.tmp', html_path)
print(f'index.html done: {orig_size} -> {len(html)} bytes (+{len(html)-orig_size})')
for r in results: print(r)
```

- [ ] **Step 3: Run patcher**

```powershell
python "C:\tmp\fix_t1_html.py"
```

Expected output — all 4 lines must be `OK:`:
```
index.html done: NNNNN -> MMMMM bytes (+NNN)
OK: B1: add appointmentSetBy to _gcApprovedByVehicle
OK: B3a: _gcConflictKeep close original modal + refresh calendar
OK: B3b: _gcConflictOverride success close gcal-modal-overlay
OK: B10: conflict modal overlay-click-dismiss
```

- [ ] **Step 4: Verify anchors in file**

```powershell
python -c "
f=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html','rb').read()
print('B1 ok:', b'appointmentSetBy: String(r.appointmentSetBy' in f)
print('B3a ok:', b'_acLoadGarageCalendar' in f and b'_gcConflictKeep' in f)
print('B3b ok:', b'_origOv2' in f)
print('B10 ok:', b'_gcConflictCancel()' in f and b'e.target === ov' in f)
"
```

Expected: all 4 `True`.

- [ ] **Step 5: Git commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add index.html
git commit -m "fix(garage): B1 badge mapping, B3 modal cleanup, B10 overlay-click dismiss"
```

---

## Task 2 — code.js: `adminCreateAppointment` conflict detection (B2)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html`
- Patcher: `C:\tmp\fix_t2_conflict_create.py`

### What's broken

`adminCreateAppointment` (called when admin selects vehicle from dropdown, `isDirectVeh=true`) finds the existing event via `bestCandidate` but never checks `appointmentSetBy`. It unconditionally overwrites a driver-set appointment without showing the conflict modal.

Additionally, `_gcSavePayload` is only set in the `else` (non-direct-vehicle) branch of `_gcSaveAppointment`, so even if `adminCreateAppointment` returned `driver_already_set`, the conflict modal's "override" button would silently no-op.

### Fix design

1. **code.js:** Add `force` as 7th param to `adminCreateAppointment`. Before the `if (existingSheetRow > 0)` write, check if `bestCandidate.status === 'appointment_set'` and existing row has `appointmentSetBy === 'driver'` and `!force` → return conflict error.
2. **index.html:** Set `_gcSavePayload` in the `isDirectVeh` branch too. Extend `_gcConflictOverride` to route `isDirectVeh` path to `adminCreateAppointment(..., true)`.

- [ ] **Step 1: Backup**

```powershell
python "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\backup.py"
```

- [ ] **Step 2: Write patcher**

Create `C:\tmp\fix_t2_conflict_create.py`:

```python
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

results = []
N = b'\r\n'

def rb(raw, old, new, label, count=1):
    if old not in raw:
        results.append(f'WARNING: anchor not found — {label}')
        return raw
    n = raw.count(old)
    if n > count:
        results.append(f'WARNING: anchor appears {n}x (expected {count}) — {label}')
        return raw
    results.append(f'OK: {label}')
    return raw.replace(old, new, count)

# ══════════════════════════════════════════════════════════════════
# code.js — add force param + conflict detection to adminCreateAppointment
# ══════════════════════════════════════════════════════════════════
code_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js'
with open(code_path, 'rb') as f:
    code = f.read()
orig_code = len(code)

# 1a. Function signature — add force param
code = rb(code,
    b"function adminCreateAppointment(vehicleNum, appointmentDate, appointmentTime, reason, managerNote, sessionToken) {",
    b"function adminCreateAppointment(vehicleNum, appointmentDate, appointmentTime, reason, managerNote, sessionToken, force) {",
    "B2: adminCreateAppointment add force param"
)

# 1b. Conflict detection block — insert before the existingSheetRow > 0 write
# Unique anchor: the Logger.log line that precedes the if block is inside the for loop
# Use the unique var firebaseVehKey line + blank line as anchor
code = rb(code,
    b"    var firebaseVehKey = veh.id || veh.num; /* use id if available, else num */" + N +
    N +
    b"    if (existingSheetRow > 0) {",
    b"    var firebaseVehKey = veh.id || veh.num; /* use id if available, else num */" + N +
    N +
    b"    /* ── Conflict detection for existing appointment_set rows ── */" + N +
    b"    if (existingSheetRow > 0 && bestCandidate === candidates['appointment_set']) {" + N +
    b"      var _acaC_setByIdx = evtHdr.indexOf('appointmentSetBy');" + N +
    b"      var _acaC_setBy    = _acaC_setByIdx >= 0 ? String(evtData[existingSheetRow - 1][_acaC_setByIdx] || '') : '';" + N +
    b"      if (_acaC_setBy === 'driver' && !force) {" + N +
    b"        var _acaC_dtIdx  = evtHdr.indexOf('appointmentDate');" + N +
    b"        var _acaC_tmIdx  = evtHdr.indexOf('appointmentTime');" + N +
    b"        var _acaC_nmIdx  = evtHdr.indexOf('driverName');" + N +
    b"        var _acaC_date   = _acaC_dtIdx >= 0 ? String(evtData[existingSheetRow-1][_acaC_dtIdx] || '').replace(/\\s.*/, '') : '';" + N +
    b"        var _acaC_time   = _acaC_tmIdx >= 0 ? (function(t) {" + N +
    b"          if (!t) return '';" + N +
    b"          if (t instanceof Date) return ('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);" + N +
    b"          var m = String(t).match(/(\\d{1,2}):(\\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : '';" + N +
    b"        })(evtData[existingSheetRow-1][_acaC_tmIdx]) : '';" + N +
    b"        var _acaC_name   = _acaC_nmIdx >= 0 ? String(evtData[existingSheetRow-1][_acaC_nmIdx] || '') : '';" + N +
    b"        return JSON.stringify({ ok: false, error: 'driver_already_set'," + N +
    b"          driverApptDate: _acaC_date, driverApptTime: _acaC_time," + N +
    b"          driverName: _acaC_name });" + N +
    b"      }" + N +
    b"    }" + N +
    N +
    b"    if (existingSheetRow > 0) {",
    "B2: adminCreateAppointment conflict detection block"
)

assert len(code) > orig_code, f'SAFETY: code.js shrank'
with open(code_path + '.tmp', 'wb') as f: f.write(code)
os.replace(code_path + '.tmp', code_path)
print(f'code.js done: {orig_code} -> {len(code)} bytes (+{len(code)-orig_code})')

# ══════════════════════════════════════════════════════════════════
# index.html — set _gcSavePayload for isDirectVeh + extend _gcConflictOverride
# ══════════════════════════════════════════════════════════════════
html_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html'
with open(html_path, 'rb') as f:
    html = f.read()
orig_html = len(html)

# 2a. Set _gcSavePayload in isDirectVeh branch before the GAS call
# Hebrew: \xd7\xa1\xd7\x99\xd7\x91\xd7\x94 = reason, \xd7\xa4\xd7\xa8\xd7\x98 = note
html = rb(html,
    b"    google.script.run" + N +
    b"      .withSuccessHandler(onSuccess)" + N +
    b"      .withFailureHandler(onError)" + N +
    b"      .adminCreateAppointment(entityId, dateKey, time, reason || '', note || '', APP_SESSION);",
    b"    _gcSavePayload = { entityId: entityId, dateKey: dateKey, time: time, reason: reason, note: note, isDirectVeh: true };" + N +
    b"    google.script.run" + N +
    b"      .withSuccessHandler(onSuccess)" + N +
    b"      .withFailureHandler(onError)" + N +
    b"      .adminCreateAppointment(entityId, dateKey, time, reason || '', note || '', APP_SESSION, false);",
    "B2: set _gcSavePayload in isDirectVeh branch"
)

# 2b. _gcConflictOverride — route isDirectVeh to adminCreateAppointment
# Hebrew: \xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: = שגיאה:
html = rb(html,
    b"  google.script.run" + N +
    b"    .withSuccessHandler(function(raw) {" + N +
    b"      var res; try { res = JSON.parse(raw||'{}'); } catch(e) { res = {}; }" + N +
    b"      if (res.ok) {" + N +
    b"        var _origOv2 = document.getElementById('gcal-modal-overlay');" + N +
    b"        if (_origOv2) _origOv2.remove();" + N +
    b"        _gcFilter='all'; _gcVehicleFilter=''; _acLoadGarageCalendar();" + N +
    b"      } else { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + (res.error||'unknown')); }" + N +
    b"    })" + N +
    b"    .withFailureHandler(function(e) { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + e); })" + N +
    b"    .adminSetAppointment(p.entityId, p.dateKey, p.time, note, APP_SESSION, true);",
    b"  var _overrideSuccess = function(raw) {" + N +
    b"    var res; try { res = JSON.parse(raw||'{}'); } catch(e) { res = {}; }" + N +
    b"    if (res.ok) {" + N +
    b"      var _origOv2 = document.getElementById('gcal-modal-overlay');" + N +
    b"      if (_origOv2) _origOv2.remove();" + N +
    b"      _gcFilter='all'; _gcVehicleFilter=''; _acLoadGarageCalendar();" + N +
    b"    } else { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + (res.error||'unknown')); }" + N +
    b"  };" + N +
    b"  var _overrideErr = function(e) { _gcAlert('\xd7\xa9\xd7\x92\xd7\x99\xd7\x90\xd7\x94: ' + e); };" + N +
    b"  if (p.isDirectVeh) {" + N +
    b"    google.script.run" + N +
    b"      .withSuccessHandler(_overrideSuccess)" + N +
    b"      .withFailureHandler(_overrideErr)" + N +
    b"      .adminCreateAppointment(p.entityId, p.dateKey, p.time, p.reason || '', p.note || '', APP_SESSION, true);" + N +
    b"  } else {" + N +
    b"    google.script.run" + N +
    b"      .withSuccessHandler(_overrideSuccess)" + N +
    b"      .withFailureHandler(_overrideErr)" + N +
    b"      .adminSetAppointment(p.entityId, p.dateKey, p.time, note, APP_SESSION, true);" + N +
    b"  }",
    "B2: _gcConflictOverride route isDirectVeh to adminCreateAppointment"
)

assert len(html) > orig_html, f'SAFETY: html shrank'
with open(html_path + '.tmp', 'wb') as f: f.write(html)
os.replace(html_path + '.tmp', html_path)
print(f'index.html done: {orig_html} -> {len(html)} bytes (+{len(html)-orig_html})')
print()
for r in results: print(r)
```

- [ ] **Step 3: Run patcher**

```powershell
python "C:\tmp\fix_t2_conflict_create.py"
```

Expected — all 4 lines `OK:`:
```
code.js done: NNNNN -> MMMMM bytes (+NNN)
index.html done: NNNNN -> MMMMM bytes (+NNN)
OK: B2: adminCreateAppointment add force param
OK: B2: adminCreateAppointment conflict detection block
OK: B2: set _gcSavePayload in isDirectVeh branch
OK: B2: _gcConflictOverride route isDirectVeh to adminCreateAppointment
```

- [ ] **Step 4: Verify**

```powershell
python -c "
code=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js','rb').read()
html=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html','rb').read()
print('force param ok:', b'sessionToken, force)' in code)
print('conflict block ok:', b'_acaC_setBy' in code)
print('payload direct ok:', b'isDirectVeh: true' in html)
print('override route ok:', b'p.isDirectVeh' in html)
"
```

- [ ] **Step 5: Git commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add code.js index.html
git commit -m "fix(garage): B2 adminCreateAppointment conflict detection + override routing"
```

---

## Task 3 — code.js: Date normalization bugs (B7, B8, B9)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- Patcher: `C:\tmp\fix_t3_dates.py`

### What's broken

**B7:** `_cdDate` (L17562) uses `String(data[i][dtIdx] || '')`. When the sheet column is a date cell, GAS returns a Date object. `String(dateObj)` yields `"Tue May 26 2026 00:00:00 GMT+0300 (Israel Standard Time)"`. This never matches admin-supplied `"2026-05-26"`, so:
- The noop idempotency check at L17573 never fires → writes proceed, duplicate FCMs sent
- The conflict response shows garbled date in the dialog

**B8:** `cancelledTime` (L17757) uses `String(data[i][tmIdx] || '')`. Time cells in GAS are Date objects anchored to 1899-12-30. `String()` yields `"1899-12-30T07:00:00.000Z"`. FCM `appointmentTime` payload is garbled.

**B9:** Conflict guard (L17568) requires `_cdDate` to be truthy. When `appointmentSetBy='driver'` but `appointmentDate=''` (corrupt row), guard doesn't fire → silent override without `force=true`.

- [ ] **Step 1: Backup**

```powershell
python "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\backup.py"
```

- [ ] **Step 2: Write patcher**

Create `C:\tmp\fix_t3_dates.py`:

```python
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

results = []
N = b'\r\n'

def rb(raw, old, new, label, count=1):
    if old not in raw:
        results.append(f'WARNING: anchor not found — {label}')
        return raw
    n = raw.count(old)
    if n > count:
        results.append(f'WARNING: anchor appears {n}x (expected {count}) — {label}')
        return raw
    results.append(f'OK: {label}')
    return raw.replace(old, new, count)

code_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js'
with open(code_path, 'rb') as f:
    code = f.read()
orig_size = len(code)

# ── B7: normalize _cdDate (Date object → 'yyyy-MM-dd') ────────────────────────
code = rb(code,
    b"      var _cdDate     = dtIdx >= 0 ? String(data[i][dtIdx] || '') : '';",
    b"      var _cdDate     = dtIdx >= 0 ? (function(d) {" + N +
    b"        if (!d) return '';" + N +
    b"        if (d instanceof Date) return Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd');" + N +
    b"        return String(d).replace(/\\s.*/, '').split('T')[0];" + N +
    b"      })(data[i][dtIdx]) : '';",
    "B7: normalize _cdDate in adminSetAppointment"
)

# ── B8: normalize cancelledTime (Date object → HH:MM) ─────────────────────────
code = rb(code,
    b"      var cancelledTime = tmIdx >= 0 ? String(data[i][tmIdx] || '') : '';",
    b"      var cancelledTime = tmIdx >= 0 ? (function(t) {" + N +
    b"        if (!t) return '';" + N +
    b"        if (t instanceof Date) return ('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);" + N +
    b"        var m = String(t).match(/(\\d{1,2}):(\\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : '';" + N +
    b"      })(data[i][tmIdx]) : '';",
    "B8: normalize cancelledTime in adminCancelAppointment"
)

# ── B9: widen conflict guard — protect driver appointment even when date empty ─
code = rb(code,
    b"      if (_cdSetBy === 'driver' && _cdDate && !force) {",
    b"      if (_cdSetBy === 'driver' && !force) {",
    "B9: conflict guard fires even when appointmentDate empty"
)

assert len(code) > orig_size - 50, f'SAFETY: code.js lost more than 50 bytes'
with open(code_path + '.tmp', 'wb') as f: f.write(code)
os.replace(code_path + '.tmp', code_path)
print(f'code.js done: {orig_size} -> {len(code)} bytes')
for r in results: print(r)
```

- [ ] **Step 3: Run patcher**

```powershell
python "C:\tmp\fix_t3_dates.py"
```

Expected:
```
code.js done: NNNNN -> MMMMM bytes
OK: B7: normalize _cdDate in adminSetAppointment
OK: B8: normalize cancelledTime in adminCancelAppointment
OK: B9: conflict guard fires even when appointmentDate empty
```

- [ ] **Step 4: Verify**

```powershell
python -c "
code=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js','rb').read()
print('B7 ok:', b'Utilities.formatDate(d,' in code)
print('B8 ok:', b'cancelledTime = tmIdx >= 0 ? (function(t)' in code)
print('B9 ok:', b\"if (_cdSetBy === 'driver' && !force)\" in code)
"
```

- [ ] **Step 5: Git commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add code.js
git commit -m "fix(garage): B7 _cdDate normalization, B8 cancelledTime, B9 widen conflict guard"
```

---

## Task 4 — code.js: Firebase appointment_set payload includes setBy (B4)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js`
- Patcher: `C:\tmp\fix_t4_firebase_setby.py`

### What's broken

`_firebaseSyncAdminAppointment` only includes `setBy` in the `cancelled` payload. The `appointment_set` payload has no `setBy` field. So `app.js` listener cannot tell whether the appointment was set by driver or admin → shows "המנהל שינה" toast even when driver set it from another device.

Additionally, `_garageSetAppointment` (driver sets own appointment) calls `_firebaseSyncAdminAppointment` without `setBy`, so the Firebase node never carries `setBy='driver'`.

### Fix

- `_firebaseSyncAdminAppointment`: include `setBy` in the appointment_set payload
- `_garageSetAppointment` (L14689): pass `'driver'` as 6th arg
- `adminSetAppointment` (L17717 area): pass `'admin'` as 6th arg to Firebase sync — already passes 5 args, add 6th
- `adminCreateAppointment` (L17717): pass `'admin'` as 6th arg

- [ ] **Step 1: Backup**

```powershell
python "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\backup.py"
```

- [ ] **Step 2: Write patcher**

Create `C:\tmp\fix_t4_firebase_setby.py`:

```python
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

results = []
N = b'\r\n'

def rb(raw, old, new, label, count=1):
    if old not in raw:
        results.append(f'WARNING: anchor not found — {label}')
        return raw
    n = raw.count(old)
    if n > count:
        results.append(f'WARNING: anchor appears {n}x (expected {count}) — {label}')
        return raw
    results.append(f'OK: {label}')
    return raw.replace(old, new, count)

code_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js'
with open(code_path, 'rb') as f:
    code = f.read()
orig_size = len(code)

# ── 4a: _firebaseSyncAdminAppointment — include setBy in appointment_set payload
code = rb(code,
    b"  var payload = date" + N +
    b"    ? { status: 'appointment_set', eventId: eventId, appointmentDate: date, appointmentTime: time," + N +
    b"        managerNote: note||'', updatedAt: Date.now(), consumed: false }" + N +
    b"    : { status: 'cancelled', eventId: eventId, updatedAt: Date.now(), consumed: false, setBy: setBy || '' };",
    b"  var payload = date" + N +
    b"    ? { status: 'appointment_set', eventId: eventId, appointmentDate: date, appointmentTime: time," + N +
    b"        managerNote: note||'', setBy: setBy || '', updatedAt: Date.now(), consumed: false }" + N +
    b"    : { status: 'cancelled', eventId: eventId, updatedAt: Date.now(), consumed: false, setBy: setBy || '' };",
    "B4: appointment_set payload includes setBy"
)

# ── 4b: _garageSetAppointment — pass 'driver' as 6th arg to Firebase sync
code = rb(code,
    b"        if (_fbVid2) _firebaseSyncAdminAppointment(_fbVid2, params.eventId, params.appointmentDate, params.appointmentTime || '', '');",
    b"        if (_fbVid2) _firebaseSyncAdminAppointment(_fbVid2, params.eventId, params.appointmentDate, params.appointmentTime || '', '', 'driver');",
    "B4: _garageSetAppointment pass setBy=driver to Firebase"
)

# ── 4c: adminCreateAppointment — pass 'admin' as 6th arg to Firebase sync
code = rb(code,
    b"      _firebaseSyncAdminAppointment(firebaseVehKey, eventId, appointmentDate, appointmentTime, managerNote);",
    b"      _firebaseSyncAdminAppointment(firebaseVehKey, eventId, appointmentDate, appointmentTime, managerNote, 'admin');",
    "B4: adminCreateAppointment pass setBy=admin to Firebase"
)

assert len(code) > orig_size - 10, f'SAFETY: code.js shrank'
with open(code_path + '.tmp', 'wb') as f: f.write(code)
os.replace(code_path + '.tmp', code_path)
print(f'code.js done: {orig_size} -> {len(code)} bytes')
for r in results: print(r)
```

- [ ] **Step 3: Run patcher**

```powershell
python "C:\tmp\fix_t4_firebase_setby.py"
```

Expected:
```
OK: B4: appointment_set payload includes setBy
OK: B4: _garageSetAppointment pass setBy=driver to Firebase
OK: B4: adminCreateAppointment pass setBy=admin to Firebase
```

- [ ] **Step 4: Verify adminSetAppointment also passes setBy**

```powershell
python -c "
code=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js','rb').read()
# Find _firebaseSyncAdminAppointment calls — count args
import re
calls = re.findall(rb'_firebaseSyncAdminAppointment\([^)]+\)', code)
for c in calls: print(c.decode('utf-8', errors='replace'))
"
```

Verify all calls have 6 args. If `adminSetAppointment`'s call has only 5, note it — it already passes `'admin'` via the existing call site (check manually: it was added in the original conflict-resolution plan T4).

- [ ] **Step 5: Git commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add code.js
git commit -m "fix(garage): B4 Firebase appointment_set payload includes setBy field"
```

---

## Task 5 — app.js: PWA fixes (B4-app, B5, B6)

**Files:**
- Modify: `C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js`
- Patcher: `C:\tmp\fix_t5_appjs.py`

### What's broken

**B4-app:** Change-detection toast says "המנהל שינה" even when driver set from another device (now fixable with `data.setBy`).

**B5:** Staleness guard at L1251: `if (_localAge > _fbAge && _localApptCheck.eventId === data.eventId)` — fires when FCM updates localStorage milliseconds before Firebase listener runs. Should only skip when local is newer AND the appointment data is identical (same date+time). Otherwise let the newer Firebase data through.

**B6:** When `data.setBy === 'driver'` (cancelled), toast is `null` on ALL devices including device B that didn't initiate the cancel. Should show a soft `'✅ התור בוטל'` so driver knows it worked.

Note: `app.js` uses LF (not CRLF). Use `N = b'\n'` in patcher.

- [ ] **Step 1: Backup**

```powershell
python "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\backup.py"
```

- [ ] **Step 2: Write patcher**

Create `C:\tmp\fix_t5_appjs.py`:

```python
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

results = []
N = b'\n'  # app.js uses LF

def rb(raw, old, new, label, count=1):
    if old not in raw:
        results.append(f'WARNING: anchor not found — {label}')
        return raw
    n = raw.count(old)
    if n > count:
        results.append(f'WARNING: anchor appears {n}x (expected {count}) — {label}')
        return raw
    results.append(f'OK: {label}')
    return raw.replace(old, new, count)

app_path = r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js'
with open(app_path, 'rb') as f:
    app = f.read()
orig_size = len(app)

# ── B5: tighten staleness guard — only skip if date+time also match ───────────
app = rb(app,
    b"        if (_localAge > _fbAge && _localApptCheck.eventId === (data.eventId || '')) {" + N +
    b"          // Local is strictly newer AND same event -- Firebase is stale, mark consumed and skip" + N +
    b"          if (!data.consumed) snap.ref.update({ consumed: true, consumedAt: Date.now() });" + N +
    b"          return;" + N +
    b"        }",
    b"        var _sameApptData = _localApptCheck" + N +
    b"          && _localApptCheck.appointmentDate === data.appointmentDate" + N +
    b"          && (_localApptCheck.appointmentTime || '') === (data.appointmentTime || '');" + N +
    b"        if (_localAge > _fbAge && _localApptCheck.eventId === (data.eventId || '') && _sameApptData) {" + N +
    b"          // Local is strictly newer AND same event AND same data -- Firebase is stale, mark consumed and skip" + N +
    b"          if (!data.consumed) snap.ref.update({ consumed: true, consumedAt: Date.now() });" + N +
    b"          return;" + N +
    b"        }",
    "B5: tighten staleness guard to check date+time match"
)

# ── B4-app: change-detection toast guards on data.setBy !== 'driver' ──────────
# Hebrew: \xd7\x94\xd7\x9e\xd7\xa0\xd7\x94\xd7\x9c \xd7\xa9\xd7\x99\xd7\xa0\xd7\x94 \xd7\x90\xd7\xaa \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c\xd7\x9a \xd7\x9c-
# Hebrew: \xe2\x9c\x85 \xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa0\xd7\xa7\xd7\x91\xd7\xa2 \xd7\x9c-
app = rb(app,
    b"          var _toastMsg = _dateChanged" + N +
    b"            ? '\xf0\x9f\x94\x84 \xd7\x94\xd7\x9e\xd7\xa0\xd7\x94\xd7\x9c \xd7\xa9\xd7\x99\xd7\xa0\xd7\x94 \xd7\x90\xd7\xaa \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c\xd7\x9a \xd7\x9c-' + _aSet.appointmentDate + ' \xd7\x91\xd7\xa9\xd7\xa2\xd7\x94 ' + _aSet.appointmentTime" + N +
    b"            : '\xe2\x9c\x85 \xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa0\xd7\xa7\xd7\x91\xd7\xa2 \xd7\x9c-' + _aSet.appointmentDate + ' \xd7\x91\xd7\xa9\xd7\xa2\xd7\x94 ' + _aSet.appointmentTime;",
    b"          var _isAdminChange = data.setBy !== 'driver';" + N +
    b"          var _toastMsg = (_dateChanged && _isAdminChange)" + N +
    b"            ? '\xf0\x9f\x94\x84 \xd7\x94\xd7\x9e\xd7\xa0\xd7\x94\xd7\x9c \xd7\xa9\xd7\x99\xd7\xa0\xd7\x94 \xd7\x90\xd7\xaa \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa9\xd7\x9c\xd7\x9a \xd7\x9c-' + _aSet.appointmentDate + ' \xd7\x91\xd7\xa9\xd7\xa2\xd7\x94 ' + (_aSet.appointmentTime || '')" + N +
    b"            : '\xe2\x9c\x85 \xd7\xaa\xd7\x95\xd7\xa8 \xd7\xa0\xd7\xa7\xd7\x91\xd7\xa2 \xd7\x9c-' + _aSet.appointmentDate + ' \xd7\x91\xd7\xa9\xd7\xa2\xd7\x94 ' + (_aSet.appointmentTime || '');",
    "B4-app: guard change-detection toast on data.setBy !== driver + appointmentTime guard"
)

# ── B6: driver self-cancel on device B — show soft toast ─────────────────────
# Hebrew: \xd7\xa0\xd7\x94\xd7\x92 = driver, driver cancelled = \xe2\x9c\x85 \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\x91\xd7\x95\xd7\x98\xd7\x9c
app = rb(app,
    b"            var _cToast = data.setBy === 'driver'" + N +
    b"              ? null // driver cancelled themselves - no toast (they already know)" + N +
    b"              : (data.setBy === 'admin' || !data.setBy)" + N +
    b"              ? '\xe2\x9d\x8c \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\x91\xd7\x95\xd7\x98\xd7\x9c \xd7\xa2\xd7\x9c \xd7\x99\xd7\x93\xd7\x99 \xd7\x94\xd7\x9e\xd7\xa0\xd7\x94\xd7\x9c' : null;",
    b"            var _cToast = data.setBy === 'driver'" + N +
    b"              ? '\xe2\x9c\x85 \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\x91\xd7\x95\xd7\x98\xd7\x9c' // driver cancelled - soft confirm on all devices" + N +
    b"              : '\xe2\x9d\x8c \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\x91\xd7\x95\xd7\x98\xd7\x9c \xd7\xa2\xd7\x9c \xd7\x99\xd7\x93\xd7\x99 \xd7\x94\xd7\x9e\xd7\xa0\xd7\x94\xd7\x9c'; // admin or unknown setBy",
    "B6: driver self-cancel shows soft toast on device B + B-unknown-setBy fallback"
)

assert len(app) > orig_size - 50, f'SAFETY: app.js lost more than 50 bytes'
with open(app_path + '.tmp', 'wb') as f: f.write(app)
os.replace(app_path + '.tmp', app_path)
print(f'app.js done: {orig_size} -> {len(app)} bytes')
for r in results: print(r)
```

- [ ] **Step 3: Run patcher**

```powershell
python "C:\tmp\fix_t5_appjs.py"
```

Expected:
```
OK: B5: tighten staleness guard to check date+time match
OK: B4-app: guard change-detection toast on data.setBy !== driver + appointmentTime guard
OK: B6: driver self-cancel shows soft toast on device B + B-unknown-setBy fallback
```

- [ ] **Step 4: Verify**

```powershell
python -c "
app=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js','rb').read()
print('B5 ok:', b'_sameApptData' in app)
print('B4 ok:', b'_isAdminChange' in app)
print('B6 ok:', b\"'\xe2\x9c\x85 \xd7\x94\xd7\xaa\xd7\x95\xd7\xa8 \xd7\x91\xd7\x95\xd7\x98\xd7\x9c'\" in app)
"
```

- [ ] **Step 5: Git commit**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
git add app.js
git commit -m "fix(driver-pwa): B4 setBy guard on toast, B5 staleness guard, B6 device-B cancel toast"
```

---

## Task 6 — Deploy GAS + final verification

**Files:** GAS deployment only

- [ ] **Step 1: Verify code.js size (truncation guard)**

```powershell
python -c "
import os
sz = os.path.getsize(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js')
print(f'code.js: {sz:,} bytes')
assert sz > 900000, f'DANGER: code.js too small ({sz} bytes) — do not push'
print('Size OK')
"
```

- [ ] **Step 2: Scan for JS string escaping issues**

```powershell
python -c "
code=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js','r',encoding='utf-8').read()
html=open(r'C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html','r',encoding='utf-8').read()
import re
issues = re.findall(r\"font-family:'[^']*'\", code+html)
print('font-family issues:', issues or 'none')
"
```

- [ ] **Step 3: clasp push**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
clasp push
```

Expected: `Pushed N files.` with no errors.

- [ ] **Step 4: Verify GAS deployment**

In GAS Apps Script editor, run `getGarageRequests` and verify output includes `appointmentSetBy` field.

- [ ] **Step 5: Final git commit for GAS files**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
git add code.js index.html
git commit -m "deploy(garage): push GAS V+1 with all conflict-resolution bugfixes"
```

- [ ] **Step 6: Create QA document**

Create `driver/docs/qa/2026-05-26-conflict-resolution-bugfixes-qa.md` with:
- Bug list, fix per bug, test matrix
- Link this plan
- Git commit

---

## Test Matrix

| Scenario | Expected | Verified? |
|----------|----------|-----------|
| Admin opens appointment modal for driver-set event (via event card) | Conflict modal shows with driver name + date | Pending |
| Admin opens appointment modal for driver-set event (via vehicle dropdown) | Conflict modal shows (was bypassed before B2 fix) | Pending |
| Admin clicks "דרוס וקבע חדש" | Both overlays close, calendar refreshes | Pending |
| Admin clicks "שמור תור נהג" | Both overlays close, calendar refreshes, no write | Pending |
| Admin clicks backdrop of conflict modal | Modal closes | Pending |
| Admin sets same date+time as existing admin appointment | "תור זה כבר קיים" alert (noop) | Pending |
| Driver appointment badge (⚙️) shows in banner | Shows correct green/gray label | Pending |
| Driver cancels from phone → tablet | Tablet shows "✅ התור בוטל" | Pending |
| Admin cancels driver-set appointment | Driver gets "המנהל ביטל את התור שקבעת" FCM | Pending |
| Driver sets from phone → admin sees Firebase change-detection | Fleet Manager gets toast "נהג קבע תור" | Pending |
