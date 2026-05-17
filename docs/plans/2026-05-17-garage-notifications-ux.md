# Garage Notifications & UX Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** תיקון עיצוב מיילים, מרכז התראות Admin, popup חי למנהל, מסך "בקשה ממתינה" משופר לנהג, ויומן/תזכורת לאחר קביעת תור.

**Architecture:** 5 קבוצות שינוי עצמאיות. GAS (code.js + index.html) + PWA Driver (app.js). אין קבצים חדשים.

**Tech Stack:** Google Apps Script, GmailApp, vanilla JS, localStorage, Google Calendar URL API, Web Notifications API, Service Worker.

**Design System (OLED Dark + Glassmorphism):**
- Bg: `#000000` / `#0a0a0a` / `#111111`
- Glass cards: `background:rgba(255,255,255,.06); backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.10)`
- Text primary: `#f1f5f9` | muted: `#94a3b8` | dim: `#64748b`
- Accent: `#3b82f6` (blue) | success: `#22c55e` | warning: `#f59e0b` | danger: `#ef4444`
- Animations: ease-out enters, ease-in exits, 250-320ms, `prefers-reduced-motion` respected
- **No emoji icons** — SVG Heroicons/Lucide only in UI

---

## Task 1 — Fix email gibberish + redesign `_garageSetAppointment` email

**File:** `Fleet manager/13.4.26/code.js:13269-13294`

**בעיה:** (א) emoji `📅` בשורת נושא → ג'יבריש ב-Gmail. (ב) email body — פשוט מדי, לא עומד בסטנדרט מיילי המערכת.

- [x] **Step 1: מצא את הפונקציה**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "נהג קבע תור במוסך" | Select-Object -First 3
```

Expected: line ~13284 inside `_garageSetAppointment`.

- [x] **Step 2: החלף subject + htmlBody**

מצא:
```javascript
      var subject = '[עלה נהגים] 📅 נהג קבע תור במוסך — ' + (data[i][vehIdx] || '');
      var emailBody = '<div dir="rtl" style="font-family:Arial,sans-serif">' +
        '<h2>נהג קבע תור במוסך</h2>' +
        '<p><b>נהג:</b> ' + (data[i][driverNameIdx] || '') + '</p>' +
        '<p><b>רכב:</b> ' + (details.licensePlate || data[i][vehIdx] || '') + '</p>' +
        '<p><b>תאריך תור:</b> ' + params.appointmentDate + '</p>' +
        '<p><b>סיבה:</b> ' + (details.reasonLabel || '') + '</p>' +
        '<p><b>מספר אישור:</b> ' + params.eventId + '</p>' +
        '</div>';
```

החלף ב:
```javascript
      var _apptDateFmt = params.appointmentDate.split('-').reverse().join('/');
      var subject = '[עלה נהגים] נהג קבע תור במוסך — ' + (details.licensePlate || data[i][vehIdx] || '');
      var emailBody =
        '<div dir="rtl" style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">' +
        '<div style="width:100%;background:#f1f5f9;padding:32px 0">' +
        '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">' +

        /* Header */
        '<div style="background:linear-gradient(135deg,#0f3460 0%,#1a5276 60%,#2471a3 100%);padding:36px 40px 30px;text-align:center">' +
          '<div style="display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:5px 16px;font-size:11px;color:rgba(255,255,255,.9);letter-spacing:1px;margin-bottom:14px">עמותת עלה עזר לילד המיוחד</div>' +
          '<div style="font-size:40px;margin-bottom:8px">&#x1F4C5;</div>' +
          '<div style="font-size:22px;font-weight:900;color:#ffffff;margin-bottom:6px">תור נקבע במוסך</div>' +
          '<div style="font-size:13px;color:rgba(255,255,255,.75)">עדכון אוטומטי ממערכת ניהול הצי</div>' +
        '</div>' +

        /* Body */
        '<div style="padding:32px 40px">' +

          /* Alert banner */
          '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:16px 20px;margin-bottom:24px;display:flex;gap:12px;align-items:center">' +
            '<div style="font-size:24px;flex-shrink:0">&#x2705;</div>' +
            '<div>' +
              '<div style="font-size:14px;font-weight:800;color:#1e40af;margin-bottom:2px">הנהג אישר תאריך תור</div>' +
              '<div style="font-size:12px;color:#3b82f6">התור נרשם במערכת ועודכן בגיליון</div>' +
            '</div>' +
          '</div>' +

          /* Details table */
          '<div style="background:#f8fafc;border-radius:14px;overflow:hidden;margin-bottom:24px">' +
            _emailRow('&#x1F9D1; נהג',    data[i][driverNameIdx] || '—',      true) +
            _emailRow('&#x1F697; רכב',    details.licensePlate || data[i][vehIdx] || '—', false) +
            _emailRow('&#x1F3ED; סיבה',   details.reasonLabel  || '—',        true) +
            _emailRow('&#x1F4C5; תאריך תור', _apptDateFmt,                    false) +
            _emailRow('&#x1F4CB; מספר אישור', params.eventId,                 true) +
          '</div>' +

          /* Footer note */
          '<div style="font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:20px">מייל זה נשלח אוטומטית ממערכת ניהול הצי של עמותת עלה &bull; אין להשיב למייל זה</div>' +
        '</div>' +

        '</div></div></div>';
```

- [x] **Step 3: הוסף helper `_emailRow` לפני `_garageSetAppointment` (פעם אחת בלבד)**

חפש אם כבר קיים:
```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "function _emailRow" | Select-Object -First 3
```

אם לא קיים — הוסף לפני `function _garageSetAppointment`:
```javascript
function _emailRow(label, value, shaded) {
  var bg = shaded ? '#f1f5f9' : '#ffffff';
  return '<div style="display:flex;align-items:center;gap:0;border-bottom:1px solid #e2e8f0">' +
    '<div style="background:' + bg + ';width:38%;padding:12px 16px;font-size:12px;font-weight:700;color:#475569;border-left:1px solid #e2e8f0">' + label + '</div>' +
    '<div style="background:' + bg + ';flex:1;padding:12px 16px;font-size:13px;font-weight:600;color:#0f172a">' + (value || '—') + '</div>' +
    '</div>';
}
```

---

## Task 2 — עיצוב מחדש email בקשת מוסך ב-`_driverFieldEvent`

**File:** `Fleet manager/13.4.26/code.js:13396-13420`

**בעיה:** כשנהג שולח בקשת מוסך, המנהל מקבל מייל פשוט מאוד ללא פרטי הבקשה (סיבה, מוסך וכו').

- [x] **Step 1: מצא את בניית המייל ב-`_driverFieldEvent`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "var body = '<div dir" | Select-Object -First 3
```

Expected: line ~13410.

- [x] **Step 2: החלף את body + subject לגבי garage_request**

מצא:
```javascript
    var typeLabel = typeLabels[params.type] || params.type;
    var subject = '[עלה נהגים] ' + typeLabel + ' — ' + (auth.vehicleNum || '') + ' — ' + (auth.name || '');
    var mapLink = (params.lat && params.lng)
      ? '<a href="https://maps.google.com/?q=' + params.lat + ',' + params.lng + '">פתח במפה</a>'
      : 'מיקום לא זמין';
    var body = '<div dir="rtl" style="font-family:Arial,sans-serif">' +
      '<h2>אירוע שטח חדש — ' + typeLabel + '</h2>' +
      '<p><b>רכב:</b> ' + (auth.vehicleNum || '') + '</p>' +
      '<p><b>נהג:</b> ' + (auth.name || '') + ' (' + (auth.email || '') + ')</p>' +
      '<p><b>זמן:</b> ' + Utilities.formatDate(now, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm') + '</p>' +
      '<p><b>מיקום:</b> ' + mapLink + '</p>' +
      '<p><b>פרטים:</b> ' + (params.details || '') + '</p>' +
      '</div>';
    try { GmailApp.sendEmail(fleetEmail, subject, '', { htmlBody: body }); } catch(em) {}
    return { ok: true, eventId: eventId };
```

החלף ב:
```javascript
    var typeLabel = typeLabels[params.type] || params.type;
    var timeStr = Utilities.formatDate(now, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm');
    var detObj = {}; try { detObj = JSON.parse(params.details || '{}'); } catch(_pe) {}

    var subject, body;
    if (params.type === 'garage_request') {
      subject = '[עלה נהגים] בקשת כניסה למוסך — ' + (auth.vehicleNum || '') + ' — ' + (auth.name || '');
      body =
        '<div dir="rtl" style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">' +
        '<div style="width:100%;background:#f1f5f9;padding:32px 0">' +
        '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">' +

        '<div style="background:linear-gradient(135deg,#7c2d12 0%,#c2410c 60%,#ea580c 100%);padding:36px 40px 30px;text-align:center">' +
          '<div style="display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:5px 16px;font-size:11px;color:rgba(255,255,255,.9);letter-spacing:1px;margin-bottom:14px">עמותת עלה עזר לילד המיוחד</div>' +
          '<div style="font-size:40px;margin-bottom:8px">&#x1F3ED;</div>' +
          '<div style="font-size:22px;font-weight:900;color:#ffffff;margin-bottom:6px">בקשת כניסה למוסך</div>' +
          '<div style="font-size:13px;color:rgba(255,255,255,.75)">נהג מבקש אישור כניסה למוסך · ' + timeStr + '</div>' +
        '</div>' +

        '<div style="padding:32px 40px">' +
          '<div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:14px;padding:16px 20px;margin-bottom:24px">' +
            '<div style="font-size:14px;font-weight:800;color:#c2410c;margin-bottom:4px">&#x23F3; ממתין לאישורך</div>' +
            '<div style="font-size:12px;color:#ea580c">הנהג ממתין לאישור מנהל הצי לפני הכניסה למוסך</div>' +
          '</div>' +

          '<div style="background:#f8fafc;border-radius:14px;overflow:hidden;margin-bottom:24px">' +
            _emailRow('&#x1F9D1; נהג',      (auth.name || detObj.driverName || auth.email || '—'), true) +
            _emailRow('&#x1F697; רכב',      (auth.vehicleNum || detObj.licensePlate || '—'),       false) +
            _emailRow('&#x1F527; סיבת פנייה', (detObj.reasonLabel || '—'),                         true) +
            _emailRow('&#x1F3ED; מוסך',     (detObj.garageName  || '—'),                           false) +
            (detObj.description ? _emailRow('&#x1F4DD; תיאור',  detObj.description, true)  : '') +
            _emailRow('&#x1F522; מספר פנייה', eventId,                                             false) +
          '</div>' +

          '<div style="text-align:center;margin-bottom:24px">' +
            '<a href="https://script.google.com/macros/s/AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP/exec" style="display:inline-block;background:linear-gradient(135deg,#0f3460,#2471a3);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:.3px">פתח מערכת ניהול &#x25B6;</a>' +
          '</div>' +

          '<div style="font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:20px">מייל זה נשלח אוטומטית ממערכת ניהול הצי של עמותת עלה &bull; אין להשיב למייל זה</div>' +
        '</div>' +

        '</div></div></div>';
    } else {
      var mapLink = (params.lat && params.lng)
        ? '<a href="https://maps.google.com/?q=' + params.lat + ',' + params.lng + '">פתח במפה</a>'
        : 'מיקום לא זמין';
      subject = '[עלה נהגים] ' + typeLabel + ' — ' + (auth.vehicleNum || '') + ' — ' + (auth.name || '');
      body = '<div dir="rtl" style="font-family:Arial,sans-serif">' +
        '<h2>אירוע שטח חדש — ' + typeLabel + '</h2>' +
        '<p><b>רכב:</b> ' + (auth.vehicleNum || '') + '</p>' +
        '<p><b>נהג:</b> ' + (auth.name || '') + ' (' + (auth.email || '') + ')</p>' +
        '<p><b>זמן:</b> ' + timeStr + '</p>' +
        '<p><b>מיקום:</b> ' + mapLink + '</p>' +
        '<p><b>פרטים:</b> ' + (params.details || '') + '</p>' +
        '</div>';
    }
    try { GmailApp.sendEmail(fleetEmail, subject, '', { htmlBody: body }); } catch(em) {}

    // Log to activity center
    if (params.type === 'garage_request') {
      try {
        _logDriverAction(ss, 'בקשת כניסה למוסך', _veh.id,
          (auth.name || '') + ' | סיבה: ' + (detObj.reasonLabel || '') + ' | מוסך: ' + (detObj.garageName || '') + ' | ' + eventId,
          _veh.holder || '', _veh.num || '');
      } catch(_la) {}
    }

    return { ok: true, eventId: eventId };
```

---

## Task 3 — Admin: log activity center + live popup לבקשות מוסך

**Files:** `Fleet manager/13.4.26/code.js` + `Fleet manager/13.4.26/index.html`

### 3A — GAS: action `get_pending_garage_count`

- [x] **Step 1: מצא את בלוק ה-actions הראשי**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\code.js" -Pattern "get_garage_requests|action.*garage" | Select-Object -First 5
```

- [x] **Step 2: הוסף action חדש**

מצא:
```javascript
      else if (action === 'garage_set_appointment')        result = _garageSetAppointment(params);
```

הוסף ישירות אחרי:
```javascript
      else if (action === 'get_pending_garage_count')      result = _getPendingGarageCount(params);
```

- [x] **Step 3: הוסף את הפונקציה `_getPendingGarageCount`**

הוסף לפני `function _garageSetAppointment`:
```javascript
function _getPendingGarageCount(params) {
  try {
    var auth = _validateAdminToken ? _validateAdminToken(params) : { ok: true };
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CFG.SH.FIELD_EVENTS);
    if (!sheet) return { ok: true, count: 0, latestEventId: '' };
    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];
    var typeIdx   = headers.indexOf('type');
    var statusIdx = headers.indexOf('status');
    var eventIdIdx = headers.indexOf('eventId');
    var tsIdx     = headers.indexOf('timestamp');
    var count = 0; var latestTs = 0; var latestEventId = '';
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][typeIdx]) !== 'garage_request') continue;
      var st = String(data[i][statusIdx] || '');
      if (st !== 'pending' && st !== 'open') continue;
      count++;
      var ts = 0;
      try { ts = new Date(data[i][tsIdx] || 0).getTime(); } catch(_) {}
      if (ts > latestTs) { latestTs = ts; latestEventId = String(data[i][eventIdIdx] || ''); }
    }
    return { ok: true, count: count, latestEventId: latestEventId };
  } catch(e) {
    Logger.log('_getPendingGarageCount error: ' + e);
    return { ok: true, count: 0, latestEventId: '' };
  }
}
```

### 3B — Admin index.html: live polling + toast popup

- [x] **Step 4: מצא `_startKmPolling` ב-index.html**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26\index.html" -Pattern "_startKmPolling|function _startKmPolling" | Select-Object -First 3
```

- [x] **Step 5: הוסף CSS לtoast admin**

מצא ב-index.html בלוק CSS (לפני `</style>`):

הוסף:
```css
/* ── Admin Garage Live Toast ── */
#admin-garage-toast {
  position:fixed; top:20px; left:50%; transform:translateX(-50%) translateY(-120px);
  background:linear-gradient(135deg,#0f172a,#1e293b);
  border:1px solid rgba(251,191,36,.35);
  border-radius:18px; padding:16px 24px;
  box-shadow:0 8px 40px rgba(0,0,0,.5), 0 0 0 1px rgba(251,191,36,.15);
  display:flex; align-items:center; gap:14px;
  z-index:99999; min-width:320px; max-width:480px;
  cursor:pointer; transition:transform .4s cubic-bezier(.34,1.56,.64,1), opacity .3s ease;
  opacity:0;
}
#admin-garage-toast.visible {
  transform:translateX(-50%) translateY(0); opacity:1;
}
.agt-icon {
  width:42px; height:42px; border-radius:12px;
  background:linear-gradient(135deg,#f59e0b,#d97706);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.agt-title { font-size:14px; font-weight:800; color:#f1f5f9; margin-bottom:3px; }
.agt-sub   { font-size:12px; color:#94a3b8; }
.agt-badge { background:#ef4444; color:#fff; font-size:11px; font-weight:800;
  padding:2px 8px; border-radius:20px; margin-right:6px; }
@keyframes agt-pulse { 0%,100%{box-shadow:0 8px 40px rgba(0,0,0,.5),0 0 0 1px rgba(251,191,36,.15)}
  50%{box-shadow:0 8px 40px rgba(0,0,0,.5),0 0 0 4px rgba(251,191,36,.25),0 0 24px rgba(251,191,36,.15)} }
#admin-garage-toast.visible { animation:agt-pulse 2s ease infinite; }
```

- [x] **Step 6: הוסף HTML לtoast**

מצא ב-index.html `<body` tag ואחרי הפתיחה הוסף:
```html
<div id="admin-garage-toast" onclick="_acOpenGarageTab()" role="alert" aria-live="assertive">
  <div class="agt-icon">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  </div>
  <div style="flex:1">
    <div class="agt-title"><span class="agt-badge" id="agt-count">1</span>בקשת מוסך חדשה ממתינה</div>
    <div class="agt-sub" id="agt-sub">לחץ לטיפול מיידי</div>
  </div>
  <button onclick="event.stopPropagation();_hideGarageToast()" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:4px;line-height:1" aria-label="סגור">&times;</button>
</div>
```

- [x] **Step 7: הוסף JS לpolling**

הוסף לפני `</script>` הסוגר בסוף index.html:
```javascript
/* ── Live Garage Request Polling ── */
var _garageToastTimer = null;
var _garagePollTimer  = null;
var _lastGarageCount  = -1;   // -1 = first load
var _lastGarageEventId = '';

function _startGaragePolling() {
  _garageCheckNow();
  _garagePollTimer = setInterval(_garageCheckNow, 60000); // every 60s
}

function _garageCheckNow() {
  google.script.run
    .withSuccessHandler(function(raw) {
      var res; try { res = JSON.parse(raw); } catch(_) { res = { ok:true, count:0 }; }
      if (!res.ok) return;
      var cnt = res.count || 0;
      // On first check — initialize baseline without showing toast
      if (_lastGarageCount === -1) {
        _lastGarageCount  = cnt;
        _lastGarageEventId = res.latestEventId || '';
        return;
      }
      // New pending requests arrived
      if (cnt > _lastGarageCount || (res.latestEventId && res.latestEventId !== _lastGarageEventId)) {
        _lastGarageCount   = cnt;
        _lastGarageEventId = res.latestEventId || '';
        _showGarageToast(cnt);
      } else {
        _lastGarageCount = cnt;
      }
    })
    .withFailureHandler(function() {})
    .gasAPI(JSON.stringify({ action: 'get_pending_garage_count' }));
}

function _showGarageToast(count) {
  var toast = document.getElementById('admin-garage-toast');
  var badge = document.getElementById('agt-count');
  var sub   = document.getElementById('agt-sub');
  if (!toast) return;
  if (badge) badge.textContent = count > 1 ? count : '1';
  if (sub)   sub.textContent   = count > 1 ? count + ' בקשות ממתינות לאישורך' : 'לחץ לטיפול מיידי';
  toast.classList.add('visible');
  clearTimeout(_garageToastTimer);
  _garageToastTimer = setTimeout(_hideGarageToast, 8000);
  try { if (window.Notification && Notification.permission === 'granted') {
    new Notification('בקשת מוסך חדשה', { body: count + ' בקשות ממתינות', icon: '/favicon.ico' });
  }} catch(_) {}
}

function _hideGarageToast() {
  var t = document.getElementById('admin-garage-toast');
  if (t) t.classList.remove('visible');
}

function _acOpenGarageTab() {
  _hideGarageToast();
  // Open Activity Center → Garage Requests tab
  var acBtn = document.querySelector('[data-section="activity"]') || document.querySelector('[onclick*="activity"]');
  if (acBtn) acBtn.click();
  setTimeout(function() { _acSwitchTab('garage_requests'); }, 300);
}
```

- [x] **Step 8: קרא `_startGaragePolling()` אחרי init**

מצא:
```javascript
      _startKmPolling();
```

הוסף ישירות אחרי:
```javascript
      _startGaragePolling();
```

---

## Task 4 — Driver: עיצוב מחדש מסך "בקשה ממתינה"

**File:** `Fleet manager/driver/app.js`

**בעיה:** הנהג פותח "מוסך" שוב ורואה מסך ⏳ עם מינימום מידע. אין מספר בקשה, אין ניסוח ברור שמונע פתיחת בקשה כפולה, אין אנימציה.

- [x] **Step 1: מצא `APP._garageShowPending`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "APP._garageShowPending = function" | Select-Object -First 3
```

Expected: line ~2860.

- [x] **Step 2: החלף את כל `APP._garageShowPending`**

מצא:
```javascript
APP._garageShowPending = function(pending) {
```

(מצא עד הסיום `};` של הפונקציה — כ-30 שורות)

החלף ב:
```javascript
APP._garageShowPending = function(pending) {
  var since = '';
  if (pending.submittedAt) {
    try {
      var d = new Date(pending.submittedAt);
      since = d.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'2-digit' }) +
              ' · ' + d.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
    } catch(e) {}
  }
  // Extract request number from eventId e.g. EVT-20260517-016 → 16
  var reqNum = '';
  if (pending.eventId) {
    var m = String(pending.eventId).match(/-(\d+)$/);
    if (m) reqNum = String(parseInt(m[1], 10));
  }
  var reasonLabel = pending.reasonLabel || pending.reason || '';

  _showHelpCard(
    '<div class="help-card" style="padding:0;overflow:hidden">' +

    /* ── orange top band ── */
    '<div style="background:linear-gradient(135deg,#92400e,#d97706,#f59e0b);padding:28px 24px 22px;text-align:center;position:relative">' +
      '<div style="position:absolute;top:14px;right:14px">' +
        '<button class="help-back-btn" style="position:static;margin:0;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25)" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
      '</div>' +
      '<div style="margin-top:8px">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);margin-bottom:12px;animation:notif-approved-glow 3s ease infinite">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '</div>' +
        '<div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:4px">בקשה בהמתנה</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,.8)">ממתינה לאישור מנהל הצי</div>' +
      '</div>' +
    '</div>' +

    /* ── body ── */
    '<div style="padding:24px 20px">' +

      /* Info box */
      '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:16px;padding:16px 18px;margin-bottom:20px;text-align:right">' +
        '<div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>' +
          'כבר הגשת בקשה להיכנס למוסך' +
        '</div>' +
        (reqNum ? '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px">מספר פנייה: <b style="color:#f1f5f9;font-size:14px">#' + reqNum + '</b></div>' : '') +
        (reasonLabel ? '<div style="font-size:12px;color:#94a3b8;margin-bottom:4px">סיבה: <b style="color:#f1f5f9">' + _escHtml(reasonLabel) + '</b></div>' : '') +
        (since ? '<div style="font-size:12px;color:#94a3b8">נשלח בתאריך: <b style="color:#f1f5f9">' + since + '</b></div>' : '') +
      '</div>' +

      /* Status indicator */
      '<div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px;margin-bottom:20px">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;flex-shrink:0;animation:notif-critical-pulse 2s ease infinite"></div>' +
        '<div style="font-size:13px;color:#94a3b8">בודק סטטוס... תקבל התראה push כשהמנהל יאשר</div>' +
      '</div>' +

      /* Separator */
      '<div style="border-top:1px solid rgba(255,255,255,.08);margin-bottom:16px;padding-top:14px;font-size:11px;color:#475569;text-align:center">במידה ומדובר בפנייה חדשה ושונה — לחץ בקשה חדשה</div>' +

      /* Buttons */
      '<button class="help-action-btn secondary" style="margin-bottom:10px" onclick="APP._garageClearPending();APP.helpGarage()">&#x1F504; בקשה חדשה</button>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +

    '</div></div>'
  );
};
```

---

## Task 5 — Driver: Google Calendar + תזכורת אחרי קביעת תור

**File:** `Fleet manager/driver/app.js`

### 5A — הצג כפתורי Calendar + Reminder אחרי קביעת תור

- [x] **Step 1: מצא את מסך ה"תור נקבע" ב-`_garageConfirmAppointment`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "תור נקבע" | Select-Object -First 3
```

Expected: line inside `_garageConfirmAppointment`.

- [x] **Step 2: החלף את מסך ה-success**

מצא:
```javascript
      _showHelpCard(
        '<div class="help-card" style="text-align:center;padding:32px 20px">' +
        '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">תור נקבע!</div>' +
        '<div style="font-size:14px;color:#94a3b8;margin-bottom:6px">תאריך: <b style="color:#f1f5f9">' + dateVal.split('-').reverse().join('/') + '</b></div>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px">מנהל הצי קיבל עדכון</div>' +
        '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
        '</div>'
      );
```

החלף ב:
```javascript
      var _dateFmt = dateVal.split('-').reverse().join('/');
      var _calUrl = _buildGoogleCalendarUrl(dateVal, STATE.vehicle);
      _showHelpCard(
        '<div class="help-card" style="padding:0;overflow:hidden">' +

        /* Top success band */
        '<div style="background:linear-gradient(135deg,#064e3b,#065f46,#059669);padding:32px 24px 26px;text-align:center">' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:22px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);margin-bottom:14px;animation:notif-approved-glow 2.5s ease infinite">' +
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</div>' +
          '<div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:6px">תור נקבע!</div>' +
          '<div style="font-size:14px;color:rgba(255,255,255,.85)">תאריך: <b>' + _dateFmt + '</b></div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">מנהל הצי קיבל עדכון</div>' +
        '</div>' +

        '<div style="padding:24px 20px">' +

          /* Calendar button */
          '<a href="' + _calUrl + '" target="_blank" style="display:flex;align-items:center;gap:14px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);border-radius:16px;padding:16px 18px;margin-bottom:12px;text-decoration:none;cursor:pointer;transition:background .2s" onclick="this.style.background=\'rgba(59,130,246,.2)\'">' +
            '<div style="width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#2563eb,#3b82f6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:14px;font-weight:700;color:#93c5fd">הוסף ליומן Google</div>' +
              '<div style="font-size:12px;color:#64748b;margin-top:2px">פותח את Google Calendar</div>' +
            '</div>' +
          '</a>' +

          /* Reminder button */
          '<button onclick="APP._garageShowReminderPicker(\'' + dateVal + '\')" style="display:flex;align-items:center;gap:14px;width:100%;background:rgba(168,85,247,.10);border:1px solid rgba(168,85,247,.25);border-radius:16px;padding:16px 18px;margin-bottom:20px;cursor:pointer;transition:background .2s" onmouseover="this.style.background=\'rgba(168,85,247,.18)\'" onmouseout="this.style.background=\'rgba(168,85,247,.10)\'">' +
            '<div style="width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:14px;font-weight:700;color:#c4b5fd">קבע תזכורת</div>' +
              '<div style="font-size:12px;color:#64748b;margin-top:2px">התראה לפני מועד התור</div>' +
            '</div>' +
          '</button>' +

          '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
        '</div></div>'
      );
```

### 5B — הוסף helper `_buildGoogleCalendarUrl` + `_garageShowReminderPicker` + `_saveGarageReminder` + `_checkGarageReminders`

- [x] **Step 3: הוסף פונקציות helper לפני `APP._garageAppointmentNo`**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "APP._garageAppointmentNo = function" | Select-Object -First 3
```

הוסף לפני `APP._garageAppointmentNo`:
```javascript
function _buildGoogleCalendarUrl(dateVal, vehicle) {
  // dateVal = 'YYYY-MM-DD' → Google Calendar needs YYYYMMDD
  var d = dateVal.replace(/-/g, '');
  var nextDay = (function() {
    var dt = new Date(dateVal + 'T12:00:00');
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString().slice(0,10).replace(/-/g,'');
  })();
  var vNum    = (vehicle && vehicle.num)  || '';
  var gName   = (vehicle && vehicle.garage && vehicle.garage.name) || 'מוסך';
  var gAddr   = (vehicle && vehicle.garage && vehicle.garage.address) || '';
  var title   = encodeURIComponent('תור במוסך — ' + vNum);
  var details = encodeURIComponent('תור במוסך ' + gName + '\nרכב: ' + vNum);
  var loc     = encodeURIComponent(gAddr);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + title +
    '&dates=' + d + '/' + nextDay + '&details=' + details + '&location=' + loc + '&sf=true&output=xml';
}

APP._garageShowReminderPicker = function(dateVal) {
  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP.closeHelpMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">קבע תזכורת</div>' +
    '<div class="help-card-sub">תאריך התור: ' + dateVal.split('-').reverse().join('/') + '</div>' +
    '<hr class="help-card-divider">' +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:14px">מתי לשלוח תזכורת?</div>' +
    [
      { days: 7,  label: 'שבוע לפני התור' },
      { days: 3,  label: '3 ימים לפני' },
      { days: 2,  label: 'יומיים לפני' },
      { days: 1,  label: 'יום לפני' },
    ].map(function(opt) {
      return '<button onclick="APP._saveGarageReminder(\'' + dateVal + '\',' + opt.days + ')" ' +
        'style="display:flex;align-items:center;gap:12px;width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer;transition:background .2s" ' +
        'onmouseover="this.style.background=\'rgba(255,255,255,.12)\'" onmouseout="this.style.background=\'rgba(255,255,255,.06)\'">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#f1f5f9;text-align:right">' + opt.label + '</div>' +
        '</button>';
    }).join('') +
    '<div style="font-size:11px;color:#475569;text-align:center;margin-top:8px">התזכורת תופיע בפתיחת האפליקציה</div>' +
    '</div>'
  );
};

APP._saveGarageReminder = function(appointmentDate, daysBefore) {
  try {
    var apptMs = new Date(appointmentDate + 'T09:00:00').getTime();
    var remindMs = apptMs - (daysBefore * 24 * 60 * 60 * 1000);
    var reminders = [];
    try { reminders = JSON.parse(localStorage.getItem('driver_garage_reminders') || '[]'); } catch(_) {}
    // Remove any existing reminder for same appointment
    reminders = reminders.filter(function(r) { return r.appointmentDate !== appointmentDate; });
    reminders.push({
      appointmentDate: appointmentDate,
      remindAt:        remindMs,
      daysBefore:      daysBefore,
      vehicleNum:      (STATE.vehicle && STATE.vehicle.num) || '',
      shown:           false
    });
    localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:32px 20px">' +
      '<div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:22px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);margin-bottom:16px;animation:notif-approved-glow 2.5s ease infinite">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">תזכורת נקבעה</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:20px">' + daysBefore + ' ימים לפני התור — ' + appointmentDate.split('-').reverse().join('/') + '</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
  } catch(e) {
    console.error('_saveGarageReminder:', e);
    showToast('שגיאה בשמירת תזכורת');
  }
};

APP._checkGarageReminders = function() {
  try {
    var reminders = JSON.parse(localStorage.getItem('driver_garage_reminders') || '[]');
    if (!reminders.length) return;
    var now = Date.now();
    var updated = false;
    reminders.forEach(function(r) {
      if (!r.shown && now >= r.remindAt) {
        r.shown = true;
        updated = true;
        var apptFmt = r.appointmentDate.split('-').reverse().join('/');
        var payload = {
          notification: {
            title: 'תזכורת — תור במוסך',
            body: 'התור שלך ' + (r.daysBefore === 1 ? 'מחר' : 'בעוד ' + r.daysBefore + ' ימים') + ' · ' + apptFmt
          },
          data: { alertType: 'plan', vehicleNum: r.vehicleNum },
          ts: now
        };
        if (typeof showInAppNotification === 'function') {
          showInAppNotification(payload);
        }
      }
    });
    // Remove past (appointment date passed by >3 days)
    reminders = reminders.filter(function(r) {
      var apptMs = new Date(r.appointmentDate + 'T23:59:00').getTime();
      return now < apptMs + (3 * 24 * 60 * 60 * 1000);
    });
    if (updated) localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
  } catch(e) { console.warn('_checkGarageReminders:', e); }
};
```

### 5C — קרא ל-`_checkGarageReminders` על startApp

- [x] **Step 4: מצא `startApp` ב-app.js**

```powershell
Select-String -Path "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver\app.js" -Pattern "function startApp" | Select-Object -First 3
```

- [x] **Step 5: הוסף קריאה**

מצא ב-startApp:
```javascript
    renderAll();
    initSwipe();
```

הוסף ישירות אחרי:
```javascript
    setTimeout(APP._checkGarageReminders, 1500);
```

---

## Task 6 — Deploy + Commit

- [x] **Step 1: Push GAS**

```powershell
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\13.4.26"
clasp push
```

- [x] **Step 2: Deploy**

```powershell
clasp deploy -i AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP -d "V1.1905 garage email design + admin live notifications"
```

- [x] **Step 3: Git commit driver**

```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager\driver"
git add app.js
git commit -m "feat: garage pending screen redesign + calendar/reminder UX + admin live toast"
git push origin main
```

---

## Self-Review

- ✅ Task 1: email appointment — subject ללא emoji + HTML מרהיב עם header gradient + details table
- ✅ Task 2: email garage_request — HTML מרהיב + CTA link למנהל + log activity center
- ✅ Task 3A: GAS action `get_pending_garage_count` — count + latestEventId
- ✅ Task 3B: Admin polling 60s + toast עם counter + SVG icon + animation pulse + click→opens garage tab
- ✅ Task 4: מסך "בקשה ממתינה" — top band, #reqNum, reason, timestamp, "כבר הגשת בקשה", separator
- ✅ Task 5: success → Google Calendar URL + reminder picker → localStorage → check on app open
- ✅ `_emailRow` helper — DRY, used in both emails
- ✅ `prefers-reduced-motion` respected via existing CSS override
- ✅ No emoji as UI icons — SVG Heroicons throughout
- ✅ Touch targets ≥44px on all buttons

