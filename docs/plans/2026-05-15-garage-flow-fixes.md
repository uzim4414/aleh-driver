# Garage Request Flow — Bug Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** תיקון כל הבאגים בזרימת בקשת כניסה למוסך: אישור תור נכשל, תפריט לא מתאפס, requestNumber חסר, garageInfo לא נשלח, אין ownership check, כפילות בקשות, שגיאות פולינג שקטות.

**Architecture:** שמונה תיקונים ב-`app.js` (client-side) + שלושה תיקונים ב-`code.js` (GAS backend). אין קבצים חדשים. כל תיקון עצמאי ואפשר לבדוק אותו בנפרד. סדר ביצוע: GAS fixes → client fixes → deploy → commit.

**Tech Stack:** PWA vanilla JS, localStorage, gasPost helper, Google Apps Script, FIELD_EVENTS Google Sheet, Web Push / Cloud Run.

---

## רקע — ניתוח שורשי הבאגים

### למה "קבע תור" כושל?
`_garageConfirmAppointment` קורא `gasPost('garage_set_appointment', ...)` **ללא** `{ silent: true }`. אם הטוקן פג, GAS מחזיר `{ ok: false, error: 'unauthorized' }` → `gasPost` מציג overlay "תוקף הסשן פג" מעל הכל → זו "הודעת השגיאה" שהנהג רואה.

בנוסף, ב-GAS ב-`_garageSetAppointment`: `var apptIdx = headers.indexOf('appointmentDate')`. אם עמודה זו לא קיימת בגיליון → `apptIdx = -1` → `sheet.getRange(row, 0)` → שגיאת GAS → `{ ok: false, error: 'server_error' }`.

### למה התפריט לא מתאפס אחרי אישור תור?
כי הקביעה נכשלת → `result.ok === false` → `_garageClearApproved()` לא נקרא → `approvedGarageRequest` נשאר ב-localStorage → בפתיחה הבאה של תפריט המוסך, `helpGarage()` מוצא approved → מציג מסך אישור במקום בחירת סיבה.
**תיקון**: fix appointment → clearing קורה אוטומטית.

### למה requestNumber חסר במסך האישור?
שני מסלולים שומרים `approvedGarageRequest` ב-localStorage בלי `requestNumber`:
1. `_garagePollStatus` (כשפולינג מחזיר 'approved')
2. `_garageShowApprovedFromStorage` (כשנקרא עם meta בלבד)

מסלול ה-Push (`saveNotifToHistory`) כבר שומר נכון — הבעיה רק בשניים האלו.

### למה garageInfo לא מגיע חזרה מהשרת?
`_garageSubmitRequest` שולח `garageId/garageName/garageAddress` כ-strings ריקים (לא מאוכלסים ב-`APP._garageCtx`) ולא שולח `garageInfo` כ-object. כשמנהל מאשר, GAS מחפש `details.garageInfo || null` → null. מסך האישור מסתמך על `STATE.vehicle.garage` שעלול להיות לא מעודכן.

---

## מבנה קבצים

```
Fleet manager/
  driver/
    app.js          ← 6 תיקונים (Tasks 1-6)
  13.4.26/
    code.js         ← 3 תיקונים (Tasks 7-9)
```

---

## Task 1: Fix `_garageConfirmAppointment` — appointment error + missing silent

**File:** `Fleet manager/driver/app.js:3008-3037`

**שורש הבעיה:** (א) חסר `{ silent: true }` → token expired מציג overlay. (ב) בהצלחה: `result.ok=true` אך הקוד בודק `if (typeof APP._garageClearApproved === 'function')` — פונקציה קיימת אבל הבדיקה מיותרת. (ג) `eventId` נגזר מה-DOM (onclick attribute) — אבל אם `eventId` ריק, `garage_set_appointment` לא מוצא שורה → `not_found`.

- [x] **Step 1: מצא את הפונקציה**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "APP._garageConfirmAppointment" | Select-Object -First 5
```

Expected: line 3008.

- [x] **Step 2: החלף את כל `APP._garageConfirmAppointment`**

מצא:
```javascript
APP._garageConfirmAppointment = async function(eventId) {
  var dateVal = ((document.getElementById('garage-appt-date') || {}).value || '').trim();
  if (!dateVal) { showToast('יש לבחור תאריך'); return; }
  var btn = document.querySelector('.help-action-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
  var result;
  try {
    result = await gasPost('garage_set_appointment', { eventId: eventId, appointmentDate: dateVal });
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📨 אשר תאריך תור'; }
    showToast('שגיאה — נסה שוב');
    return;
  }
  if (result && result.ok) {
    APP._garageClearPending();
    if (typeof APP._garageClearApproved === 'function') APP._garageClearApproved();
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:32px 20px">' +
      '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">תור נקבע!</div>' +
      '<div style="font-size:14px;color:#94a3b8;margin-bottom:6px">תאריך: <b style="color:#f1f5f9">' + dateVal.split('-').reverse().join('/') + '</b></div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px">מנהל הצי קיבל עדכון</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
  } else {
    if (btn) { btn.disabled = false; btn.textContent = '📨 אשר תאריך תור'; }
    showToast('שגיאה — נסה שוב');
  }
};
```

החלף ב:
```javascript
APP._garageConfirmAppointment = async function(eventId) {
  var dateVal = ((document.getElementById('garage-appt-date') || {}).value || '').trim();
  if (!dateVal) { showToast('יש לבחור תאריך'); return; }
  if (!eventId) { showToast('מזהה אירוע חסר — פנה למנהל'); return; }
  var btn = document.querySelector('.help-action-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
  try {
    var result = await gasPost('garage_set_appointment',
      { eventId: eventId, appointmentDate: dateVal },
      { silent: true }
    );
    if (result && result.ok) {
      APP._garageClearPending();
      APP._garageClearApproved();
      _showHelpCard(
        '<div class="help-card" style="text-align:center;padding:32px 20px">' +
        '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">תור נקבע!</div>' +
        '<div style="font-size:14px;color:#94a3b8;margin-bottom:6px">תאריך: <b style="color:#f1f5f9">' + dateVal.split('-').reverse().join('/') + '</b></div>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px">מנהל הצי קיבל עדכון</div>' +
        '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
        '</div>'
      );
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📨 אשר תאריך תור'; }
      var errCode = (result && result.error) || 'unknown';
      console.error('[garageAppt] GAS error:', errCode);
      if (errCode === 'not_found') {
        showToast('האירוע לא נמצא — נסה לסגור ולפתוח מחדש');
      } else if (errCode === 'unauthorized') {
        showToast('נדרש אימות מחדש — התחבר שוב');
      } else {
        showToast('שגיאה בקביעת תור (' + errCode + ') — נסה שוב');
      }
    }
  } catch(e) {
    console.error('_garageConfirmAppointment:', e);
    if (btn) { btn.disabled = false; btn.textContent = '📨 אשר תאריך תור'; }
    showToast('שגיאה — נסה שוב');
  }
};
```

- [x] **Step 3: אמת שהפונקציה עודכנה**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "silent.*true|silent: true" | Where-Object { $_.LineNumber -gt 3000 -and $_.LineNumber -lt 3100 }
```

Expected: מוצא שורה עם `silent: true` ליד `garage_set_appointment`.

---

## Task 2: Fix `requestNumber` + `managerNote` missing in `approvedGarageRequest`

**File:** `Fleet manager/driver/app.js`

**שני מיקומים לתקן:**

### 2A — `_garagePollStatus` (כשפולינג מחזיר 'approved')

- [x] **Step 1: מצא את המיקום**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "approvedGarageRequest.*JSON.stringify" | Select-Object -First 5
```

Expected: שורות ~2920 ו-~2848.

- [x] **Step 2: תקן את הסייב ב-`_garagePollStatus`**

מצא בתוך `_garagePollStatus` (השמירה כשמגיע 'approved' מהפולינג):
```javascript
        try {
          localStorage.setItem('approvedGarageRequest', JSON.stringify({
            eventId: pending.eventId,
            reasonLabel: r.reasonLabel || pending.reasonLabel || '',
            approvedAt: Date.now()
          }));
        } catch(e) {}
```

החלף ב:
```javascript
        try {
          var _reqMatch = String(pending.eventId || '').match(/-(\d+)$/);
          var _reqNum   = _reqMatch ? String(parseInt(_reqMatch[1], 10)) : '';
          localStorage.setItem('approvedGarageRequest', JSON.stringify({
            eventId:       pending.eventId,
            reasonLabel:   r.reasonLabel   || pending.reasonLabel || '',
            requestNumber: _reqNum,
            managerNote:   r.managerNote   || '',
            approvedAt:    Date.now()
          }));
        } catch(e) {}
```

### 2B — `_garageShowApprovedFromStorage` (כשנקרא עם meta בלבד)

- [x] **Step 3: תקן את הסייב ב-`_garageShowApprovedFromStorage`**

מצא:
```javascript
    try {
      localStorage.setItem('approvedGarageRequest', JSON.stringify({
        eventId: meta.eventId, reasonLabel: meta.reasonLabel || '', approvedAt: Date.now()
      }));
    } catch(e) {}
```

החלף ב:
```javascript
    try {
      localStorage.setItem('approvedGarageRequest', JSON.stringify({
        eventId:       meta.eventId,
        reasonLabel:   meta.reasonLabel   || '',
        requestNumber: meta.requestNumber || '',
        managerNote:   meta.managerNote   || '',
        approvedAt:    meta.approvedAt    || Date.now()
      }));
    } catch(e) {}
```

---

## Task 3: Fix `garageInfo` + `driverName` in `_garageSubmitRequest`

**File:** `Fleet manager/driver/app.js`

**שתי בעיות:**
1. `garageId/garageName/garageAddress` תמיד ריקים — לא מאוכלסים ב-`APP._garageCtx` לפני הקריאה
2. `driverName: (STATE.userInfo && STATE.userInfo.name) || ''` — `STATE.userInfo` לא קיים → תמיד ריק
3. `garageInfo` (אובייקט מלא עם פרטי קשר) לא נשלח כלל → GAS לא יכול להחזיר אותו בפולינג

- [x] **Step 1: מצא `APP.helpGarage` שורת האתחול של `APP._garageCtx`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "_garageCtx\s*=" | Select-Object -First 5
```

Expected: שורות שמגדירות `_garageCtx`.

- [x] **Step 2: אתחל `_garageCtx` עם garageInfo ב-`APP.helpGarage`**

מצא בתוך `APP.helpGarage`:
```javascript
  var g = (STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : null;
  var garageName = (g && g.name) ? g.name : '';
  var garageAddr = (g && g.address) ? g.address : '';
  var garageId   = (g && g.id) ? g.id : '';
```

הוסף ישירות אחרי השורות האלו:
```javascript
  APP._garageCtx = APP._garageCtx || {};
  APP._garageCtx.garageId      = (g && g.id)      || '';
  APP._garageCtx.garageName    = (g && g.name)     || '';
  APP._garageCtx.garageAddress = (g && g.address)  || '';
  APP._garageCtx.garageInfo    = APP._garageBuildInfoFromState();
```

- [x] **Step 3: תקן `details` ב-`_garageSubmitRequest`**

מצא:
```javascript
    var details = {
      reason: ctx.reasonId,
      reasonLabel: ctx.reasonLabel,
      garageId: ctx.garageId || '',
      garageName: ctx.garageName || '',
      garageAddress: ctx.garageAddress || '',
      km: ctx.km || 0,
      kmToService: ctx.kmToService != null ? ctx.kmToService : null,
      description: ctx.description || '',
      licensePlate: ctx.licensePlate || v.num || '',
      driverName: (STATE.userInfo && STATE.userInfo.name) || ''
    };
```

החלף ב:
```javascript
    var details = {
      reason:        ctx.reasonId      || '',
      reasonLabel:   ctx.reasonLabel   || '',
      garageId:      ctx.garageId      || '',
      garageName:    ctx.garageName    || '',
      garageAddress: ctx.garageAddress || '',
      garageInfo:    ctx.garageInfo    || APP._garageBuildInfoFromState(),
      km:            ctx.km            || 0,
      kmToService:   ctx.kmToService   != null ? ctx.kmToService : null,
      description:   ctx.description   || '',
      licensePlate:  ctx.licensePlate  || v.num || '',
      driverName:    (STATE.user && STATE.user.name) || (v.holder) || ''
    };
```

---

## Task 4: Fix polling — error feedback after repeated failures

**File:** `Fleet manager/driver/app.js`

**בעיה:** `try { ... } catch(e) { console.warn(...) }` — רשת מתה = UI קפוא על ⏳ לנצח ללא הסבר לנהג.

- [x] **Step 1: מצא `_garagePollStatus`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "APP._garagePollStatus" | Select-Object -First 3
```

Expected: line ~2900.

- [x] **Step 2: הוסף failure counter לפולינג**

מצא:
```javascript
APP._garagePollStatus = function(pending) {
  if (!pending || !pending.eventId) return;
  APP._garageStopPoll();

  var check = async function() {
    try {
      var r = await gasPost('get_garage_status', { eventId: pending.eventId }, { silent: true });
      if (!r || !r.ok) return;
```

החלף ב:
```javascript
APP._garagePollStatus = function(pending) {
  if (!pending || !pending.eventId) return;
  APP._garageStopPoll();

  var _pollFailures = 0;
  var check = async function() {
    try {
      var r = await gasPost('get_garage_status', { eventId: pending.eventId }, { silent: true });
      if (!r || !r.ok) {
        _pollFailures++;
        if (_pollFailures >= 5) {
          APP._garageStopPoll();
          showToast('לא ניתן לבדוק סטטוס — בדוק חיבור לאינטרנט');
        }
        return;
      }
      _pollFailures = 0;
```

---

## Task 5: Fix `_garageSubmitRequest` — duplicate pending request handling

**File:** `Fleet manager/driver/app.js`

**בעיה:** אם שרת מחזיר `duplicate_pending_request` (לאחר תיקון GAS ב-Task 8), הקוד הנוכחי מציג toast שגיאה גנרי במקום לסנכרן את הבקשה הקיימת.

- [x] **Step 1: מצא את ה-else של הגשת הבקשה**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "שגיאה בשליחה" | Select-Object -First 3
```

Expected: שורה ב-`_garageSubmitRequest`.

- [x] **Step 2: הוסף טיפול ב-duplicate_pending_request**

מצא:
```javascript
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📨 שלח בקשה לאישור מנהל'; }
      showToast('שגיאה בשליחה: ' + (result.error || 'נסה שוב'));
    }
```

(זוהי ה-else branch שמגיעה אחרי בלוק ה-success של `_garageSubmitRequest`)

החלף ב:
```javascript
    } else if (result && result.error === 'duplicate_pending_request') {
      // שרת מצא בקשה פעילה — סנכרן אותה לocally והצג מסך המתנה
      var dupEventId = result.eventId || '';
      var ctx2 = APP._garageCtx || {};
      try {
        localStorage.setItem('pendingGarageRequest', JSON.stringify({
          eventId:     dupEventId,
          reason:      ctx2.reasonId    || '',
          reasonLabel: ctx2.reasonLabel || '',
          submittedAt: Date.now()
        }));
      } catch(_e) {}
      if (btn) { btn.disabled = false; }
      var dup = APP._garageGetPending();
      if (dup) { APP._garageShowPending(dup); APP._garagePollStatus(dup); }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📨 שלח בקשה לאישור מנהל'; }
      showToast('שגיאה בשליחה: ' + ((result && result.error) || 'נסה שוב'));
    }
```

---

## Task 6: Fix `_garageShowPending` — add "בדוק סטטוס" button + start polling immediately

**File:** `Fleet manager/driver/app.js`

**בעיה:** כש-`helpGarage()` קוראת ל-`_garageShowPending` ואז ל-`_garagePollStatus`, הפולינג מתחיל אבל הנהג לא יודע שהוא פעיל. אם הוא פותח מחדש את התפריט — `_garagePollStatus` נקרא שוב עם `setInterval` חדש, ויוצר polling כפול.

- [x] **Step 1: מצא `_garageStopPoll` ב-`APP.helpGarage`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "_garageShowPending.*pending.*_garagePollStatus" | Select-Object -First 3
```

- [x] **Step 2: וודא שהפולינג נעצר לפני פתיחת תפריט חדש ב-`APP.helpGarage`**

מצא:
```javascript
  var pending = APP._garageGetPending();
  if (pending) { APP._garageShowPending(pending); APP._garagePollStatus(pending); return; }
```

`_garagePollStatus` כבר קורא `APP._garageStopPoll()` בתחילתו — בסדר. אין צורך לשנות.

- [x] **Step 3: הוסף timestamp לhelpGarage כדי שנהג יראה מתי הגיש**

מצא ב-`_garageShowPending`:
```javascript
    (since ? '<div style="font-size:12px;color:#64748b;margin-bottom:16px">נשלח: ' + since + '</div>' : '') +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:20px">ממתין לאישור מנהל הצי. תקבל הודעה כשהבקשה תאושר.</div>' +
```

החלף ב:
```javascript
    (since ? '<div style="font-size:12px;color:#64748b;margin-bottom:16px">נשלח: ' + since + '</div>' : '') +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:12px">ממתין לאישור מנהל הצי. תקבל התראה push כשהבקשה תאושר.</div>' +
    '<div id="garage-poll-status" style="font-size:11px;color:#64748b;margin-bottom:16px">בודק סטטוס...</div>' +
```

זה מציג indicator שהפולינג פעיל. (אופציונלי — אפשר לדלג על Step 3 אם מורכב מדי)

---

## Task 7: GAS — Fix `_garageSetAppointment` (ownership check + column guard + loadSettings)

**File:** `Fleet manager/13.4.26/code.js`

**שלוש בעיות:**
1. `headers.indexOf('appointmentDate')` → אם -1, `getRange(row, 0)` זורק שגיאה
2. אין ownership check (auth.vehicleId ≠ row vehicleId)
3. `_loadSettings()` ללא `ss` — פוטנציאלי לתקלות

- [x] **Step 1: מצא את `_garageSetAppointment`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "function _garageSetAppointment" | Select-Object -First 3
```

Expected: line ~13245.

- [x] **Step 2: מצא והחלף את החלק הקריטי של הפונקציה**

מצא:
```javascript
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) !== String(params.eventId)) continue;
      var row = i + 1;
      sheet.getRange(row, statusIdx + 1).setValue('appointment_set');
      sheet.getRange(row, apptIdx + 1).setValue(params.appointmentDate);
```

החלף ב:
```javascript
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) !== String(params.eventId)) continue;
      // ownership check — רק הנהג שהגיש יכול לקבוע תור
      if (String(data[i][vehIdx] || '') !== String(auth.vehicleId || '')) {
        Logger.log('[_garageSetAppointment] unauthorized: auth.vehicleId=' + auth.vehicleId + ' row vehicleId=' + data[i][vehIdx]);
        return { ok: false, error: 'unauthorized' };
      }
      var row = i + 1;
      if (apptIdx < 0) {
        Logger.log('[_garageSetAppointment] missing appointmentDate column');
        return { ok: false, error: 'missing_column_appointmentDate' };
      }
      sheet.getRange(row, statusIdx + 1).setValue('appointment_set');
      sheet.getRange(row, apptIdx + 1).setValue(params.appointmentDate);
```

- [x] **Step 3: תקן `_loadSettings()` → `_loadSettings(ss)`**

מצא בתוך `_garageSetAppointment`:
```javascript
      var settings = _loadSettings();
```

החלף ב:
```javascript
      var settings = _loadSettings(ss);
```

---

## Task 8: GAS — Fix `_driverFieldEvent` — prevent duplicate pending garage_request

**File:** `Fleet manager/13.4.26/code.js`

**בעיה:** נהג שלוחץ כפתור מהר → כמה שורות בגיליון.

- [x] **Step 1: מצא `if (!_veh) return` בתוך `_driverFieldEvent`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "no_vehicle_found" | Select-Object -First 3
```

Expected: שורה בתוך `_driverFieldEvent`.

- [x] **Step 2: הוסף dedup check אחרי קביעת `sh`**

מצא:
```javascript
    if (!_veh) return { ok: false, error: 'no_vehicle_found' };
    var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
    if (!sh) { _ensureSheet(ss, CFG.SH.FIELD_EVENTS, FIELD_EVENTS_COLS); sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS); }
    var now = new Date();
```

החלף ב:
```javascript
    if (!_veh) return { ok: false, error: 'no_vehicle_found' };
    var sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
    if (!sh) { _ensureSheet(ss, CFG.SH.FIELD_EVENTS, FIELD_EVENTS_COLS); sh = ss.getSheetByName(CFG.SH.FIELD_EVENTS); }

    // מנע כפילות: אם יש בקשת מוסך פעילה (pending) לאותו רכב — החזר את ה-eventId הקיים
    if (params.type === 'garage_request') {
      var existingRows = sh.getDataRange().getValues();
      var eHeaders     = existingRows[0] || [];
      var eVehIdx      = eHeaders.indexOf('vehicleId');
      var eTypeIdx     = eHeaders.indexOf('type');
      var eStatusIdx   = eHeaders.indexOf('status');
      var eEventIdIdx  = eHeaders.indexOf('eventId');
      for (var ei = 1; ei < existingRows.length; ei++) {
        if (String(existingRows[ei][eVehIdx])   === String(_veh.id) &&
            String(existingRows[ei][eTypeIdx])   === 'garage_request' &&
            String(existingRows[ei][eStatusIdx]) === 'pending') {
          var existingEventId = String(existingRows[ei][eEventIdIdx] || '');
          Logger.log('[_driverFieldEvent] duplicate pending garage_request for ' + _veh.id + ' existing: ' + existingEventId);
          return { ok: false, error: 'duplicate_pending_request', eventId: existingEventId };
        }
      }
    }

    var now = new Date();
```

---

## Task 9: GAS — Fix `_garageRequestAction` — include garageInfo from GARAGES/vehicle sheet

**File:** `Fleet manager/13.4.26/code.js`

**בעיה:** FCM payload לא כולל `garageInfo` מלא (שם מוסך, טלפון, כתובת). הנהג מסתמך על `STATE.vehicle.garage` שיכול להיות ישן. המידע קיים בגיליון הרכב (`garageId` שמור ב-`details`).

- [x] **Step 1: מצא `_garageRequestAction` ואת בניית ה-FCM payload**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "var pushResult = _sendFcmToDriver" | Select-Object -First 3
```

Expected: line ~13222.

- [x] **Step 2: הוסף garageInfo ל-FCM payload**

מצא את בניית `pushResult`:
```javascript
      var pushResult = _sendFcmToDriver(vehicleId, title, body, {
        vehicleId: vehicleId,
        alertType: params.action === 'approve' ? 'garage_approved' : 'garage_rejected',
        eventId: params.eventId,
        requestNumber: requestNumber,
        reasonLabel: reasonLabel,
        originalDescription: origDescription,
        managerNote: noteText,
        click_action: '#garage/' + vehicleId
      });
```

החלף ב:
```javascript
      // Build garageInfo from details (sent by driver at request time)
      var garageInfo = details.garageInfo || {
        name:        details.garageName    || '',
        address:     details.garageAddress || '',
        id:          details.garageId      || '',
        phone:       '',
        contactName: '',
        bookingUrl:  ''
      };
      var pushResult = _sendFcmToDriver(vehicleId, title, body, {
        vehicleId:           vehicleId,
        alertType:           params.action === 'approve' ? 'garage_approved' : 'garage_rejected',
        eventId:             params.eventId,
        requestNumber:       requestNumber,
        reasonLabel:         reasonLabel,
        originalDescription: origDescription,
        managerNote:         noteText,
        garageInfo:          garageInfo,
        click_action:        '#garage/' + vehicleId
      });
```

---

## Task 10: GAS Deploy

**File:** `Fleet manager/13.4.26/`

- [x] **Step 1: Push לGAS**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
clasp push
```

Expected output: `Pushed N files.` (לא "already up to date").

אם "already up to date" → הפעל deploy ישיר:

- [x] **Step 2: Deploy לproduction**

```powershell
clasp deploy -i AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP -d "V1.1904 garage flow fixes"
```

Expected: `Deployed ... @NNNN`

---

## Task 11: Git commit + push

**File:** `Fleet manager/driver/`

- [x] **Step 1: Stage app.js**

```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
git add app.js
git status
```

Expected: `modified: app.js`

- [x] **Step 2: Commit**

```bash
git commit -m "fix: garage flow — appointment silent, requestNumber, garageInfo, dedup, polling feedback"
```

- [x] **Step 3: Push**

```bash
git push origin main
```

Expected: `main -> main`

---

## בדיקות ידניות (לאחר deploy)

| # | בדיקה | תוצאה צפויה |
|---|-------|-------------|
| 1 | נהג לוחץ "כן קבעתי תור" → בוחר תאריך → לוחץ "אשר" | תור נקבע ✓, מסך 🎉 מוצג |
| 2 | סגור תפריט → פתח מחדש "מוסך" | מסך ראשוני עם טיפול/תקלה/בקשה |
| 3 | לחץ "שלח בקשה" כפול מהיר | רק אירוע 1 בגיליון, השני מחזיר eventId של הראשון |
| 4 | מסך אישור → מספר בקשה מוצג | #NNN מוצג בmeta box |
| 5 | כבה רשת → פולינג 5 פעמים | toast "לא ניתן לבדוק סטטוס" |
| 6 | נהג אחר מנסה לקבוע תור לeventId של נהג אחר | GAS מחזיר `{ ok: false, error: 'unauthorized' }` |

---

## Self-Review

**כיסוי spec:**
- ✅ Task 1: appointment confirmation error (silent + error codes)
- ✅ Task 1: menu reset אחרי תור (תלוי בtask 1)
- ✅ Task 2: requestNumber + managerNote בכל מסלולי localStorage
- ✅ Task 3: garageInfo ו-driverName בdetails שנשלח לGAS
- ✅ Task 4: polling error feedback לנהג
- ✅ Task 5: duplicate_pending_request handling בclient
- ✅ Task 7: ownership check + column guard בGAS _garageSetAppointment
- ✅ Task 8: dedup בGAS _driverFieldEvent
- ✅ Task 9: garageInfo בFCM payload
- ✅ Tasks 10-11: deploy + commit

**Placeholder scan:** ✅ כל שלב מכיל קוד מדויק.

**Type consistency:** `garageInfo` → אובייקט עם `{ name, address, id, phone, contactName, bookingUrl }` — עקבי ב-Tasks 3, 9, ו-`_garageBuildInfoFromState`.

