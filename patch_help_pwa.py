#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch PWA app.js + index.html + sw.js: add help menu module."""
import os

BASE = os.path.dirname(os.path.abspath(__file__))
APP_JS     = os.path.join(BASE, 'app.js')
INDEX_HTML = os.path.join(BASE, 'index.html')
SW_JS      = os.path.join(BASE, 'sw.js')

def patch(path, patches, label):
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()
    orig = len(src)
    ok = 0
    for (old, new, name) in patches:
        if old in src:
            src = src.replace(old, new, 1)
            print('  OK: ' + name)
            ok += 1
        else:
            print('  WARN not found: ' + name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print('%s: %d -> %d (%d/%d applied)' % (label, orig, len(src), ok, len(patches)))

# ──────────────────────────────────────────────
# app.js
# ──────────────────────────────────────────────

HELP_FUNCTIONS = """
/* ══════════════════════════════════════════════════════════════
   GPS Utility
══════════════════════════════════════════════════════════════ */
function _getGps(timeoutMs) {
  return new Promise(function(resolve) {
    if (!navigator.geolocation) { resolve({ lat: null, lng: null }); return; }
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; resolve({ lat: null, lng: null }); }
    }, timeoutMs || 8000);
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        if (!done) { done = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); }
      },
      function() {
        if (!done) { done = true; clearTimeout(timer); resolve({ lat: null, lng: null }); }
      },
      { enableHighAccuracy: true, timeout: timeoutMs || 8000 }
    );
  });
}

/* ══════════════════════════════════════════════════════════════
   Offline Event Queue
══════════════════════════════════════════════════════════════ */
var PENDING_KEY = 'aleh_pending_events';

function _queueEvent(eventData) {
  var queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  queue.push(Object.assign({ id: 'local-' + Date.now(), retries: 0 }, eventData));
  localStorage.setItem(PENDING_KEY, JSON.stringify(queue));
}

async function _syncPendingEvents() {
  var queue = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  if (!queue.length) return;
  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    var ev = queue[i];
    if (ev.retries >= 3) { ev.syncFailed = true; remaining.push(ev); continue; }
    try {
      var result = await gasPost('driver_field_event', {
        type: ev.type, lat: ev.lat || '', lng: ev.lng || '', details: JSON.stringify(ev.details || {})
      });
      if (!result.ok) { ev.retries++; remaining.push(ev); }
    } catch(e2) { ev.retries++; remaining.push(ev); }
  }
  localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
}

async function _fireFieldEvent(type, details) {
  var gps = STATE.helpGps || { lat: null, lng: null };
  var payload = { type: type, lat: gps.lat || '', lng: gps.lng || '', details: JSON.stringify(details || {}) };
  try {
    var result = await gasPost('driver_field_event', payload);
    if (!result.ok) throw new Error(result.error);
    return result;
  } catch(e) {
    if (!navigator.onLine) {
      _queueEvent(Object.assign({ type: type, details: details }, gps));
      return { ok: true, eventId: 'queued', queued: true };
    }
    return { ok: false, error: String(e) };
  }
}

window.addEventListener('online', function() { _syncPendingEvents(); });

/* ══════════════════════════════════════════════════════════════
   Help Menu
══════════════════════════════════════════════════════════════ */
APP.openHelpMenu = async function() {
  if (!STATE.vehicle) { showToast('יש להתחבר תחילה'); return; }
  if (STATE.helpMenuOpen) { APP.closeHelpMenu(); return; }
  STATE.helpMenuOpen = true;
  STATE.helpGps = null;
  _getGps(8000).then(function(gps) { STATE.helpGps = gps; });
  var overlay = document.getElementById('help-overlay');
  var menu    = document.getElementById('help-menu');
  var fab     = document.getElementById('help-fab');
  if (overlay) overlay.classList.add('open');
  if (menu)    menu.classList.add('open');
  if (fab)     fab.classList.add('open');
  var items = document.querySelectorAll('.help-item:not(.help-item-soon)');
  items.forEach(function(el, i) {
    setTimeout(function() { el.classList.add('anim-in'); }, 60 + i * 60);
  });
};

APP.closeHelpMenu = function() {
  STATE.helpMenuOpen = false;
  var overlay = document.getElementById('help-overlay');
  var menu    = document.getElementById('help-menu');
  var fab     = document.getElementById('help-fab');
  if (overlay) overlay.classList.remove('open');
  if (menu)    menu.classList.remove('open');
  if (fab)     fab.classList.remove('open');
  setTimeout(function() {
    document.querySelectorAll('.help-item:not(.help-item-soon)').forEach(function(el) { el.classList.remove('anim-in'); });
    var wrap  = document.getElementById('help-card-wrap');
    var items = document.getElementById('help-menu-items');
    if (wrap)  { wrap.style.display = 'none'; wrap.innerHTML = ''; }
    if (items) items.style.display = '';
  }, 350);
};

function _showHelpCard(html) {
  var wrap  = document.getElementById('help-card-wrap');
  var items = document.getElementById('help-menu-items');
  if (items) items.style.display = 'none';
  if (wrap)  { wrap.style.display = ''; wrap.innerHTML = html; }
}

APP._helpBackToMenu = function() {
  var wrap  = document.getElementById('help-card-wrap');
  var items = document.getElementById('help-menu-items');
  if (wrap)  { wrap.style.display = 'none'; wrap.innerHTML = ''; }
  if (items) { items.style.display = ''; }
  document.querySelectorAll('.help-item:not(.help-item-soon)').forEach(function(el, i) {
    el.classList.remove('anim-in');
    setTimeout(function() { el.classList.add('anim-in'); }, 40 + i * 50);
  });
};

/* ── פנצ'ר ── */
APP.helpPuncture = async function() {
  _fireFieldEvent('puncture', { usedFallback24: false });
  _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-spinner">&#x27F3; טוען ספק שירות...</div></div>');
  var gps = STATE.helpGps;
  var mapsUrl = (gps && gps.lat)
    ? 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA/@' + gps.lat + ',' + gps.lng + ',15z'
    : 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA';
  try {
    var res = await gasPost('get_service_providers', { category: 'puncture' });
    if (res.ok && res.providers && res.providers.length > 0) {
      var p = res.providers[0];
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x1F527; ' + p.name + '</div>' +
        '<div class="help-card-sub">ספק מורשה</div>' +
        '<hr class="help-card-divider">' +
        '<div class="help-card-row"><span>&#x1F4CD;</span><span>' + (p.address||'') + '</span></div>' +
        (p.contactName ? '<div class="help-card-row"><span>&#x1F464;</span><span>' + p.contactName + '</span></div>' : '') +
        '<hr class="help-card-divider">' +
        '<button class="help-action-btn" onclick="window.open(\'tel:' + (p.phone||'').replace(/[^0-9*+]/g,'') + '\')">&#x1F4DE; ' + (p.phone||'') + ' &#x2014; חייג עכשיו</button>' +
        '<button class="help-action-btn secondary" onclick="window.open(\'' + mapsUrl + '\',\'_blank\')">&#x1F50D; פנצריות פתוחות 24/7 קרוב אליי</button>' +
        '</div>'
      );
    } else {
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x1F527; פנצ&#x27;ר</div>' +
        '<div class="help-card-sub">לא נמצא ספק מורשה</div>' +
        '<hr class="help-card-divider">' +
        '<button class="help-action-btn" onclick="window.open(\'' + mapsUrl + '\',\'_blank\')">&#x1F50D; מצא פנצריות פתוחות 24/7 קרוב אליי</button>' +
        '</div>'
      );
    }
  } catch(e) {
    _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-error">שגיאה בטעינת נתונים. בדוק חיבור רשת.</div></div>');
  }
};

/* ── מצבר ── */
APP.helpBattery = function() {
  _fireFieldEvent('battery', { actionTaken: 'none', locationShared: false });
  var gps = STATE.helpGps;
  var locStr = (gps && gps.lat)
    ? ' &#x05D4;&#x05DE;&#x05D9;&#x05E7;&#x05D5;&#x05DD; &#x05E9;&#x05DC;&#x05D9;: https://maps.google.com/?q=' + gps.lat + ',' + gps.lng
    : '';
  var waText = encodeURIComponent('שלום, אני נהג עלה צריך עזרה עם מצבר.' + (gps && gps.lat ? ' המיקום שלי: https://maps.google.com/?q=' + gps.lat + ',' + gps.lng : ''));
  var waPhone = '972XXXXXXXXXX';
  var waUrl = 'https://wa.me/' + waPhone + '?text=' + waText;
  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">&#x1F50B; מוקד ידידים</div>' +
    '<div class="help-card-sub">סיוע בדרכים &#x2014; זמין 24/7</div>' +
    '<hr class="help-card-divider">' +
    '<button class="help-action-btn" onclick="window.open(\'tel:*6140\');APP._batteryCall()">&#x1F4DE; *6140 &#x2014; התקשר עכשיו</button>' +
    '<button class="help-action-btn secondary" onclick="APP._batteryWa(\'' + waUrl + '\')">&#x1F4AC; שלח וואטסאפ + מיקום</button>' +
    '</div>'
  );
};

APP._batteryCall = function() { _fireFieldEvent('battery', { actionTaken: 'call', locationShared: false }); };
APP._batteryWa   = function(url) {
  _fireFieldEvent('battery', { actionTaken: 'whatsapp', locationShared: !!(STATE.helpGps && STATE.helpGps.lat) });
  window.open(url, '_blank');
};

/* ── גרר ── */
APP.helpTowing = async function() {
  _fireFieldEvent('towing', { hasInsurance: null });
  _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-spinner">&#x27F3; טוען פרטי ביטוח...</div></div>');
  try {
    var res = await gasPost('get_vehicle_insurance_details', {});
    var ins = res.insurance;
    var garage = res.garage;
    if (!ins || !ins.hasComprehensive) {
      var mgrPhone = (STATE.vehicle && STATE.vehicle.fleetManagerPhone) ? STATE.vehicle.fleetManagerPhone : '';
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x26A0;&#xFE0F; אין ביטוח מקיף</div>' +
        '<div class="help-card-sub">לא נמצא ביטוח מקיף פעיל לרכב זה.</div>' +
        '<hr class="help-card-divider">' +
        '<div style="font-size:14px;color:#94a3b8;text-align:center;padding:8px">פנה למנהל הצי לסיוע.</div>' +
        (mgrPhone ? '<button class="help-action-btn" onclick="window.open(\'tel:' + mgrPhone.replace(/[^0-9+]/g,'') + '\')">&#x1F4DE; התקשר למנהל הצי</button>' : '') +
        '</div>'
      );
    } else {
      _showHelpCard(
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="help-card-title">&#x1F69B; גרירה &#x2014; ביטוח מקיף</div>' +
        '<div class="help-card-sub">' + (ins.company||'') + ' | פוליסה: ' + (ins.policyNumber||'') + '</div>' +
        '<hr class="help-card-divider">' +
        (ins.emergencyPhone ? '<button class="help-action-btn" onclick="window.open(\'tel:' + ins.emergencyPhone.replace(/[^0-9+]/g,'') + '\')">&#x1F4DE; מוקד חירום 24/7 &#x2014; ' + ins.emergencyPhone + '</button>' : '') +
        (ins.towingCoverageKm ? '<div class="help-card-row"><span class="help-card-label">כיסוי גרירה:</span><span class="help-card-value">עד ' + ins.towingCoverageKm + ' ק"מ</span></div>' : '') +
        '<div class="help-card-row"><span class="help-card-label">רכב חלופי:</span><span class="help-card-value">' + (ins.includesRentalCar ? '&#x2705; כלול' : '&#x274C; לא כלול') + '</span></div>' +
        (ins.expiryDate ? '<div class="help-card-row"><span class="help-card-label">בתוקף עד:</span><span class="help-card-value">' + ins.expiryDate + '</span></div>' : '') +
        (garage ? '<hr class="help-card-divider"><div class="help-card-title" style="font-size:14px">&#x1F527; יעד גרירה מומלץ</div><div class="help-card-row">' + (garage.name||'') + '</div>' + (garage.address ? '<div class="help-card-row">&#x1F4CD; ' + garage.address + '</div>' : '') : '') +
        '</div>'
      );
    }
  } catch(e) {
    _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-error">שגיאה בטעינת נתונים.</div></div>');
  }
};

/* ── קביעת תור ── */
APP.helpAppointment = function() {
  _fireFieldEvent('service_request', { reason: null, notes: null });
  APP._apptSelectedReason = null;
  var garage     = (STATE.vehicle && STATE.vehicle.garageName) ? STATE.vehicle.garageName : 'מוסך לא מוגדר';
  var garagePhone= (STATE.vehicle && STATE.vehicle.garagePhone) ? STATE.vehicle.garagePhone : '';
  var reasons    = [['routine','טיפול שגרתי'],['fault','תקלה'],['warning_light','נורה דולקת'],['post_accident','לאחר תאונה'],['other','אחר']];
  var radioHtml  = reasons.map(function(r) {
    return '<label class="help-radio-item" onclick="APP._apptSelectReason(\\'' + r[0] + '\\',this)">' +
           '<input type="radio" name="appt-reason" value="' + r[0] + '"><span class="help-radio-label">' + r[1] + '</span></label>';
  }).join('');
  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">&#x1F4C5; קביעת תור</div>' +
    '<div class="help-card-sub">המוסך שלך: ' + garage + '</div>' +
    '<hr class="help-card-divider">' +
    (garagePhone ? '<button class="help-action-btn secondary" style="margin-bottom:16px" onclick="window.open(\'tel:' + garagePhone.replace(/[^0-9+]/g,'') + '\')">&#x1F4DE; חייג למוסך</button>' : '') +
    '<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:10px">סיבת התור:</div>' +
    '<div class="help-radio-group" id="appt-reasons">' + radioHtml + '</div>' +
    '<textarea class="help-textarea" id="appt-notes" placeholder="הערות (אופציונלי)" rows="3"></textarea>' +
    '<button class="help-action-btn" onclick="APP._apptSubmit()">שלח בקשה למנהל הצי</button>' +
    '</div>'
  );
};

APP._apptSelectReason = function(value, el) {
  APP._apptSelectedReason = value;
  document.querySelectorAll('.help-radio-item').forEach(function(item) { item.classList.remove('selected'); });
  if (el) el.classList.add('selected');
};

APP._apptSubmit = async function() {
  if (!APP._apptSelectedReason) { showToast('יש לבחור סיבת תור'); return; }
  var notes   = (document.getElementById('appt-notes') || {}).value || '';
  var garage  = (STATE.vehicle && STATE.vehicle.garageName) ? STATE.vehicle.garageName : '';
  var garageId= (STATE.vehicle && STATE.vehicle.garageId)   ? STATE.vehicle.garageId   : '';
  var result  = await _fireFieldEvent('service_request', { garageId: garageId, garageName: garage, reason: APP._apptSelectedReason, notes: notes });
  if (result.ok) {
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:32px 20px">' +
      '<div style="font-size:48px;margin-bottom:12px">&#x2705;</div>' +
      '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">הבקשה נשלחה!</div>' +
      '<div style="font-size:14px;color:#94a3b8;margin-bottom:20px">מנהל הצי יצור איתך קשר לתיאום</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
  } else {
    showToast('שגיאה בשליחה — נסה שוב');
  }
};

"""

APP_JS_PATCHES = [
    # 1. Add helpMenuOpen + helpGps to STATE
    (
        "  govLoading: false\n};",
        "  govLoading: false,\n  helpMenuOpen: false,\n  helpGps: null\n};",
        'STATE: added helpMenuOpen + helpGps'
    ),
    # 2. Add mock data
    (
        "  if (action === 'driver_report_fault') return { ok: true };\n  if (action === 'driver_register_fcm') return { ok: true };\n  return { ok: false, error: 'Unknown action' };\n}",
        """  if (action === 'driver_report_fault') return { ok: true };
  if (action === 'driver_register_fcm') return { ok: true };
  if (action === 'get_service_providers') {
    return { ok: true, providers: [{ id:'SP001', name:'פנצריה מורשית עלה', category:'puncture', address:'רחוב הרצל 14, בני ברק', phone:'03-1234567', contactName:'יוסי כהן', googlePlaceId:'ChIJtest123', notes:'' }] };
  }
  if (action === 'get_vehicle_insurance_details') {
    return { ok: true, insurance: { hasComprehensive:true, company:'מגדל ביטוח', policyNumber:'123456789', emergencyPhone:'1-800-123-456', towingCoverageKm:100, includesRentalCar:true, expiryDate:'2027-01-20' }, garage: { name:'מוסך טויוטה תל אביב', address:'רחוב הברזל 12, תל אביב', phone:'03-6789012' } };
  }
  if (action === 'driver_field_event') {
    return { ok: true, eventId: 'EVT-DEMO-' + Date.now() };
  }
  return { ok: false, error: 'Unknown action' };
}""",
        'mockResponse: added 3 new mock actions'
    ),
    # 3. Remove FAB hide in nav()
    (
        "    const fab = document.getElementById('fab');\n    if (fab) fab.style.display = screen === 'service' ? 'none' : 'flex';",
        "    // help-fab is always visible",
        'nav(): removed old fab display toggle'
    ),
    # 4. Insert help functions after mockResponse (after Unknown action line, before /* ══ Session ══ */)
    (
        "  return { ok: false, error: 'Unknown action' };\n}\n\n/* ══ Session ══ */",
        "  return { ok: false, error: 'Unknown action' };\n}\n" + HELP_FUNCTIONS + "/* ══ Session ══ */",
        'Inserted GPS + offline queue + all help feature functions'
    ),
]

patch(APP_JS, APP_JS_PATCHES, 'app.js')

# ──────────────────────────────────────────────
# index.html
# ──────────────────────────────────────────────

OLD_FAB_HTML = """  <button class="fab" id="fab" onclick="APP.nav('service');setTimeout(()=>document.getElementById('fault-section').scrollIntoView({behavior:'smooth'}),100)">
    <svg width="18" height="18"><use href="#ic-plus" color="white"/></svg>
    דווח תקלה
  </button>"""

NEW_FAB_HTML = """  <!-- Help FAB -->
  <button class="help-fab" id="help-fab" onclick="APP.openHelpMenu()" aria-label="צריך עזרה">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
    <span class="help-fab-label">עזרה</span>
  </button>

  <!-- Help Menu Overlay -->
  <div class="help-overlay" id="help-overlay" onclick="APP.closeHelpMenu()"></div>
  <div class="help-menu" id="help-menu">
    <div class="help-menu-header">
      <span class="help-menu-title">במה נוכל לעזור?</span>
      <button class="help-menu-close" onclick="APP.closeHelpMenu()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="help-menu-items" id="help-menu-items">
      <button class="help-item" id="hitem-puncture" onclick="APP.helpPuncture()">
        <span class="help-item-icon" style="background:linear-gradient(135deg,#1F8A3D,#16652e)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">פנצ&#x27;ר</span><span class="help-item-sub">ספק שירות + פנצריות 24/7</span></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="help-item" id="hitem-battery" onclick="APP.helpBattery()">
        <span class="help-item-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">מצבר / רכב תקוע</span><span class="help-item-sub">מוקד ידידים 24/7</span></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="help-item" id="hitem-towing" onclick="APP.helpTowing()">
        <span class="help-item-icon" style="background:linear-gradient(135deg,#3b82f6,#2563eb)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">גרר</span><span class="help-item-sub">ביטוח מקיף — גרירה</span></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="help-item" id="hitem-appointment" onclick="APP.helpAppointment()">
        <span class="help-item-icon" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">קביעת תור</span><span class="help-item-sub">בקשה למוסך</span></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="help-item help-item-soon" disabled>
        <span class="help-item-icon" style="background:linear-gradient(135deg,#475569,#334155)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">נורה דולקת</span><span class="help-item-sub">זיהוי AI — בקרוב</span></div>
        <span class="help-soon-badge">בקרוב</span>
      </button>
      <button class="help-item help-item-soon" disabled>
        <span class="help-item-icon" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </span>
        <div class="help-item-text"><span class="help-item-title">תאונה</span><span class="help-item-sub">דיווח מלא — בקרוב</span></div>
        <span class="help-soon-badge">בקרוב</span>
      </button>
    </div>
    <div class="help-card-wrap" id="help-card-wrap" style="display:none"></div>
  </div>"""

HELP_CSS = """.help-fab {
  position: fixed; bottom: 24px; left: 24px; z-index: 50;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  background: #1F8A3D; border: none; border-radius: 50%;
  width: 56px; height: 56px; cursor: pointer; box-shadow: 0 4px 16px rgba(31,138,61,0.45);
  animation: fabPulse 2.5s ease-in-out infinite;
  padding: 0; justify-content: center;
}
.help-fab-label { font-size:9px; font-weight:700; color:white; letter-spacing:.5px; margin-top:-2px; }
.help-fab.open { animation:none; background:#155e2a; }
.help-overlay {
  position:fixed; inset:0; z-index:200;
  background:rgba(0,0,0,.75); backdrop-filter:blur(12px);
  opacity:0; pointer-events:none; transition:opacity 200ms ease;
}
.help-overlay.open { opacity:1; pointer-events:all; }
.help-menu {
  position:fixed; bottom:0; left:0; right:0; z-index:201;
  background:#0f172a; border-radius:24px 24px 0 0;
  padding:0 0 env(safe-area-inset-bottom,16px) 0;
  transform:translateY(110%); transition:transform 320ms cubic-bezier(0.34,1.56,0.64,1);
  max-height:85vh; overflow-y:auto; direction:rtl;
}
.help-menu.open { transform:translateY(0); }
.help-menu-header { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 12px; border-bottom:1px solid rgba(255,255,255,.07); }
.help-menu-title { font-size:18px; font-weight:700; color:#f1f5f9; }
.help-menu-close { background:rgba(255,255,255,.08); border:none; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#94a3b8; }
.help-menu-items { padding:8px 12px 12px; display:flex; flex-direction:column; gap:6px; }
.help-item {
  display:flex; align-items:center; gap:14px;
  background:#1e293b; border:1px solid rgba(255,255,255,.06);
  border-radius:16px; padding:14px 16px; cursor:pointer;
  width:100%; text-align:right; color:#f1f5f9;
  opacity:0; transform:translateY(20px);
  transition:background 180ms ease, transform 180ms ease;
}
.help-item:active { background:#2d3f55; }
.help-item-icon { width:48px; height:48px; border-radius:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.help-item-text { flex:1; display:flex; flex-direction:column; gap:2px; }
.help-item-title { font-size:15px; font-weight:700; }
.help-item-sub { font-size:12px; color:#94a3b8; }
.help-item-soon { opacity:.45 !important; transform:none !important; cursor:not-allowed; }
.help-soon-badge { font-size:10px; font-weight:700; color:#94a3b8; background:rgba(148,163,184,.15); border-radius:6px; padding:3px 7px; }
.help-item.anim-in { opacity:1; transform:translateY(0); }
.help-card-wrap { padding:8px 12px 12px; }
.help-card { background:#1e293b; border:1px solid rgba(255,255,255,.08); border-radius:20px; padding:20px; color:#f1f5f9; direction:rtl; }
.help-card-title { font-size:17px; font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:8px; }
.help-card-sub { font-size:13px; color:#94a3b8; margin-bottom:16px; }
.help-card-divider { border:none; border-top:1px solid rgba(255,255,255,.07); margin:14px 0; }
.help-card-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; font-size:14px; }
.help-card-label { color:#94a3b8; font-size:12px; margin-bottom:2px; }
.help-card-value { font-weight:600; }
.help-card-status-open { color:#22c55e; font-weight:700; font-size:13px; }
.help-card-status-closed { color:#ef4444; font-weight:700; font-size:13px; }
.help-action-btn { display:flex; align-items:center; justify-content:center; gap:8px; background:#1F8A3D; color:white; border:none; border-radius:14px; padding:14px 20px; font-size:15px; font-weight:700; cursor:pointer; width:100%; margin-bottom:8px; }
.help-action-btn.secondary { background:rgba(255,255,255,.07); color:#f1f5f9; }
.help-action-btn:active { opacity:.85; }
.help-back-btn { display:flex; align-items:center; gap:6px; background:none; border:none; color:#94a3b8; font-size:14px; cursor:pointer; padding:4px 0 12px; margin-right:4px; }
.help-card-spinner { text-align:center; padding:30px; color:#64748b; font-size:14px; }
.help-card-error { text-align:center; padding:20px; color:#ef4444; font-size:14px; }
.help-radio-group { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
.help-radio-item { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:10px 14px; cursor:pointer; }
.help-radio-item.selected { border-color:#1F8A3D; background:rgba(31,138,61,.12); }
.help-radio-item input[type=radio] { display:none; }
.help-radio-label { font-size:14px; font-weight:600; }
.help-textarea { width:100%; box-sizing:border-box; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); border-radius:10px; color:#f1f5f9; font-size:14px; padding:10px 12px; resize:none; font-family:inherit; margin-bottom:12px; direction:rtl; }
.help-textarea:focus { outline:none; border-color:#1F8A3D; }
"""

INDEX_PATCHES = [
    # 1. Replace FAB HTML
    (OLD_FAB_HTML, NEW_FAB_HTML, 'Replace old FAB with help FAB + menu'),
    # 2. Add CSS after .fab:active line
    (
        ".fab:active{transform:scale(0.96)}",
        ".fab:active{transform:scale(0.96)}\n" + HELP_CSS,
        'Added help menu CSS after .fab:active'
    ),
]

patch(INDEX_HTML, INDEX_PATCHES, 'index.html')

# ──────────────────────────────────────────────
# sw.js: bump version
# ──────────────────────────────────────────────
with open(SW_JS, 'r', encoding='utf-8') as f:
    sw = f.read()
if 'aleh-driver-v49' in sw:
    sw = sw.replace('aleh-driver-v49', 'aleh-driver-v50', 1)
    with open(SW_JS, 'w', encoding='utf-8') as f:
        f.write(sw)
    print('sw.js: bumped v49 -> v50')
else:
    print('sw.js: v49 not found (already bumped or different version)')

print('Done.')
