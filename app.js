/* ══════════════════════════════════════════════════════════════
   עלה נהגים — app.js
   Auth → GAS API → Routing → Render
══════════════════════════════════════════════════════════════ */

// ← הגדר כאן את ה-URL של ה-GAS Web App לאחר deploy
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyXUTCX3L9EfDpV0mgIsBxeHsio2yPbx8-ReKN-dmN-DqYpe5oUBXbFaZJA1z9xF6uP/exec';

// ← הגדר כאן את Google OAuth Client ID
const GOOGLE_CLIENT_ID = '11295167732-dov0o2p2858i4nhe0lm1r6aa5sucvukp.apps.googleusercontent.com';

const SESSION_KEY = 'aleh_driver_session';
const SESSION_TTL = 24 * 60 * 60 * 1000;

/* ══ Firebase Config + Init ══
   databaseURL נוסף ידנית — מופיע ב: Firebase Console → Realtime Database → URL בראש העמוד
   שאר הערכים מה-Console → Project Settings → aleh-driver-pwa
════════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCG49bXyT8wZ7Z6tU-fM9zzAJoMmAPUfuA',
  authDomain:        'aleh-fleet.firebaseapp.com',
  databaseURL:       'https://aleh-fleet-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'aleh-fleet',
  storageBucket:     'aleh-fleet.firebasestorage.app',
  messagingSenderId: '247079131404',
  appId:             '1:247079131404:web:68816ccdf27667cdc39129',
  measurementId:     'G-EP6WVGRFNZ'
};

var _fbApp, _fbAuth, _fbDb, _fbSyncReady = false;
(function() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('[firebase] SDK לא נטען — מצב localStorage בלבד');
      return;
    }
    if (FIREBASE_CONFIG.databaseURL === 'PLACEHOLDER_DATABASE_URL') {
      console.warn('[firebase] databaseURL חסר — מצב localStorage בלבד');
      return;
    }
    _fbApp  = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
    _fbAuth = firebase.auth(_fbApp);
    _fbDb   = firebase.database(_fbApp);
    console.log('[firebase] init OK — project:', FIREBASE_CONFIG.projectId);

    // onAuthStateChanged — מופעל גם כשה-SDK מחדש session מ-IndexedDB (אחרי token פג תוקף)
    // מבטיח ש-_initFbSync תמיד תרוץ גם אם signInWithCredential נכשל
    _fbAuth.onAuthStateChanged(function(user) {
      if (user && !_fbSyncReady) {
        _fbSyncReady = true;
        STATE.firebaseUid = user.uid;
        console.log('[fbAuth] onAuthStateChanged — uid:', user.uid);
        _initFbSync();
      }
      if (!user) { _fbSyncReady = false; STATE.firebaseUid = null; }
    });
  } catch(e) {
    console.warn('[firebase] init failed:', e.message);
  }
})();

/* ══ Smart notification routing — called from toast "פתח" + history card tap ══ */
function navigateForAlertType(alertType, meta) {
  meta = meta || {};
  if (typeof APP === 'undefined') return;
  switch (alertType) {
    case 'km_update':
      APP.nav('vehicle');
      setTimeout(function() { if (typeof APP.openKmModal === 'function') APP.openKmModal(); }, 350);
      break;
    case 'overdue':
    case 'urgent':
      APP.nav('vehicle');
      setTimeout(function() { APP.switchTab('garage'); }, 350);
      break;
    case 'plan':
      APP.nav('vehicle');
      setTimeout(function() { APP.switchTab('info'); }, 350);
      break;
    case 'test_due':
    case 'test_urgent':
      APP.nav('vehicle');
      setTimeout(function() { APP.switchTab('info'); }, 350);
      break;
    case 'garage_approved':
      // פתח help menu ישירות — בלי nav('vehicle') שגורם לפלאש
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') {
        APP.openHelpMenu();
      }
      setTimeout(function() {
        if (typeof APP._garageShowApprovedFromStorage === 'function') {
          APP._garageShowApprovedFromStorage(meta);
        } else if (typeof APP.helpGarage === 'function') {
          APP.helpGarage();
        }
      }, 350);
      break;
    case 'garage_rejected':
      APP.nav('vehicle');
      setTimeout(function() { APP.switchTab('garage'); }, 350);
      break;
    case 'fuel_high':
      APP.nav('vehicle');
      setTimeout(function() {
        APP.switchTab('info');
        setTimeout(function() { _renderFuelAlertCard(meta); }, 200);
      }, 350);
      break;
    case 'fuel_km_high':
      APP.nav('vehicle');
      setTimeout(function() {
        APP.switchTab('info');
        setTimeout(function() { _renderCostAlertCard(meta); }, 200);
      }, 350);
      break;
    default:
      APP.nav('vehicle');
      setTimeout(function() { APP.switchTab('garage'); }, 350);
      break;
  }
}

function _renderFuelAlertCard(meta) {
  var mount = document.getElementById('fuel-alert-card-mount');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'fuel-alert-card-mount';
    var infoTab = document.getElementById('vehicle-tab-info');
    if (infoTab) infoTab.insertBefore(mount, infoTab.firstChild);
  }
  var consumption = (meta && meta.fuelConsumption) ? meta.fuelConsumption : '—';
  var threshold   = (meta && meta.threshold)       ? meta.threshold       : '12';
  mount.innerHTML =
    '<div class="notif-card notif-urgent" style="margin-bottom:12px;direction:rtl">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        SEVERITY_ICONS.urgent +
        '<div style="font-size:15px;font-weight:700">⛽ צריכת דלק חריגה</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--notif-text-secondary);line-height:1.8">' +
        '<div>צריכה ממוצעת: <b style="color:#fff">' + _escHtml(String(consumption)) + ' ל/100קמ</b></div>' +
        '<div>סף מקובל: <b style="color:#fff">' + _escHtml(String(threshold)) + ' ל/100קמ</b></div>' +
      '</div>' +
      '<button onclick="APP._fireFieldEvent&&APP._fireFieldEvent(\'fuel_report\',{})" ' +
        'style="margin-top:12px;width:100%;padding:10px;background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);border-radius:10px;color:#f59e0b;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">' +
        'דווח לצ\'ק-אפ ←' +
      '</button>' +
    '</div>';
}

function _renderCostAlertCard(meta) {
  var mount = document.getElementById('cost-alert-card-mount');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'cost-alert-card-mount';
    var infoTab = document.getElementById('vehicle-tab-info');
    if (infoTab) infoTab.insertBefore(mount, infoTab.firstChild);
  }
  var costPerKm    = (meta && meta.costPerKm)    ? meta.costPerKm    : '—';
  var fleetAverage = (meta && meta.fleetAverage) ? meta.fleetAverage : '—';
  mount.innerHTML =
    '<div class="notif-card notif-info" style="margin-bottom:12px;direction:rtl">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        SEVERITY_ICONS.info +
        '<div style="font-size:15px;font-weight:700">📊 עלות לקמ חריגה</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--notif-text-secondary);line-height:1.8">' +
        '<div>עלות לקמ ברכבך: <b style="color:#fff">₪' + _escHtml(String(costPerKm)) + '</b></div>' +
        '<div>ממוצע צי: <b style="color:#fff">₪' + _escHtml(String(fleetAverage)) + '</b></div>' +
      '</div>' +
      '<button onclick="APP.nav&&APP.nav(\'fuel\')" ' +
        'style="margin-top:12px;width:100%;padding:10px;background:rgba(139,92,246,0.18);border:1px solid rgba(139,92,246,0.35);border-radius:10px;color:#8b5cf6;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">' +
        'לדוח מלא ←' +
      '</button>' +
    '</div>';
}

/* ══════════════════════════════════════════════════════════════
   Firebase Realtime DB — Cross-Device Sync
   מבנה: /driverData/{uid}/notifications/{ts}, pendingGarage, approvedGarage, reminders/{id}
══════════════════════════════════════════════════════════════ */

/** מחזיר DB reference לנתיב תחת /driverData/{uid}/... — null אם לא מחובר */
function _fbRef(path) {
  if (!_fbDb || !STATE.firebaseUid) return null;
  return _fbDb.ref('driverData/' + STATE.firebaseUid + (path ? '/' + path : ''));
}

/* ── Notifications ── */

/** שמירת התראה בודדת — key=ts מאפשר overwrite בטוח אם אותה התראה מגיעה שוב */
function _fbSaveNotif(item) {
  var ref = _fbRef('notifications/' + String(item.ts));
  if (!ref || !item || !item.ts) return;
  ref.set(item).catch(function(e) { console.warn('[fbSync] saveNotif:', e.message); });
}

/** מחיקת התראה + הוספה ל-deletedTs blacklist — מונע GAS re-pull מלהחיות אותה */
function _fbDeleteNotif(id) {
  var notifRef   = _fbRef('notifications/' + String(id));
  var deletedRef = _fbRef('deletedTs/' + String(id));
  if (!notifRef) return;
  notifRef.remove().catch(function(e) { console.warn('[fbSync] deleteNotif:', e.message); });
  if (deletedRef) deletedRef.set(true).catch(function() {});
}

/** ניקוי כל ההתראות + שמירת clearedAt — מתפשט real-time לכל המכשירים */
function _fbClearAllNotifs(clearedAt) {
  var notifRef   = _fbRef('notifications');
  var clearedRef = _fbRef('clearedAt');
  if (!notifRef) return;
  notifRef.remove().catch(function() {});
  if (clearedRef) clearedRef.set(clearedAt || Date.now()).catch(function() {});
}

/* ── Garage State ── */

/** שמירת/עדכון בקשת מוסך פתוחה — מופיעה בכל מכשירי הנהג מיידית */
function _fbSetPendingGarage(data) {
  var ref = _fbRef('pendingGarage');
  if (!ref) return;
  ref.set(data).catch(function(e) { console.warn('[fbSync] setPendingGarage:', e.message); });
}

/** מחיקת בקשת מוסך — בעקבות ביטול / אישור / דחייה */
function _fbClearPendingGarage() {
  var ref = _fbRef('pendingGarage');
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] clearPendingGarage:', e.message); });
}

/** שמירת פרטי מוסך מאושר — כתובת, שעות, הערת מנהל */
function _fbSetApprovedGarage(data) {
  var ref = _fbRef('approvedGarage');
  if (!ref) return;
  ref.set(data).catch(function(e) { console.warn('[fbSync] setApprovedGarage:', e.message); });
}

/** מחיקת פרטי מוסך מאושר */
function _fbClearApprovedGarage() {
  var ref = _fbRef('approvedGarage');
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] clearApprovedGarage:', e.message); });
}

/** שמירת תור פעיל — סנכרון בין מכשירי הנהג */
function _fbSetActiveAppointment(data) {
  var ref = _fbRef('activeAppointment');
  if (!ref) return;
  ref.set(data).catch(function(e) { console.warn('[fbSync] setActiveAppointment:', e.message); });
}

/** מחיקת תור פעיל */
function _fbClearActiveAppointment() {
  var ref = _fbRef('activeAppointment');
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] clearActiveAppointment:', e.message); });
}

/* ── Reminders ── */

/** שמירת תזכורת בודדת — id = createdAt timestamp */
function _fbSaveReminder(reminder) {
  var id  = String(reminder.id || reminder.createdAt || Date.now());
  var ref = _fbRef('reminders/' + id);
  if (!ref) return;
  ref.set(reminder).catch(function(e) { console.warn('[fbSync] saveReminder:', e.message); });
}

/** מחיקת תזכורת בודדת */
function _fbDeleteReminder(id) {
  var ref = _fbRef('reminders/' + String(id));
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] deleteReminder:', e.message); });
}

/* ── Master Sync Init ── */

/** מפעיל את כל ה-listeners — נקרא פעם אחת מ-_fbSignIn */
function _initFbSync() {
  _initFbNotifSync();
  _initFbGarageSync();
  _initFbReminderSync();
}

/* ── Listener: Notifications ── */
function _initFbNotifSync() {
  var ref = _fbRef('notifications');
  if (!ref) return;

  // Listener על כלל ההתראות
  ref.on('value', function(snap) {
    try {
      var data  = snap.val() || {};
      var items = Object.keys(data)
        .map(function(k) { return data[k]; })
        .filter(function(n) { return n && n.ts; })
        .sort(function(a, b) { return b.ts - a.ts; })
        .slice(0, 30);

      localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(items));

      var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
      var unread = items.filter(function(n) { return n.ts > clearedAt; }).length;
      _applyBadgeCount(unread);

      if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory();
    } catch(e) { console.warn('[fbSync] notif onValue:', e.message); }
  }, function(err) { console.warn('[fbSync] notif listener:', err.message); });

  // Listener על clearedAt — ניקוי הכל ממכשיר אחר
  var clearedRef = _fbRef('clearedAt');
  if (clearedRef) {
    clearedRef.on('value', function(snap) {
      var remote = snap.val();
      if (!remote) return;
      var local = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
      if (remote > local) {
        localStorage.setItem('driver_notif_cleared_at', String(remote));
        localStorage.setItem('driver_notif_unread', '0');
        localStorage.setItem(_NOTIF_HISTORY_KEY, '[]');
        _applyBadgeCount(0);
        if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory();
      }
    });
  }

  // Listener על deletedTs — סנכרון blacklist מחיקות בין מכשירים
  var deletedRef = _fbRef('deletedTs');
  if (deletedRef) {
    deletedRef.on('value', function(snap) {
      var data = snap.val() || {};
      var tsList = Object.keys(data).map(Number).filter(Boolean);
      if (tsList.length) localStorage.setItem('driver_notif_deleted_ts', JSON.stringify(tsList));
    });
  }
}

/* ── Listener: Garage State ── */
function _initFbGarageSync() {
  // Pending garage — בקשה פתוחה
  var pendingRef = _fbRef('pendingGarage');
  if (pendingRef) {
    pendingRef.on('value', function(snap) {
      try {
        var data    = snap.val();
        var prevRaw = localStorage.getItem('pendingGarageRequest');
        if (data) {
          // Cancelled on another device — clear everywhere and remove the marker
          if (data.status === 'cancelled') {
            if (prevRaw) {
              localStorage.removeItem('pendingGarageRequest');
              if (APP._garagePollTimer) APP._garageStopPoll();
              if (STATE.helpMenuOpen && APP._garageView) APP.helpGarage();
            }
            _fbClearPendingGarage();
            return;
          }
          // Normal cross-device sync
          var newStr = JSON.stringify(data);
          if (prevRaw !== newStr) {
            localStorage.setItem('pendingGarageRequest', newStr);
            if (STATE.helpMenuOpen && APP._garageView) APP.helpGarage();
          }
        }
      } catch(e) { console.warn('[fbSync] pendingGarage onValue ERROR:', e.message); }
    }, function(err) { console.error('[fbSync] pendingGarage listener PERMISSION ERROR:', err.message); });
  }

  // Approved garage — פרטי מוסך מאושר
  var approvedRef = _fbRef('approvedGarage');
  if (approvedRef) {
    approvedRef.on('value', function(snap) {
      try {
        var data    = snap.val();
        var prevRaw = localStorage.getItem('approvedGarageRequest');
        if (data) {
          var newStr = JSON.stringify(data);
          if (prevRaw !== newStr) {
            localStorage.setItem('approvedGarageRequest', newStr);
            if (STATE.helpMenuOpen && APP._garageView) APP.helpGarage();
          }
        } else {
          if (prevRaw) {
            localStorage.removeItem('approvedGarageRequest');
            if (STATE.helpMenuOpen && APP._garageView) APP.helpGarage();
          }
        }
      } catch(e) { console.warn('[fbSync] approvedGarage onValue:', e.message); }
    });
  }

  // Active appointment — תור פעיל, סנכרון בין מכשירים
  var apptRef = _fbRef('activeAppointment');
  if (apptRef) {
    apptRef.on('value', function(snap) {
      try {
        var data    = snap.val();
        var prevRaw = localStorage.getItem('activeGarageAppointment');
        if (data) {
          var newStr = JSON.stringify(data);
          if (prevRaw !== newStr) {
            localStorage.setItem('activeGarageAppointment', newStr);
            if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
          }
        } else if (prevRaw) {
          localStorage.removeItem('activeGarageAppointment');
          if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
        }
      } catch(e) { console.warn('[fbSync] activeAppointment onValue:', e.message); }
    });
  }
}

/* ── Listener: Reminders ── */
function _initFbReminderSync() {
  var ref = _fbRef('reminders');
  if (!ref) return;

  ref.on('value', function(snap) {
    try {
      var data = snap.val() || {};
      var reminders = Object.keys(data)
        .map(function(k) { return data[k]; })
        .filter(function(r) { return r && r.date; })
        .sort(function(a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
      localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
    } catch(e) { console.warn('[fbSync] reminders onValue:', e.message); }
  });
}

/* ══ Notification History — global functions (called from IIFE + app logic) ══ */
var _NOTIF_HISTORY_KEY = 'driver_notif_history';

function getNotifHistory() {
  try {
    var raw = JSON.parse(localStorage.getItem(_NOTIF_HISTORY_KEY) || '[]');
    // Deduplicate: prefer first occurrence (highest ts = most recent, since list is unshifted)
    var seen = {};
    var cleaned = raw.filter(function(n) {
      // Primary key: eventId+alertType (most reliable)
      var eidKey = n.eventId ? (n.eventId + '|' + (n.alertType || '')) : null;
      if (eidKey) {
        if (seen[eidKey]) return false;
        seen[eidKey] = true;
      }
      // Fallback key: ts
      var tsKey = 'ts:' + n.ts;
      if (seen[tsKey]) return false;
      seen[tsKey] = true;
      return true;
    });
    // Write back cleaned list if duplicates were found
    if (cleaned.length !== raw.length) {
      try { localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(cleaned)); } catch(_) {}
    }
    return cleaned;
  } catch(e) { return []; }
}

function saveNotifToHistory(payload) {
  try {
    var notif = payload.notification || {};
    var meta  = payload.data || {};
    var ts    = payload.ts || Date.now();

    // Respect "clear all" — drop notifications older than last clear
    var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
    if (ts <= clearedAt) return;

    // Auto-clear garage pending state when approval/rejection arrives
    var alertType = meta.alertType || '';
    if (alertType === 'garage_approved' || alertType === 'garage_rejected') {
      try { localStorage.removeItem('pendingGarageRequest'); } catch(_e) {}
      _fbClearPendingGarage();
    }
    // שמור פרטי אישור מוסך — ישמשו את מסך "פרטי המוסך" המאושר
    if (alertType === 'garage_approved') {
      try {
        var _approvedData = {
          eventId:       meta.eventId       || '',
          reasonLabel:   meta.reasonLabel   || '',
          requestNumber: meta.requestNumber || '',
          managerNote:   meta.managerNote   || '',
          approvedAt:    ts,
          vehicleId:     meta.vehicleId     || ''
        };
        localStorage.setItem('approvedGarageRequest', JSON.stringify(_approvedData));
        _fbSetApprovedGarage(_approvedData);
      } catch(_e) {}
    }

    var list = getNotifHistory();
    // Dedup by ts
    if (list.some(function(n) { return n.ts === ts; })) return;
    // Dedup by eventId — prevents duplicate when same push arrives via two code paths
    if (meta.eventId && list.some(function(n) { return n.eventId === meta.eventId && n.alertType === alertType; })) return;
    var newItem = {
      id:                  ts,
      title:               notif.title || 'עלה — התראה',
      body:                notif.body  || '',
      alertType:           alertType || 'plan',
      vehicleId:           meta.vehicleId || '',
      requestNumber:       meta.requestNumber || '',
      reasonLabel:         meta.reasonLabel || '',
      originalDescription: meta.originalDescription || '',
      managerNote:         meta.managerNote || '',
      eventId:             meta.eventId || '',
      ts:                  ts
    };
    list.unshift(newItem);
    if (list.length > 30) list = list.slice(0, 30);
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
    incrementUnreadBadge();
    if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory();
    _fbSaveNotif(newItem); // ← Firebase sync
  } catch(e) {}
}

function clearNotifHistory() {
  try {
    localStorage.removeItem(_NOTIF_HISTORY_KEY);
    localStorage.removeItem('driver_notif_deleted_ts');
    var now = Date.now();
    localStorage.setItem('driver_notif_cleared_at', String(now));
    localStorage.setItem('driver_notif_unread', '0');
    _applyBadgeCount(0);
    _fbClearAllNotifs(now); // ← Firebase sync — ניקוי מתפשט לכל המכשירים

    // Tell SW to drop its pending buffer (prevents replay on next serviceWorker.ready).
    // Use serviceWorker.ready so this works even when controller is null (new SW install / SW update).
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(function(reg) {
          if (reg.active) reg.active.postMessage({ type: 'clear-pending-notifs' });
        }).catch(function(){});
      }
    } catch(_) {}

    // Tell GAS to truncate the server-side log (prevents re-pull on next loadFullData)
    try {
      var vid = (typeof STATE !== 'undefined' && STATE.vehicle && STATE.vehicle.id) ? STATE.vehicle.id : '';
      if (vid && typeof GAS_URL !== 'undefined' && GAS_URL) {
        fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'driver_clear_notifs', idToken: (STATE && STATE.idToken) || '', vehicleId: vid, clearedAt: now })
        }).catch(function(){});
      }
    } catch(_) {}
  } catch(e) {}
}

function deleteNotifById(id) {
  try {
    var ts = parseInt(id, 10);
    var list = getNotifHistory().filter(function(n) { return String(n.id) !== String(id); });
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
    // Track deleted ts so GAS re-pull doesn't resurrect it
    if (ts) {
      var del = JSON.parse(localStorage.getItem('driver_notif_deleted_ts') || '[]');
      if (del.indexOf(ts) === -1) del.push(ts);
      if (del.length > 100) del = del.slice(-100);
      localStorage.setItem('driver_notif_deleted_ts', JSON.stringify(del));
    }
    _fbDeleteNotif(id); // ← Firebase sync — מחיקה + blacklist לכל המכשירים
  } catch(e) {}
}

function _applyBadgeCount(n) {
  var label = n > 99 ? '99+' : String(n);
  var show = n > 0;
  ['alert-badge', 'alerts-badge-bottom'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = label;
    el.classList.toggle('hidden', !show);
  });
}

function incrementUnreadBadge() {
  try {
    var n = parseInt(localStorage.getItem('driver_notif_unread') || '0', 10) || 0;
    n++;
    localStorage.setItem('driver_notif_unread', String(n));
    _applyBadgeCount(n);
  } catch(e) {}
}

function clearUnreadBadge() {
  try {
    localStorage.setItem('driver_notif_unread', '0');
    _applyBadgeCount(0);
  } catch(e) {}
}

let STATE = {
  user: null,
  vehicle: null,
  documents: [],
  insurance: [],
  history: [],
  alerts: [],
  fuelData: null,
  fuelSelectedMonth: null,
  currentScreen: 'home',
  currentTab: 'info',
  idToken: null,
  govData:    undefined,  // undefined=טרם נטען | null=שגיאה/לא נמצא | object=נטען
  govWLTP:    undefined,
  govLoading: false,
  helpMenuOpen:  false,
  helpGps:       null,
  firebaseUid:   null   // מאוכלס אחרי _fbSignIn — משמש כ-key ב-/driverData/{uid}/
};

/* ══ GAS API ══ */
function _isTokenExpired(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    return !payload.exp || (payload.exp * 1000) < Date.now();
  } catch(e) { return true; }
}

/* ══ Firebase Auth — משתמש ב-Google idToken הקיים, ללא לוגין נוסף לנהג ══ */
async function _fbSignIn(googleIdToken) {
  if (!_fbAuth || !googleIdToken || googleIdToken === 'demo_token') return false;
  try {
    var credential = firebase.auth.GoogleAuthProvider.credential(googleIdToken);
    var userCred   = await _fbAuth.signInWithCredential(credential);
    // אם onAuthStateChanged כבר הפעיל את הסנכרון — לא מפעיל שוב
    if (!_fbSyncReady) {
      _fbSyncReady      = true;
      STATE.firebaseUid = userCred.user.uid;
      console.log('[fbAuth] signed in, uid:', STATE.firebaseUid);
      _initFbSync();
    }
    return true;
  } catch(e) {
    console.warn('[fbAuth] signInWithCredential failed (token expired?) — onAuthStateChanged יטפל:', e.message);
    return false;
  }
}

function _showSessionExpiredOverlay() {
  var el = document.getElementById('session-expired-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'session-expired-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,41,66,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;direction:rtl';
    el.innerHTML =
      '<div style="font-size:40px">🔒</div>' +
      '<div style="color:#fff;font-size:18px;font-weight:700">פג תוקף ההתחברות</div>' +
      '<div style="color:#94a3b8;font-size:14px">יש להתחבר מחדש להמשך</div>' +
      '<button onclick="window.location.reload()" style="background:#2563eb;color:#fff;border:none;border-radius:12px;padding:12px 32px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px">🔄 התחבר מחדש</button>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

function _sessionExpired() {
  // Firebase signOut — מנתק listener + מנקה session
  try { if (_fbAuth) _fbAuth.signOut(); } catch(_e) {}
  STATE.firebaseUid = null;
  localStorage.removeItem(SESSION_KEY);
  STATE.idToken = null;
  STATE.vehicle = null;
  STATE.user = null;

  // Try silent Google token refresh — if user's Google session is still active,
  // handleGoogleCredential will fire automatically and re-login without user interaction.
  if (window.google && google.accounts && google.accounts.id && GOOGLE_CLIENT_ID) {
    var _fallbackTimer = setTimeout(_showSessionExpiredOverlay, 4000);
    try {
      google.accounts.id.prompt(function(notification) {
        // prompt was suppressed or dismissed — give up and show overlay
        if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
          clearTimeout(_fallbackTimer);
          _showSessionExpiredOverlay();
        }
        // If displayed and user accepts → handleGoogleCredential fires → re-login succeeds → overlay never shown
      });
    } catch(e) {
      clearTimeout(_fallbackTimer);
      _showSessionExpiredOverlay();
    }
    return;
  }

  _showSessionExpiredOverlay();
}

async function gasPost(action, extra, opts) {
  extra = extra || {};
  opts  = opts  || {};
  if (!GAS_URL) return mockResponse(action, extra);

  if (STATE.idToken && STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken)) {
    if (!opts.silent) { _sessionExpired(); throw new Error('session_expired'); }
    return { ok: false, error: 'session_expired' };
  }

  const params = Object.assign({ action, idToken: STATE.idToken }, extra);
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  const resp = await fetch(url, { method: 'GET' });
  const data = await resp.json();
  if (!data.ok) {
    if (!opts.silent && data.error && (data.error.includes('idToken') || data.error === 'unauthorized')) {
      _sessionExpired();
      throw new Error('session_expired');
    }
    if (opts.silent) return data;
    throw new Error(data.error || 'שגיאת שרת');
  }
  return data;
}

/* ══ Demo / Mock mode (כשאין GAS_URL) ══ */
function mockResponse(action) {
  const mockVehicle = {
    id: 'V001', num: '123-45-678', cat: 'פרטי', make: 'Toyota', model: 'Highlander',
    year: '2022', color: 'לבן', holder: 'משה כהן', dept: 'אגף שיקום',
    email: 'demo@aleh.org', phone: '052-1234567',
    licExp: '2026-08-15', insCompExp: '2025-06-10', insFullExp: '2026-01-20',
    lastServiceDate: '2025-01-10', lastServiceKm: '45000', nextServiceKm: '50000',
    currentKm: 47850,
    testDue: '2026-08-15', testDone: '',
    photoLink: 'https://toyota-select.co.il/wp-content/uploads/2025/04/MODELS-SELECT-8.png',
    notes: '',
    garage: {
      id: 'G001',
      name: 'מוסך טויוטה תל אביב',
      address: 'רחוב הברזל 12, תל אביב',
      phone: '03-6789012',
      contactName: 'יוסי כהן',
      contactPhone: '052-9876543',
      bookingUrl: 'https://toyota.co.il/service/booking'
    }
  };
  if (action === 'driver_auth') {
    return { ok: true, email: 'demo@aleh.org', vehicle: mockVehicle, orgName: 'עלה' };
  }
  if (action === 'driver_vehicle') {
    return {
      ok: true,
      vehicle: mockVehicle,
      fuelData: {
        hasData: true,
        monthKey: '2026-04',
        actualL100: 9.3,
        standardL100: 10.0,
        status: 'excellent',
        statusLabel: 'מצוין',
        kmThisMonth: 1210,
        litersThisMonth: 112.5,
        costThisMonth: 839,
        savingsL: 8.5,
        savingsNIS: 63,
        months: [
          {key:'2025-11',label:"נוב'",l100:10.6,km:990,liters:104.9,cost:783,fills:5,status:'warn',statusLabel:'גבוה'},
          {key:'2025-12',label:"דצ'",l100:10.4,km:1050,liters:109.2,cost:815,fills:6,status:'warn',statusLabel:'גבוה'},
          {key:'2026-01',label:"ינו'",l100:9.8,km:980,liters:96.0,cost:717,fills:5,status:'good',statusLabel:'תקין'},
          {key:'2026-02',label:"פבר'",l100:9.5,km:1180,liters:112.1,cost:837,fills:6,status:'good',statusLabel:'תקין'},
          {key:'2026-03',label:'מרץ',l100:9.1,km:1320,liters:120.1,cost:896,fills:7,status:'excellent',statusLabel:'מצוין'},
          {key:'2026-04',label:"אפר'",l100:9.3,km:1210,liters:112.5,cost:839,fills:6,status:'excellent',statusLabel:'מצוין'}
        ],
        fuelInsight: {
          text: 'באפריל נסעת ביעילות מרשימה — חסכת 63 ₪ בדלק. החיסכון הזה מממן שעתיים של ריפוי בדיבור לנועה בת 5, שכל שעה כזו שווה לה עולם.',
          generatedAt: '2026-05-01T03:02:15',
          monthKey: '2026-04'
        }
      },
      documents: [
        { id: 'D1', type: 'רישיון רכב', date: '2026-08-15', link: '', notes: '' },
        { id: 'D2', type: 'ביטוח חובה', date: '2025-06-10', link: '', notes: '' },
        { id: 'D3', type: 'ביטוח מקיף', date: '2026-01-20', link: '', notes: '' }
      ],
      insurance: [
        { id: 'I1', year: '2025', company: 'מגדל', compCost: 3200, fullCost: 4800 }
      ],
      history: [
        { date: '2025-01-10', garage: 'מוסך טויוטה תל אביב', city: 'תל אביב', km: '45000', type: 'טיפול שוטף' },
        { date: '2024-07-22', garage: 'מוסך טויוטה ירושלים', city: 'ירושלים', km: '38000', type: 'טיפול תקופתי' },
        { date: '2024-01-05', garage: 'מוסך טויוטה תל אביב', city: 'תל אביב', km: '30500', type: 'טיפול שוטף' }
      ]
    };
  }
  if (action === 'driver_update_km') return { ok: true, km: 45000 };
  if (action === 'driver_report_fault') return { ok: true };
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
}

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

/* --- Web Audio Notification Sound System --- */
var _notifAudioCtx = null;

function _playNotifSound(alertType) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.AudioContext && !window.webkitAudioContext) return;
  try {
    if (!_notifAudioCtx) {
      _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    var ctx = _notifAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    var TONES = {
      overdue:         [880, 660, 880],
      urgent:          [660],
      plan:            [440],
      km_update:       [330],
      fuel_high:       [550],
      fuel_km_high:    [440],
      test_urgent:     [880, 660],
      test_due:        [550],
      garage_approved: [523, 659],
      garage_rejected: [220]
    };

    var tones = TONES[alertType] || [440];
    var now = ctx.currentTime;
    var NOTE_DUR = 0.20, ATTACK = 0.01, DECAY = 0.10, RELEASE = 0.20;

    tones.forEach(function(freq, i) {
      var start = now + i * (NOTE_DUR + 0.04);
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + ATTACK);
      gain.gain.linearRampToValueAtTime(0.18 * 0.30, start + ATTACK + DECAY);
      gain.gain.linearRampToValueAtTime(0, start + NOTE_DUR + RELEASE);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + NOTE_DUR + RELEASE + 0.02);
    });
  } catch(e) {
    console.warn('[notif-sound] failed:', e);
  }
}

async function _fireFieldEvent(type, details, opts) {
  var gps = STATE.helpGps || { lat: null, lng: null };
  var payload = { type: type, lat: gps.lat || '', lng: gps.lng || '', details: JSON.stringify(details || {}) };
  try {
    // silent:true so gasPost returns business-logic errors (e.g. duplicate_pending_request)
    // instead of throwing — callers that care (garage) check result.ok themselves
    return await gasPost('driver_field_event', payload, Object.assign({ silent: true }, opts || {}));
  } catch(e) {
    if (!navigator.onLine) {
      _queueEvent(Object.assign({ type: type, details: details }, gps));
      return { ok: true, eventId: 'queued', queued: true };
    }
    return { ok: false, error: String(e) };
  }
}

window.addEventListener('online', function() { _syncPendingEvents(); });

/* ══ Session ══ */
function saveSession(token, vehicleData, userInfo) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      token, vehicleData, userInfo, ts: Date.now()
    }));
  } catch(e) {}
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || Date.now() - s.ts > SESSION_TTL) return null;
    return s;
  } catch { return null; }
}

/* ══ Auth ══ */
function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID) {
    // Demo mode — skip Google auth
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true
  });
}

async function handleGoogleCredential(response) {
  showLoader();
  try {
    STATE.idToken = response.credential;

    // Parse JWT payload first (to show user info in errors)
    const parts = response.credential.split('.');
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    STATE.user = {
      email: payload.email || '',
      name: payload.name || (payload.email || '').split('@')[0],
      picture: payload.picture || ''
    };

    console.log('[auth] calling driver_auth for', STATE.user.email);
    const result = await gasPost('driver_auth');
    console.log('[auth] result ok:', result.ok);
    STATE.vehicle = result.vehicle;

    saveSession(STATE.idToken, STATE.vehicle, STATE.user);
    _fbSignIn(STATE.idToken).catch(function() {}); // Firebase Auth — non-blocking
    hideLoader();
    showGreeting((result.vehicle && result.vehicle.holder) || STATE.user.name);
    await loadFullData();
    hideGreeting();
    startApp();
  } catch(err) {
    console.error('[auth] error:', err.message);
    showLoginError(err.message);
  }
}

async function demoLogin() {
  showLoader();
  try {
    STATE.idToken = 'demo_token';
    const result = await gasPost('driver_auth');
    STATE.vehicle = result.vehicle;
    STATE.user = { email: 'demo@aleh.org', name: 'משה כהן', picture: '' };
    saveSession(STATE.idToken, STATE.vehicle, STATE.user);
    await loadFullData();
    startApp();
  } catch(err) {
    showLoginError(err.message);
  } finally {
    hideLoader();
  }
}

async function fetchGovData() {
  const v = STATE.vehicle;
  if (!v || !v.num) return;
  const plate = String(v.num).replace(/\D/g, '');
  if (!plate) return;
  STATE.govLoading = true;
  STATE.govData  = undefined;
  STATE.govWLTP  = undefined;
  try {
    // שלב 1: נתוני רישוי לפי לוחית
    const f1  = encodeURIComponent(JSON.stringify({ mispar_rechev: plate }));
    const r1  = await fetch('https://data.gov.il/api/3/action/datastore_search?resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3&filters=' + f1);
    const j1  = await r1.json();
    const reg = (j1.result && j1.result.records && j1.result.records[0]) || null;
    STATE.govData = reg;

    // שלב 2: נתונים טכניים WLTP לפי degem_cd + tozeret_cd
    if (reg && reg.degem_cd && reg.tozeret_cd) {
      const f2 = encodeURIComponent(JSON.stringify({
        degem_cd:   String(reg.degem_cd),
        tozeret_cd: String(reg.tozeret_cd)
      }));
      const r2 = await fetch('https://data.gov.il/api/3/action/datastore_search?resource_id=142afde2-6228-49f9-8a29-9b6c3a0cbe40&filters=' + f2 + '&limit=5');
      const j2 = await r2.json();
      const wRecs = (j2.result && j2.result.records) || [];
      // העדף רשומה שתואמת ramat_gimur, אחרת ראשונה
      const gimur = reg.ramat_gimur;
      STATE.govWLTP = wRecs.find(function(r) { return r.ramat_gimur === gimur; }) || wRecs[0] || null;
    } else {
      STATE.govWLTP = null;
    }
  } catch(e) {
    STATE.govData = null;
    STATE.govWLTP = null;
    console.warn('fetchGovData error:', e);
  }
  STATE.govLoading = false;
  if (STATE.currentTab === 'info' && STATE.currentScreen === 'vehicle') {
    renderVehicleScreen('info');
  }
}

async function loadFullData() {
  try {
    const result = await gasPost('driver_vehicle');
    STATE.vehicle   = result.vehicle;
    STATE.fuelData  = result.fuelData  || null;
    STATE.documents = (result.documents && result.documents.length)
      ? result.documents
      : buildDocumentsFromVehicle(result.vehicle);
    STATE.insurance = result.insurance || [];
    STATE.history   = result.history   || [];
    STATE.alerts    = buildAlerts(STATE.vehicle);
  } catch(e) {
    console.warn('loadFullData error:', e.message);
  }
  // טעינת נתונים טכניים ממשרד התחבורה — ברקע, לא חוסמת
  fetchGovData();
  if ('serviceWorker' in navigator && GAS_URL) registerPush();
  loadNotifHistoryFromGAS();
  _initFbGarageStatusSync();
}

/* ── Listener: garageSync/{vehicleId} — כתיבה ישירה מ-GAS בעת אישור/דחייה ── */
function _initFbGarageStatusSync() {
  if (!_fbDb) return;
  var vehicleId = STATE.vehicle && (STATE.vehicle.num || STATE.vehicle.id);
  if (!vehicleId) return;
  var vehKey = String(vehicleId).replace(/[^0-9A-Za-z_-]/g, '_');
  _fbDb.ref('garageSync/' + vehKey).on('value', function(snap) {
    try {
      var data = snap.val();
      if (!data || !data.status || !data.eventId) return;

      // ── מנהל ביטל תור פעיל ──
      if (data.status === 'cancelled') {
        localStorage.removeItem('activeGarageAppointment');
        _fbClearActiveAppointment();
        if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
        if (typeof showToast === 'function') showToast('❌ התור בוטל על ידי המנהל');
        return;
      }

      // ── מנהל קבע תור מהיומן ──
      if (data.status === 'appointment_set' && data.appointmentDate) {
        var _aSet = {
          eventId:         data.eventId         || '',
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime || '09:00',
          managerNote:     data.managerNote     || '',
          garageName:    (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
          garageAddress: (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
          garagePhone:   (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || ''
        };
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_aSet));
        _fbSetActiveAppointment(_aSet);
        if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
        if (typeof showToast === 'function') showToast('📅 תור נקבע: ' + data.appointmentDate + ' ' + (data.appointmentTime || ''));
        return;
      }

      // ── אישור/דחייה של בקשה ממתינה ──
      var prevRaw = localStorage.getItem('pendingGarageRequest');
      if (!prevRaw) return;
      var pending;
      try { pending = JSON.parse(prevRaw); } catch(e) { return; }
      if (String(pending.eventId) !== String(data.eventId)) return;
      if (data.status === 'approved') {
        localStorage.setItem('approvedGarageRequest', JSON.stringify({
          eventId: data.eventId,
          requestNumber: data.requestNumber,
          reasonLabel: data.reasonLabel,
          managerNote: data.managerNote,
          garageInfo: data.garageInfo || {},
          approvedAt: data.updatedAt
        }));
        localStorage.removeItem('pendingGarageRequest');
        _fbClearPendingGarage();
        if (typeof APP !== 'undefined' && STATE.currentScreen === 'vehicle') {
          if (APP.switchTab) APP.switchTab('garage');
        }
      } else if (data.status === 'rejected') {
        localStorage.removeItem('pendingGarageRequest');
        _fbClearPendingGarage();
        if (typeof showToast === 'function') {
          showToast('בקשת המוסך נדחתה' + (data.managerNote ? ': ' + data.managerNote : ''));
        }
        if (typeof APP !== 'undefined' && STATE.currentScreen === 'vehicle') {
          if (APP.switchTab) APP.switchTab('garage');
        }
      }
    } catch(e) { console.warn('[fbSync] garageStatusSync onValue:', e.message); }
  }, function(err) { console.warn('[fbSync] garageStatusSync listener:', err.message); });
}

async function loadNotifHistoryFromGAS() {
  if (!STATE.vehicle || !STATE.vehicle.id) return;
  try {
    const vid = STATE.vehicle.id;
    const resp = await fetch(GAS_URL + '?action=driver_get_notifs&vid=' + encodeURIComponent(vid));
    const data = await resp.json();

    // Respect user's "clear all" and individual deletes — filter by both
    var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
    var deletedTs = new Set(JSON.parse(localStorage.getItem('driver_notif_deleted_ts') || '[]'));
    var gasNotifs = (data.ok && data.notifications) ? data.notifications.filter(function(n) {
      return n.ts > clearedAt && !deletedTs.has(n.ts);
    }) : [];

    if (!gasNotifs.length) {
      // Nothing from GAS — just sync badge with localStorage
      var stored = parseInt(localStorage.getItem('driver_notif_unread') || '0', 10);
      _applyBadgeCount(stored);
      return;
    }

    // Merge GAS data into localStorage (dedup by ts)
    var existing = [];
    try { existing = JSON.parse(localStorage.getItem('driver_notif_history') || '[]'); } catch(e) {}
    var existingIds = new Set(existing.map(function(n) { return n.ts; }));
    var merged = existing.slice();
    gasNotifs.forEach(function(n) {
      if (!existingIds.has(n.ts)) {
        merged.push({ title: n.title, body: n.body, alertType: n.alertType, ts: n.ts, id: n.ts });
      }
    });
    merged.sort(function(a, b) { return b.ts - a.ts; });
    if (merged.length > 30) merged = merged.slice(0, 30);
    localStorage.setItem('driver_notif_history', JSON.stringify(merged));

    // Always update badge — GAS is source of truth for unread count
    var lastSeen = parseInt(localStorage.getItem('driver_notif_last_seen') || '0', 10);
    var unread = gasNotifs.filter(function(n) { return n.ts > lastSeen; }).length;
    localStorage.setItem('driver_notif_unread', String(unread));
    _applyBadgeCount(unread);

    if (STATE.currentScreen === 'alerts') renderNotifHistory();
  } catch(e) { console.warn('loadNotifHistoryFromGAS:', e.message); }
}

/* ══ Alerts ══ */
function buildAlerts(v) {
  if (!v) return [];
  const alerts = [];
  const today = new Date(); today.setHours(0,0,0,0);

  function daysLeft(dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr) - today) / 86400000);
  }

  // טסט — רלוונטי לנהג (60 ימים מראש)
  if (!v.testDone && v.testDue) {
    const d = daysLeft(v.testDue);
    if (d !== null && d <= 60) {
      const type = d <= 7 ? 'red' : 'warn';
      alerts.push({ type, title: 'טסט רכב', sub: formatDate(v.testDue), days: d, label: type === 'red' ? 'דחוף' : 'להתייחסות' });
    }
  }

  // טיפול לפי ק"מ — הגנה מפני ערכים לא תקינים
  const lastKm = parseInt(v.lastServiceKm) || 0;
  const nextKm = parseInt(v.nextServiceKm) || 0;
  if (lastKm > 0 && nextKm > 0) {
    const kmLeft = nextKm - lastKm;
    if (kmLeft < -1000) {
      // רק אם עבר ב-1000+ ק"מ — לא עבור שגיאות נתונים
      alerts.push({ type: 'red', title: 'טיפול באיחור!', sub: 'עבר ב-' + Math.abs(kmLeft).toLocaleString('he') + ' ק"מ', days: null, label: 'דחוף' });
    } else if (kmLeft < 3000) {
      alerts.push({ type: 'warn', title: kmLeft < 0 ? 'עבר מועד טיפול' : 'טיפול קרוב', sub: kmLeft < 0 ? 'עבר ב-' + Math.abs(kmLeft).toLocaleString('he') + ' ק"מ' : 'נותרו ' + kmLeft.toLocaleString('he') + ' ק"מ', days: null, label: 'להתייחסות' });
    }
  }

  return alerts;
}

/* ══ Documents fallback ══ */
function buildDocumentsFromVehicle(v) {
  if (!v) return [];
  const docs = [];
  if (v.licExp)     docs.push({ id: 'lic',  type: 'רישיון רכב',  date: v.licExp,    link: v.licLink    || '' });
  if (v.insCompExp) docs.push({ id: 'comp', type: 'ביטוח חובה',  date: v.insCompExp, link: v.insCompLink || '' });
  if (v.insFullExp) docs.push({ id: 'full', type: 'ביטוח מקיף',  date: v.insFullExp, link: v.insFullLink || '' });
  return docs;
}

/* ══ Drive URL → image URL ══ */
function driveToImgUrl(link) {
  if (!link) return null;
  const m = link.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
  if (link.startsWith('http')) return link;
  return null;
}

/* ══ Car image lookup ══ */
const CAR_IMAGE_MAP = {
  'toyota highlander':    'https://toyota-select.co.il/wp-content/uploads/2025/04/MODELS-SELECT-8.png',
  'toyota sienna':        'https://di-uploads-pod42.dealerinspire.com/toyotaofmurfreesboro/uploads/2022/06/2023-Toyota-Sienna-XSE-scaled.jpg',
  'toyota rav4':          'https://www.motortrend.com/uploads/2022/09/2023-Toyota-RAV4-1.jpg',
  'toyota camry':         'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Camry-1.jpg',
  'toyota corolla':       'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Corolla-1.jpg',
  'toyota corolla cross': 'https://di-uploads-pod42.dealerinspire.com/toyotaofmurfreesboro/uploads/2022/06/2023-Toyota-Corolla-Cross-scaled.jpg',
  'toyota yaris':         'https://www.motortrend.com/uploads/2022/09/2023-Toyota-Yaris-1.jpg',
  'toyota land cruiser':  'https://www.motortrend.com/uploads/2023/03/2024-Toyota-Land-Cruiser-1.jpg',
  'volkswagen transporter': 'https://www.motortrend.com/uploads/2022/01/2022-VW-Transporter-1.jpg',
  'ford transit':         'https://www.motortrend.com/uploads/2021/11/2022-Ford-Transit-1.jpg',
};

function getCarImageUrl(make, model) {
  const key = [make, model].filter(Boolean).join(' ').toLowerCase().trim();
  if (CAR_IMAGE_MAP[key]) return CAR_IMAGE_MAP[key];
  const makeOnly = (make || '').toLowerCase().trim();
  for (const k of Object.keys(CAR_IMAGE_MAP)) {
    if (k.startsWith(makeOnly + ' ')) return CAR_IMAGE_MAP[k];
  }
  return null;
}

/* ══ Swipe navigation ══ */
function initSwipe() {
  const SCREENS = ['home', 'alerts', 'vehicle', 'history'];
  let startX = 0, startY = 0, _swipeOnItem = false;

  document.getElementById('app').addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    // Flag if touch started on a swipeable notification item — let item handler own it
    _swipeOnItem = !!(e.target && e.target.closest && e.target.closest('.nh-item'));
  }, { passive: true });

  document.getElementById('app').addEventListener('touchend', function(e) {
    if (_swipeOnItem) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    // Skip swipe when interacting with inputs
    if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
    const idx = SCREENS.indexOf(STATE.currentScreen);
    if (idx === -1) return;
    // RTL: swipe left (dx<0) = go deeper left = higher index
    if (dx < 0 && idx < SCREENS.length - 1) APP.nav(SCREENS[idx + 1]);
    else if (dx > 0 && idx > 0) APP.nav(SCREENS[idx - 1]);
  }, { passive: true });
}

/* ══ Start App ══ */
function startApp() {
  hideLoader();
  document.getElementById('app').classList.remove('hidden');
  renderAll();
  initSwipe();
  setTimeout(APP._checkGarageReminders, 1500);
  setInterval(APP._checkGarageReminders, 60000); // re-check every 60s while app is open

  // Handle cold-start from OS notification tap (SW encoded notif in URL)
  try {
    var params = new URLSearchParams(window.location.search);
    var notifParam = params.get('_notif');
    if (notifParam) {
      var payload = JSON.parse(decodeURIComponent(notifParam));
      saveNotifToHistory(payload);
      var alertType = (payload.data && payload.data.alertType) || 'plan';
      setTimeout(function() { navigateForAlertType(alertType, payload.data || {}); }, 600);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  } catch(e) {}
}

function logout() {
  showConfirmModal({
    icon: '👤',
    title: 'התנתקות מהחשבון',
    sub: 'האם תרצה להתנתק?',
    confirmText: 'התנתק',
    onConfirm: () => {
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  });
}

function showConfirmModal({ icon='❓', title='', sub='', confirmText='אישור', onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('cm-icon').textContent = icon;
  document.getElementById('cm-title').textContent = title;
  document.getElementById('cm-sub').textContent = sub;
  const btn = document.getElementById('cm-confirm');
  btn.textContent = confirmText;
  btn.onclick = () => { closeConfirmModal(); onConfirm(); };
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

/* ══ Render ══ */
function renderAll() {
  renderTopBar();
  renderHomeScreen();
  renderAlerts();
  renderHistory();
  renderService();
}

function renderTopBar() {
  if (!STATE.user) return;
  const holderName = (STATE.vehicle && STATE.vehicle.holder) || STATE.user.name;
  const firstName = holderName.split(' ')[0];
  document.getElementById('user-name').textContent = firstName;
  const initialsEl = document.getElementById('user-initials');
  if (initialsEl) {
    initialsEl.textContent = getInitials(holderName);
    initialsEl.style.color = '#fff';
  }
  // Badge managed exclusively by push notification system — re-sync without overriding
  var pushUnread = parseInt(localStorage.getItem('driver_notif_unread') || '0', 10) || 0;
  _applyBadgeCount(pushUnread);
}

function renderHomeScreen() {
  const v = STATE.vehicle;
  if (!v) return;

  document.getElementById('car-name').textContent = ((v.make || '') + ' ' + (v.model || '')).trim();
  document.getElementById('car-plate').textContent = formatPlate(v.num);

  const photo = document.getElementById('car-photo');
  const imgUrl = driveToImgUrl(v.appPhotoLink || v.photoLink) || getCarImageUrl(v.make, v.model);
  if (imgUrl) {
    photo.src = imgUrl;
    photo.onerror = () => { photo.style.display = 'none'; };
  } else {
    document.querySelector('.hero-img-area').style.display = 'none';
  }

  renderServiceProgress();
  renderGarageApptWidget();
  renderFuelWidget();

  const homeAlert = document.getElementById('home-alert');
  const topAlert = STATE.alerts.find(function(a) { return a.type === 'red'; }) || STATE.alerts[0];
  if (topAlert) {
    document.getElementById('home-alert-title').textContent = topAlert.title;
    document.getElementById('home-alert-sub').textContent =
      topAlert.days !== null ? topAlert.days + ' ימים' : topAlert.sub;
    homeAlert.style.borderRightColor = topAlert.type === 'red' ? 'var(--red)' : 'var(--warn)';
    homeAlert.classList.remove('hidden');
  } else {
    homeAlert.classList.add('hidden');
  }
}

function renderFuelWidget() {
  var mount = document.getElementById('fuel-widget-mount');
  if (!mount) return;
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) { mount.innerHTML = ''; return; }

  // find last month with actual data
  var months = fd.months || [];
  var cur = null, curIdx = -1;
  for (var i = months.length - 1; i >= 0; i--) {
    if (months[i].liters > 0) { cur = months[i]; curIdx = i; break; }
  }
  if (!cur) { mount.innerHTML = ''; return; }

  // average liters (exclude current month from avg so comparison is fair)
  var avgLiters = 0, cnt = 0;
  for (var k = 0; k < curIdx; k++) {
    if (months[k].liters > 0) { avgLiters += months[k].liters; cnt++; }
  }
  if (cnt > 0) avgLiters = Math.round(avgLiters / cnt * 10) / 10;

  // vs-average comparison (the core message)
  var diffPct = 0, diffLiters = 0;
  if (avgLiters > 0) {
    diffLiters = Math.round((cur.liters - avgLiters) * 10) / 10;
    diffPct    = Math.round((cur.liters - avgLiters) / avgLiters * 100);
  }

  // derive badge + color + headline sentence
  var badgeClass, badgeIcon, msgColor, headline, subline;
  if (avgLiters === 0) {
    // no history to compare
    badgeClass = 'fw-badge-good'; badgeIcon = '⭐'; msgColor = 'var(--t2)';
    headline = cur.liters + ' ל׳ תודלקו החודש';
    subline  = 'אין עדיין היסטוריה להשוואה';
  } else if (diffPct <= -5) {
    badgeClass = 'fw-badge-excellent'; badgeIcon = '🏆'; msgColor = 'var(--fuel-excellent)';
    headline = 'צריכה נמוכה ב־' + Math.abs(diffPct) + '% מהממוצע';
    subline  = 'חסכת ' + Math.abs(diffLiters) + ' ל׳ לעומת הממוצע שלך (' + avgLiters + ' ל׳)';
  } else if (diffPct < 5) {
    badgeClass = 'fw-badge-good'; badgeIcon = '⭐'; msgColor = 'var(--fuel-good)';
    headline = 'צריכה תקינה — קרוב לממוצע';
    subline  = 'החודש: ' + cur.liters + ' ל׳ · ממוצע: ' + avgLiters + ' ל׳';
  } else if (diffPct < 12) {
    badgeClass = 'fw-badge-warn'; badgeIcon = '⚡'; msgColor = 'var(--fuel-warn)';
    headline = 'צריכה גבוהה ב־' + diffPct + '% מהממוצע';
    subline  = 'תדלקת ' + diffLiters + ' ל׳ יותר מהממוצע שלך (' + avgLiters + ' ל׳)';
  } else {
    badgeClass = 'fw-badge-over'; badgeIcon = '🚨'; msgColor = 'var(--fuel-over)';
    headline = 'צריכה גבוהה ב־' + diffPct + '% מהממוצע';
    subline  = 'תדלקת ' + diffLiters + ' ל׳ יותר מהממוצע שלך (' + avgLiters + ' ל׳)';
  }

  // bar: cur vs average
  var barPct = avgLiters > 0 ? Math.max(4, Math.min(100, Math.round((cur.liters / avgLiters) * 100))) : 60;

  var monthLabel = _heMonthLabel(cur.key) + ' ' + (cur.key + '').slice(0, 4);

  mount.innerHTML =
    '<div class="fuel-widget" onclick="openFuelModal()" role="button" tabindex="0" aria-label="ביצועי דלק">' +
      '<div class="fw-hdr">' +
        '<div class="fw-label">ביצועי דלק · ' + monthLabel + '</div>' +
        '<div class="fw-pill" style="background:' + msgColor + '1a;color:' + msgColor + '">' + cur.liters + ' ל׳</div>' +
      '</div>' +
      '<div class="fw-hero-row">' +
        '<span class="fw-badge ' + badgeClass + '">' + badgeIcon + '</span>' +
        '<span class="fw-headline" style="color:' + msgColor + '">' + headline + '</span>' +
      '</div>' +
      '<div class="fw-sub">' + subline + '</div>' +
      '<div class="fw-bar-bg">' +
        '<div class="fw-bar-fill" style="background:' + msgColor + ';--fw-bar-w:' + barPct + '%"></div>' +
      '</div>' +
      '<div class="fw-bar-labels">' +
        '<span>עלות: ₪' + (cur.cost ? cur.cost.toLocaleString('he') : '—') + '</span>' +
        '<span>' + (cur.km ? cur.km.toLocaleString('he') + ' ק"מ' : '') + '</span>' +
      '</div>' +
      '<div class="fw-cta">לפרטים נוספים ›</div>' +
    '</div>';
}

function _heMonthLabel(monthKey) {
  var labels = {'01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל','05':'מאי','06':'יוני','07':'יולי','08':'אוגוסט','09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר'};
  return labels[(monthKey + '').slice(5,7)] || monthKey;
}

/* ══ Garage Appointment Widget ══ */

function _loadActiveAppointment() {
  try {
    var raw = localStorage.getItem('activeGarageAppointment');
    return raw ? JSON.parse(raw) : null;
  } catch(_) { return null; }
}

function _hebrewDayName(dateObj) {
  var days = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
  return days[dateObj.getDay()] || '';
}

function renderGarageApptWidget() {
  var mount = document.getElementById('garage-appt-widget-mount');
  if (!mount) return;

  var appt = _loadActiveAppointment();
  if (!appt || !appt.appointmentDate) { mount.innerHTML = ''; return; }

  var now    = Date.now();
  var tStr   = appt.appointmentTime || '09:00';
  var apptMs = new Date(appt.appointmentDate + 'T' + tStr + ':00').getTime();

  // Auto-expire: hide widget 24 hours after appointment has passed
  if (now > apptMs + 86400000) {
    mount.innerHTML = '';
    try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
    _fbClearActiveAppointment();
    return;
  }

  var diffMs   = apptMs - now;
  var diffDays = diffMs / 86400000;

  var tier, bg, accent, ringAnim, badgeLabel;
  if (diffMs < 0) {
    tier = 'missed';   bg = '#111';    accent = '#555';    ringAnim = 'none';                              badgeLabel = 'עבר המועד';
  } else if (diffDays < 1) {
    tier = 'imminent'; bg = '#1f0505'; accent = '#ff3b3b'; ringAnim = 'gwPulse 0.8s ease-in-out infinite'; badgeLabel = 'היום!';
  } else if (diffDays < 3) {
    tier = 'urgent';   bg = '#1f1400'; accent = '#ff9800'; ringAnim = 'gwPulse 2s ease-in-out infinite';   badgeLabel = 'עוד ' + Math.ceil(diffDays) + ' ימים';
  } else if (diffDays < 7) {
    tier = 'soon';     bg = '#0a1f0a'; accent = '#4caf50'; ringAnim = 'gwPulse 3s ease-in-out infinite';   badgeLabel = 'עוד ' + Math.ceil(diffDays) + ' ימים';
  } else {
    tier = 'normal';   bg = '#0a1929'; accent = '#4a9eff'; ringAnim = 'none';                              badgeLabel = 'עוד ' + Math.ceil(diffDays) + ' ימים';
  }

  var dateFmt    = appt.appointmentDate.split('-').reverse().join('/');
  var dayName    = _hebrewDayName(new Date(apptMs));
  var garageName = appt.garageName || 'המוסך';

  mount.innerHTML =
    '<div class="gaw-widget" data-tier="' + tier + '" ' +
    '  style="--gaw-bg:' + bg + ';--gaw-accent:' + accent + ';--gaw-ring-anim:' + ringAnim + '" ' +
    '  onclick="_openGarageInfoFromWidget()" role="button" tabindex="0" aria-label="תור במוסך ' + garageName + '">' +
    '  <div class="gaw-icon-wrap">' +
    '    <div class="gaw-icon-ring">' +
    '      <svg class="gaw-icon-svg" viewBox="0 0 24 24">' +
    '        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' +
    '      </svg>' +
    '    </div>' +
    '  </div>' +
    '  <div class="gaw-body">' +
    '    <div class="gaw-title">תור במוסך</div>' +
    '    <div class="gaw-garage">' + garageName + '</div>' +
    '    <div class="gaw-date">' + dayName + ' · ' + dateFmt + ' · ' + tStr + '</div>' +
    '  </div>' +
    '  <div class="gaw-badge">⏱ ' + badgeLabel + '</div>' +
    '  <div class="gaw-actions">' +
    '    <button class="gaw-btn" onclick="event.stopPropagation();_openGarageCalendarLink()">📅 יומן</button>' +
    '    <button class="gaw-btn" onclick="event.stopPropagation();_openGarageWaze()">🗺 ניווט</button>' +
    '    <button class="gaw-btn" style="color:#f87171" onclick="event.stopPropagation();APP._garageCancelAppointment(\'' + (appt.eventId||'') + '\')">✕ בטל</button>' +
    '  </div>' +
    '</div>';
}

function _openGarageInfoFromWidget() {
  if (typeof APP !== 'undefined' && typeof APP.nav === 'function') {
    APP.nav('service');
    setTimeout(function() {
      if (typeof APP._garageShowApprovedFromStorage === 'function') {
        APP._garageShowApprovedFromStorage();
      }
    }, 80);
  }
}

function _openGarageWaze() {
  var appt = _loadActiveAppointment();
  if (!appt || !appt.garageAddress) { showToast('כתובת המוסך לא זמינה'); return; }
  window.open('https://waze.com/ul?q=' + encodeURIComponent(appt.garageAddress) + '&navigate=yes', '_blank');
}

function _openGarageCalendarLink() {
  var appt = _loadActiveAppointment();
  if (!appt || !appt.appointmentDate) return;
  var url = _buildGoogleCalendarUrl(appt.appointmentDate, appt.appointmentTime || '09:00', STATE.vehicle);
  window.open(url, '_blank');
}

function openFuelModal() {
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) return;
  renderFuelModal();
  var el = document.getElementById('fuel-modal');
  el.style.display = 'flex';
  requestAnimationFrame(function() { el.classList.add('open'); });
  document.body.style.overflow = 'hidden';
}

function closeFuelModal() {
  var el = document.getElementById('fuel-modal');
  el.classList.remove('open');
  document.body.style.overflow = '';
  STATE.fuelSelectedMonth = null;
  setTimeout(function() { el.style.display = 'none'; }, 380);
}

function selectFuelMonth(key) {
  STATE.fuelSelectedMonth = key;
  renderFuelModal();
  // scroll to tiles section
  var el = document.getElementById('fm-month-detail');
  if (el) el.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderFuelModal() {
  var fd = STATE.fuelData;
  if (!fd || !fd.hasData) return;
  var content = document.getElementById('fuel-modal-content');
  if (!content) return;

  var selKey = STATE.fuelSelectedMonth || fd.monthKey;
  var months = fd.months || [];
  var sel = null;
  for (var i = 0; i < months.length; i++) { if (months[i].key === selKey) { sel = months[i]; break; } }
  if (!sel) sel = {key: fd.monthKey, km: fd.kmThisMonth, liters: fd.litersThisMonth, cost: fd.costThisMonth, pricePerL: fd.pricePerLThisMonth || 0, fills: 0, stations: []};

  // Hero — ליטרים + עלות + מחיר לליטר
  var heroHtml =
    '<div class="fm-hero">' +
      '<div class="fm-hero-val">' + (sel.liters || '—') + '</div>' +
      '<div class="fm-hero-unit">ליטרים · ' + _heMonthLabel(sel.key) + ' ' + (sel.key+'').slice(0,4) + '</div>' +
      '<div class="fm-hero-row2">' +
        '<div class="fm-hero-chip">₪' + (sel.cost ? sel.cost.toLocaleString('he') : '—') + '</div>' +
        (sel.pricePerL ? '<div class="fm-hero-chip2">₪' + sel.pricePerL.toFixed(2) + ' לליטר</div>' : '') +
        '<div class="fm-hero-chip3">תקן: ' + fd.standardL100 + ' ל/100ק"מ</div>' +
      '</div>' +
    '</div>';

  // AI Insight
  var insightHtml = '<div class="fm-section"><div class="fm-sec-title">תובנת AI</div>';
  if (fd.fuelInsight && fd.fuelInsight.text) {
    var genDate = fd.fuelInsight.generatedAt ? fd.fuelInsight.generatedAt.slice(0,10) : '';
    insightHtml +=
      '<div class="fm-insight-card">' +
        '<div class="fm-insight-shimmer"></div>' +
        '<div class="fm-insight-head"><div class="fm-insight-icon">✨</div><div class="fm-insight-label">עלה Intelligence</div></div>' +
        '<div class="fm-insight-text">' + fd.fuelInsight.text + '</div>' +
        (genDate ? '<div class="fm-insight-footer">נוצר ' + genDate + ' · GPT-4o</div>' : '') +
      '</div>';
  } else {
    insightHtml +=
      '<div class="fm-insight-card fm-insight-empty">' +
        '<div class="fm-insight-head"><div class="fm-insight-icon">✨</div><div class="fm-insight-label">עלה Intelligence</div></div>' +
        '<div class="fm-insight-text" style="color:var(--t2)">תובנת AI תיווצר ב-1 לחודש הבא.<br>המערכת מנתחת את דפוסי הנסיעה שלך ומחשבת את ההשפעה על ילדי עלה.</div>' +
      '</div>';
  }
  insightHtml += '</div>';

  // גרף — עמודות ליטרים, עלות בולטת מתחת לכל חודש (issue 1+2)
  var maxL = 0;
  for (var ci = 0; ci < months.length; ci++) { if (months[ci].liters > maxL) maxL = months[ci].liters; }
  if (maxL === 0) maxL = 1;
  var chartCols = '';
  for (var j = 0; j < months.length; j++) {
    var m     = months[j];
    var isSel = (m.key === selKey);
    var barH  = m.liters > 0 ? Math.max(8, Math.round((m.liters / maxL) * 100)) : 4;
    var mColor = isSel ? 'var(--fuel-excellent)' : 'rgba(52,199,89,0.45)';
    var delay = (j * 0.07).toFixed(2) + 's';
    chartCols +=
      '<div class="fm-chart-col" onclick="selectFuelMonth(\'' + m.key + '\')" style="cursor:pointer">' +
        '<div class="fm-bar-wrap">' +
          '<div class="fm-bar' + (isSel ? ' current' : '') + '" ' +
               'style="background:' + mColor + ';--fm-bar-h:' + barH + '%;animation-delay:' + delay + ';' +
               (isSel ? 'outline:2px solid var(--fuel-excellent);outline-offset:2px;' : '') + '"></div>' +
        '</div>' +
        '<div class="fm-chart-val">' + (m.liters > 0 ? m.liters + 'ל׳' : '') + '</div>' +
        '<div class="fm-chart-label' + (isSel ? ' current' : '') + '">' + m.label + '</div>' +
        '<div class="fm-chart-cost">' + (m.cost > 0 ? '₪' + m.cost.toLocaleString('he') : '') + '</div>' +
      '</div>';
  }
  var chartHtml =
    '<div class="fm-section">' +
      '<div class="fm-sec-title">6 חודשים אחרונים <span style="font-size:10px;color:var(--t2);font-weight:400">· לחץ לפרטים</span></div>' +
      '<div class="fm-chart">' + chartCols + '</div>' +
    '</div>';

  // פרטי חודש נבחר
  var tilesHtml =
    '<div class="fm-section" id="fm-month-detail">' +
      '<div class="fm-sec-title">פרטי ' + _heMonthLabel(sel.key) + ' ' + (sel.key+'').slice(0,4) + '</div>' +
      '<div class="fm-tiles">' +
        '<div class="fm-tile"><div class="fm-tile-lbl">ק"מ שנסעת</div><div class="fm-tile-val">' + (sel.km ? sel.km.toLocaleString('he') : '—') + '</div><div class="fm-tile-unit">קילומטר</div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">ליטרים</div><div class="fm-tile-val">' + (sel.liters || '—') + '</div><div class="fm-tile-unit">ליטר</div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">עלות דלק</div><div class="fm-tile-val">₪' + (sel.cost ? sel.cost.toLocaleString('he') : '—') + '</div><div class="fm-tile-unit"></div></div>' +
        '<div class="fm-tile"><div class="fm-tile-lbl">מחיר לליטר</div><div class="fm-tile-val">₪' + (sel.pricePerL ? sel.pricePerL.toFixed(2) : '—') + '</div><div class="fm-tile-unit"></div></div>' +
      '</div>' +
    '</div>';

  // תחנות — של החודש הנבחר (issue 3)
  var stationsHtml = '';
  var stations = (sel.stations && sel.stations.length > 0) ? sel.stations : [];
  if (stations.length > 0) {
    var maxStL = stations[0].liters || 1;
    var rankClass = ['r1','r2','r3'];
    var stCards = '';
    for (var si = 0; si < stations.length; si++) {
      var st  = stations[si];
      var stPct = Math.round((st.liters / maxStL) * 100);
      var rc  = si < 3 ? rankClass[si] : 'rn';
      var dly = (si * 0.1).toFixed(1) + 's';
      stCards +=
        '<div class="fm-station-card" style="animation-delay:' + dly + '">' +
          '<div class="fm-station-rank ' + rc + '">' + (si+1) + '</div>' +
          '<div class="fm-station-body">' +
            '<div class="fm-station-name">' + st.name + '</div>' +
            '<div class="fm-station-bar-bg"><div class="fm-station-bar" style="--st-w:' + stPct + '%;animation-delay:' + dly + '"></div></div>' +
            '<div class="fm-station-meta"><span>' + st.liters + ' ל׳</span><span>' + st.fills + ' תדלוקים</span></div>' +
          '</div>' +
          '<div class="fm-station-right">' +
            '<div class="fm-station-cost">₪' + st.cost.toLocaleString('he') + '</div>' +
            (st.pricePerL ? '<div class="fm-station-ppl">₪' + st.pricePerL.toFixed(2) + '/ל׳</div>' : '') +
          '</div>' +
        '</div>';
    }
    stationsHtml =
      '<div class="fm-section">' +
        '<div class="fm-sec-title">תחנות דלק — ' + _heMonthLabel(sel.key) + '</div>' +
        '<div class="fm-stations">' + stCards + '</div>' +
      '</div>';
  }

  // סיכום 6 חודשים — ק"מ + ליטרים בלבד (ללא עלות — מוצגת בגרף)
  var annKm = 0, annL = 0;
  for (var k = 0; k < months.length; k++) {
    annKm += months[k].km     || 0;
    annL  += months[k].liters || 0;
  }
  var annualHtml =
    '<div class="fm-section">' +
      '<div class="fm-sec-title">סיכום 6 חודשים</div>' +
      '<div class="fm-annual">' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + Math.round(annKm).toLocaleString('he') + '</div><div class="fm-annual-lbl">ק"מ</div></div>' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + Math.round(annL).toLocaleString('he') + '</div><div class="fm-annual-lbl">ליטרים</div></div>' +
        '<div class="fm-annual-item"><div class="fm-annual-val">' + (annL > 0 && fd.standardL100 > 0 ? Math.round(annL*100/fd.standardL100).toLocaleString('he') : '—') + '</div><div class="fm-annual-lbl">ק"מ משוער</div></div>' +
      '</div>' +
    '</div>';

  content.innerHTML = heroHtml + insightHtml + chartHtml + tilesHtml + stationsHtml + annualHtml +
    '<button class="fm-close-btn" onclick="closeFuelModal()">סגור</button>';
}

function renderServiceProgress() {
  const mount = document.getElementById('svc-progress-mount');
  if (!mount) return;
  const v = STATE.vehicle;
  if (!v) { mount.innerHTML = ''; return; }

  const lastKm     = parseInt(v.calcLastServiceKm || v.lastServiceKm, 10) || 0;
  const nextKm     = parseInt(v.calcNextServiceKm || v.nextServiceKm, 10) || 0;
  const reportedKm = parseInt(v.currentKm, 10) || 0;   // דיווח אחרון של נהג
  const estKm      = parseInt(v.estKm, 10) || reportedKm; // אומדן אלגוריתם

  if (!nextKm || !lastKm || nextKm <= lastKm) { mount.innerHTML = ''; return; }

  const totalSpan  = nextKm - lastKm;
  const remaining  = nextKm - estKm;  // נשאר לפי אומדן
  let reportedPct  = Math.min(100, Math.max(0, Math.round(((reportedKm - lastKm) / totalSpan) * 100)));
  let estPct       = Math.min(100, Math.max(0, Math.round(((estKm     - lastKm) / totalSpan) * 100)));

  let level, label, footTxt, footCls;
  if (remaining < 0) {
    level = 'red';  label = 'עבר מועד';  reportedPct = 100;  estPct = 100;
    footTxt = 'עבר ב-' + Math.abs(remaining).toLocaleString('he') + ' ק"מ';
    footCls = 'red';
  } else if (remaining < 500) {
    level = 'red';  label = 'דחוף';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'red';
  } else if (remaining < 1500) {
    level = 'warn';  label = 'מתקרב';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'warn';
  } else {
    level = 'ok';  label = 'תקין';
    footTxt = 'נותרו ' + remaining.toLocaleString('he') + ' ק"מ לטיפול';
    footCls = 'ok';
  }

  // tick position: bar fills RTL (right=start), so tick left = (100 - estPct)%
  const tickLeft = (100 - estPct);
  const showTick = estKm > reportedKm && estPct > reportedPct && estPct < 100;

  mount.innerHTML =
    '<div class="svc-card">' +
      '<div class="svc-hdr">' +
        '<div class="svc-title-wrap">' +
          '<div class="svc-icn"><svg width="18" height="18"><use href="#ic-tool" color="#1F8A3D"/></svg></div>' +
          '<div class="svc-title">טיפול הבא</div>' +
        '</div>' +
        '<div class="svc-pill ' + level + '">' + label + '</div>' +
      '</div>' +
      '<div class="svc-stats">' +
        '<div class="svc-stat">' +
          '<div class="svc-stat-lbl">ק"מ אחרון</div>' +
          '<div class="svc-stat-val">' + reportedKm.toLocaleString('he') + '<span class="unit">ק"מ</span></div>' +
        '</div>' +
        '<div class="svc-stat right">' +
          '<div class="svc-stat-lbl">טיפול הבא</div>' +
          '<div class="svc-stat-val">' + nextKm.toLocaleString('he') + '<span class="unit">ק"מ</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="svc-bar-wrap' + (showTick ? ' with-marker' : '') + '">' +
        '<div class="svc-bar-bg">' +
          '<div class="svc-bar-fill ' + level + '" style="width:' + reportedPct + '%">' +
            '<div class="svc-bar-shine"></div>' +
          '</div>' +
        '</div>' +
        (showTick ? '<div class="svc-bar-marker" style="left:' + tickLeft + '%"><div class="tri"></div><div class="stem"></div><div class="est-lbl">~' + estKm.toLocaleString('he') + '</div></div>' : '') +
      '</div>' +
      '<div class="svc-foot">' +
        '<div class="svc-foot-txt">' + footTxt + '</div>' +
        '<div class="svc-foot-val ' + footCls + '">' + estPct + '%</div>' +
      '</div>' +
    '</div>';
}

function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/\D/g, '');
}

function phoneToWa(p) {
  var d = normalizePhone(p);
  if (!d) return '';
  if (d.charAt(0) === '0') d = '972' + d.substring(1);
  else if (d.indexOf('972') !== 0) d = '972' + d;
  return d;
}

function renderGarageTab() {
  const v = STATE.vehicle || {};
  const g = v.garage;
  if (!g || (!g.name && !g.address)) {
    return '<div class="gar-empty"><div class="gar-empty-ic">🔧</div>טרם שויך מוסך לרכב.<br>פנה למנהל הצי לקבלת פרטים.</div>';
  }

  // Only show name + address + Waze — no direct contact details (requires manager approval)
  let rows = '';
  if (g.address) {
    const wazeUrl = 'https://waze.com/ul?q=' + encodeURIComponent(g.address) + '&navigate=yes';
    rows +=
      '<div class="gar-row">' +
        '<div class="gar-row-icn"><svg width="18" height="18"><use href="#ic-pin" color="#1F8A3D"/></svg></div>' +
        '<div class="gar-row-body">' +
          '<div class="gar-row-lbl">כתובת</div>' +
          '<div class="gar-row-val">' + g.address + '</div>' +
        '</div>' +
        '<div class="gar-row-btns">' +
          '<a class="gar-mini-btn waze" href="' + wazeUrl + '" target="_blank" rel="noopener" title="נווט בוויז">' +
            '<svg width="20" height="20"><use href="#ic-waze" color="#fff"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  const noticeRow =
    '<div style="margin:10px 0 4px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:10px 14px;font-size:12px;color:#f59e0b;display:flex;align-items:center;gap:8px">' +
    '<span>⚠️</span><span>לפנייה למוסך נדרש אישור מנהל — השתמש בכפתור "מוסך" בתפריט הסיוע</span></div>';

  const wazeUrl2 = g.address ? 'https://waze.com/ul?q=' + encodeURIComponent(g.address) + '&navigate=yes' : '';
  const cta = wazeUrl2
    ? '<a class="gar-cta-btn ghost" href="' + wazeUrl2 + '" target="_blank" rel="noopener">' +
        '<svg width="17" height="17"><use href="#ic-map" color="#fff"/></svg>נווט' +
      '</a>'
    : '';

  return '<div class="gar-wrap">' +
    '<div class="gar-card">' +
      '<div class="gar-head">' +
        '<div class="gar-logo"><svg width="28" height="28"><use href="#ic-tool" color="#1F8A3D"/></svg></div>' +
        '<div>' +
          '<div class="gar-name">' + (g.name || 'המוסך שלך') + '</div>' +
          '<div class="gar-tag">המוסך המשויך לרכב</div>' +
        '</div>' +
      '</div>' +
      rows +
      noticeRow +
      (cta ? '<div class="gar-cta">' + cta + '</div>' : '') +
    '</div>' +
  '</div>';
}

function _escHtml(s) {
  return String(s||'').replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}

function _notifTimeLabel(ts) {
  var d = new Date(ts);
  var now = new Date();
  var diff = Math.floor((now - d) / 1000);
  if (diff < 60)  return 'עכשיו';
  if (diff < 3600) return Math.floor(diff/60) + ' דק\'';
  if (diff < 86400) return Math.floor(diff/3600) + ' שע\'';
  var dd = Math.floor(diff/86400);
  return dd === 1 ? 'אתמול' : dd + ' ימים';
}

var NOTIF_ICON_BY_TYPE = {
  overdue: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
  urgent:  '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  plan:    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  km_update:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  test_due:'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  test_urgent:'<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>'
};

function renderNotifHistory() {
  var container = document.getElementById('alerts-content');
  if (!container) return;

  var history = getNotifHistory();

  var old = document.getElementById('nh-section');
  if (old) old.parentNode.removeChild(old);

  var section = document.createElement('div');
  section.id = 'nh-section';
  section.style.cssText = 'padding:0 0 8px';

  var headerHtml = '<div class="nh-header">' +
    '<div class="nh-title">הודעות שהתקבלו</div>' +
    (history.length ? '<button class="nh-clear-btn" onclick="APP.clearNotifHistory()">נקה הכל</button>' : '') +
    '</div>';

  if (!history.length) {
    section.innerHTML = headerHtml +
      '<div class="notif-empty">' +
        '<svg class="notif-empty-bell" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
        '</svg>' +
        '<div class="notif-empty-title">אין התראות חדשות</div>' +
        '<div class="notif-empty-subtitle">נעדכן אותך כשיהיה משהו חשוב</div>' +
      '</div>';
    container.appendChild(section);
    return;
  }

  var SEV_LABEL = { critical:'דחוף!', urgent:'דחוף', plan:'תזכורת', info:'מידע', approved:'אושר' };

  var itemsHtml = history.map(function(n, i) {
    var type     = n.alertType || 'plan';
    var severity = SEVERITY_MAP[type] || 'plan';
    var safeId   = String(n.id || n.ts || i);
    var iconHtml = (SEVERITY_ICONS[severity] || SEVERITY_ICONS.plan)
      .replace('width="22"', 'width="20"').replace('height="22"', 'height="20"');

    // Expandable meta rows
    var metaRowsHtml = '';
    var metaRows = [];
    if (n.vehicleId)     metaRows.push(['רכב', _escHtml(n.vehicleId)]);
    if (n.requestNumber) metaRows.push(['בקשה', '#' + _escHtml(n.requestNumber)]);
    if (n.reasonLabel)   metaRows.push(['סיבה', _escHtml(n.reasonLabel)]);
    if (n.originalDescription) metaRows.push(['תיאור', _escHtml(n.originalDescription)]);
    if (n.managerNote)   metaRows.push(['הערת מנהל', _escHtml(n.managerNote)]);
    if (type === 'fuel_high' && n.fuelConsumption)
      metaRows.push(['צריכת דלק', _escHtml(n.fuelConsumption) + ' ל׳/100קמ']);
    if (type === 'fuel_km_high' && n.costPerKm)
      metaRows.push(['עלות לק״מ', '₪' + _escHtml(n.costPerKm)]);
    if (metaRows.length) {
      metaRowsHtml = '<div class="nh-meta-rows">' +
        metaRows.map(function(r) {
          return '<div class="nh-meta-row">' +
            '<span class="nh-meta-label">' + r[0] + '</span>' +
            '<span class="nh-meta-value">'  + r[1] + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    var chevronSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    return '<div class="notif-history-item notif-card notif-' + severity + '" ' +
        'data-id="' + safeId + '" data-type="' + type + '" ' +
        'style="animation:card-enter 0.35s var(--ease-out) both;animation-delay:' + (i * 0.05) + 's;margin-bottom:10px;display:block;padding:12px 14px">' +

      '<div class="nh-header-row" onclick="_toggleNotifCard(this)">' +
        '<div class="notif-icon" style="flex-shrink:0;margin-top:1px">' + iconHtml + '</div>' +
        '<div class="nh-header-info">' +
          '<div class="nh-title-line">' +
            '<span class="notif-title" style="flex:1;min-width:0">' + _escHtml(n.title) + '</span>' +
            '<span class="nh-sev-badge nh-sev-' + severity + '">' + (SEV_LABEL[severity] || severity) + '</span>' +
          '</div>' +
          '<div class="notif-time" style="margin-top:3px">' + _notifTimeLabel(n.ts) + '</div>' +
        '</div>' +
        '<div class="nh-chevron">' + chevronSvg + '</div>' +
      '</div>' +

      '<div class="nh-expand-body">' +
        '<div class="nh-divider"></div>' +
        (n.body ? '<div class="nh-body-text">' + _escHtml(n.body) + '</div>' : '') +
        metaRowsHtml +
        '<button class="nh-delete-btn" onclick="APP.deleteNotif(\'' + safeId + '\');event.stopPropagation()">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>' +
          'מחק התראה' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');

  section.innerHTML = headerHtml + itemsHtml;
  container.appendChild(section);
  _initSwipeDelete(section);
}

function _toggleNotifCard(headerEl) {
  var card = headerEl.closest('.notif-history-item');
  if (!card) return;
  var isOpen = card.classList.contains('is-open');
  var nhSection = card.closest('#nh-section');
  if (nhSection) {
    nhSection.querySelectorAll('.notif-history-item.is-open').forEach(function(el) {
      if (el !== card) el.classList.remove('is-open');
    });
  }
  card.classList.toggle('is-open', !isOpen);
}

function renderAlerts() {
  const container = document.getElementById('alerts-content');
  const empty = document.getElementById('alerts-empty');
  document.getElementById('alerts-count').textContent = STATE.alerts.length + ' התראות';

  if (STATE.alerts.length === 0) {
    empty.classList.remove('hidden');
    container.innerHTML = '';
  } else {
    empty.classList.add('hidden');

    const cats = [
      { key: 'red',  label: 'דחוף' },
      { key: 'warn', label: 'להתייחסות' },
      { key: 'ok',   label: 'פעולות שבוצעו' }
    ];

    let html = '';
    cats.forEach(function(cat) {
      const items = STATE.alerts.filter(function(a) { return a.type === cat.key; });
      if (!items.length) return;
      html += '<div class="ssec"><div class="ss-lbl">' + cat.label + '</div><div class="ss-count">' + items.length + '</div></div>';
      items.forEach(function(a, i) {
        html += '<div class="alert-card ' + a.type + '" style="animation-delay:' + (i * 0.06) + 's">';
        html += '<div class="ac-row">';
        html += '<div><div class="ac-title">' + a.title + '</div><div class="ac-sub">' + a.sub + '</div></div>';
        if (a.type === 'red') {
          html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">';
          html += '<span class="pill red">' + a.label + '</span>';
          html += '<div class="ping-wrap"><div class="ping-dot"></div><div class="ping-ring"></div></div>';
          html += '</div>';
        } else {
          html += '<span class="pill ' + a.type + '">' + a.label + '</span>';
        }
        html += '</div>';
        if (a.days !== null) {
          html += '<div class="ac-date ' + a.type + '">' + a.days + ' ימים</div>';
        }
        html += '</div>';
      });
    });
    container.innerHTML = html;
  }

  renderNotifHistory();
}

function renderHistory() {
  const tl = document.getElementById('history-timeline');
  if (!STATE.history.length) {
    tl.innerHTML = '<div class="empty">אין היסטוריית טיפולים</div>';
    return;
  }
  tl.innerHTML = STATE.history.map(function(h, i) {
    const isFirst = i === 0;
    const isLast = i === STATE.history.length - 1;
    return '<div class="tl-row">' +
      '<div class="tl-left">' +
        '<div class="tl-dot ' + (isFirst ? 'red' : 'gray') + '"></div>' +
        (!isLast ? '<div class="tl-line-v"></div>' : '') +
      '</div>' +
      '<div class="tl-card" style="animation-delay:' + (i * 0.07) + 's">' +
        '<div class="tc-date">' + (isFirst ? '<div class="tc-red-dot"></div>' : '') + formatDate(h.date) + '</div>' +
        '<div class="tc-divider"></div>' +
        (h.garage ? '<div class="tc-row"><div class="tc-lbl">מוסך:</div><div>' + h.garage + '</div></div>' : '') +
        (h.city   ? '<div class="tc-row"><div class="tc-lbl">עיר:</div><div>' + h.city + '</div></div>' : '') +
        (h.km     ? '<div class="tc-row"><div class="tc-lbl">ק"מ:</div><div>' + Number(h.km).toLocaleString('he') + '</div></div>' : '') +
        (h.type   ? '<div class="tc-tag">' + h.type + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function techItem(icon, label, val, delay) {
  if (!val && val !== 0) return '';
  return '<div class="tspec-item" style="animation-delay:' + (delay||0) + 's">' +
    '<div class="tspec-icon"><svg width="18" height="18"><use href="#' + icon + '" color="#1F8A3D"/></svg></div>' +
    '<div class="tspec-val">' + val + '</div>' +
    '<div class="tspec-lbl">' + label + '</div>' +
  '</div>';
}

function techBool(icon, label, val) {
  var on = val === 1 || val === '1' || val === true;
  return '<div class="tspec-bool' + (on ? ' on' : '') + '">' +
    '<svg width="14" height="14"><use href="#' + icon + '" color="' + (on ? '#30D158' : '#3a3a3c') + '"/></svg>' +
    '<span>' + label + '</span>' +
  '</div>';
}

function techCat(title, html) {
  if (!html || !html.trim()) return '';
  return '<div class="tspec-cat">' +
    '<div class="tspec-cat-title">' + title + '</div>' +
    html +
  '</div>';
}

function renderGovSection() {
  var veh = STATE.vehicle || {};

  if (STATE.govLoading || STATE.govData === undefined) {
    return '<div class="tech-section">' +
      '<div class="tech-sec-hdr"><span class="tech-sec-title">פרטים טכניים</span>' +
      '<span class="tech-sec-badge">טוען...</span></div>' +
      '<div class="tspec-skel">' +
        [1,2,3,4,5,6,7,8].map(function() {
          return '<div class="tspec-skel-item"><div class="sk-line" style="width:36px;height:36px;border-radius:12px;margin-bottom:8px"></div>' +
                 '<div class="sk-line" style="width:50px;height:10px;margin-bottom:6px"></div>' +
                 '<div class="sk-line" style="width:38px;height:8px"></div></div>';
        }).join('') +
      '</div></div>';
  }

  // אם gov נכשל — הסתר
  if (!STATE.govData) return '';

  var g = STATE.govData  || {};
  var w = STATE.govWLTP  || {};

  // ── מנוע ──
  var engine =
    techItem('ic-cylinder', 'נפח מנוע',   w.nefah_manoa  ? Number(w.nefah_manoa).toLocaleString('he') + ' סמ"ק' : null, 0.04) +
    techItem('ic-power',    'הספק',        w.koah_sus     ? w.koah_sus + ' כ"ס'   : null, 0.06) +
    techItem('ic-fuel',     'סוג דלק',     w.delek_nm || g.sug_delek_nm || null, 0.08) +
    techItem('ic-drive',    'הנעה',        w.hanaa_nm && w.hanaa_nm !== 'לא ידוע קוד' ? w.hanaa_nm : null, 0.10) +
    techItem('ic-gear',     'תיבת הילוכים', w.automatic_ind === 1 ? 'אוטומטית' : (w.automatic_ind === 0 ? 'ידנית' : null), 0.12) +
    techItem('ic-engine',   'דגם מנוע',    g.degem_manoa || null, 0.14);

  // ── מרכב ──
  var body =
    techItem('ic-car',      'סוג רכב',    w.merkav          || null, 0.04) +
    techItem('ic-door',     'דלתות',      w.mispar_dlatot   || null, 0.06) +
    techItem('ic-seat',     'מושבים',     w.mispar_moshavim || null, 0.08) +
    techItem('ic-weight',   'משקל כולל',  w.mishkal_kolel ? Number(w.mishkal_kolel).toLocaleString('he') + ' ק"ג' : null, 0.10) +
    techItem('ic-hook',     'כושר גרירה', w.kosher_grira_im_blamim ? Number(w.kosher_grira_im_blamim).toLocaleString('he') + ' ק"ג' : null, 0.12) +
    techItem('ic-wheel',    'צמיג קדמי',  g.zmig_kidmi      || null, 0.15) +
    techItem('ic-wheel',    'צמיג אחורי', g.zmig_ahori      || null, 0.16) +
    techItem('ic-tag',      'רמת גימור',  w.ramat_gimur     || g.ramat_gimur || null, 0.18);

  // ── בטיחות — תכונות בוליאניות ──
  var safetyGrid =
    techItem('ic-airbag',   'כריות אוויר', w.mispar_kariot_avir ? w.mispar_kariot_avir + ' כריות' : null, 0.04) +
    techItem('ic-star',     'ציון בטיחות', w.nikud_betihut ? '★ ' + w.nikud_betihut : null, 0.06);

  var safetyBools =
    techBool('ic-check', 'ABS',              w.abs_ind) +
    techBool('ic-check', 'הגה כוח',          w.hege_koah_ind) +
    techBool('ic-check', 'מצלמת אחורה',     w.matzlemat_reverse_ind) +
    techBool('ic-check', 'בקרת יציבות',      w.bakarat_yatzivut_ind) +
    techBool('ic-check', 'חיישני עייפות',    w.zihuy_matzav_hitkarvut_mesukenet_ind) +
    techBool('ic-check', 'בלימת חירום',       w.teura_automatit_benesiya_kadima_ind) +
    techBool('ic-check', 'שמירת נתיב',       w.bakarat_stiya_menativ_ind) +
    techBool('ic-check', 'חיישני חניה',      w.nitur_merhak_milfanim_ind) +
    techBool('ic-check', 'זיהוי הולכי רגל',  w.zihuy_holchey_regel_ind) +
    techBool('ic-check', 'מזגן',             w.mazgan_ind) +
    techBool('ic-check', 'חלונות חשמל',      w.mispar_halonot_hashmal);

  var safety = safetyGrid +
    (safetyBools.trim() ? '<div class="tspec-bools">' + safetyBools + '</div>' : '');

  // ── סביבה ──
  var env =
    techItem('ic-cloud',  'פליטת CO₂ (WLTP)', w.CO2_WLTP ? w.CO2_WLTP + ' גר\'/ק"מ' : null, 0.04) +
    techItem('ic-leaf',   'מדד ירוק',           w.madad_yarok || null, 0.06) +
    techItem('ic-leaf',   'קבוצת זיהום',        w.kvutzat_zihum || g.kvutzat_zihum || null, 0.08) +
    techItem('ic-filter', 'סוג ממיר',            w.sug_mamir_nm || null, 0.10);

  var html =
    techCat('🔧 מנוע',    '<div class="tspec-grid">' + engine  + '</div>') +
    techCat('🚗 מרכב',    '<div class="tspec-grid">' + body    + '</div>') +
    techCat('🛡️ בטיחות',  safety) +
    techCat('🌿 סביבה',   '<div class="tspec-grid">' + env     + '</div>');

  if (!html.trim()) return '';

  return '<div class="tech-section">' +
    '<div class="tech-sec-hdr">' +
      '<span class="tech-sec-title">פרטים טכניים</span>' +
      '<span class="tech-sec-badge">משרד התחבורה</span>' +
    '</div>' +
    html +
    '<div style="height:8px"></div>' +
  '</div>';
}

function renderVehicleScreen(tab) {
  const v = STATE.vehicle;
  if (!v) return;

  document.getElementById('veh-title').textContent = ((v.make || '') + ' ' + (v.model || '')).trim();
  document.getElementById('veh-sub').textContent = v.num || '';

  document.querySelectorAll('#veh-tabs .tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  const content = document.getElementById('veh-content');

  if (tab === 'info') {
    const fields = [
      { icon:'ic-cal',    label:'טסט הבא',       val: formatDate(v.testDue),    warn: daysLeftWarn(v.testDue, 20) },
      { icon:'ic-shield', label:'ביטוח חובה',     val: formatDate(v.insCompExp), warn: daysLeftWarn(v.insCompExp, 30) },
      { icon:'ic-file',   label:'רישיון רכב',     val: formatDate(v.licExp),     warn: daysLeftWarn(v.licExp, 30) },
      { icon:'ic-gauge',  label:'ק"מ אחרון',      val: v.lastServiceKm ? Number(v.lastServiceKm).toLocaleString('he') : '—', warn: false },
      { icon:'ic-tool',   label:'טיפול הבא',      val: v.nextServiceKm ? Number(v.nextServiceKm).toLocaleString('he') + ' ק"מ' : '—', warn: false },
      { icon:'ic-shield', label:'ביטוח מקיף',     val: formatDate(v.insFullExp), warn: daysLeftWarn(v.insFullExp, 30) },
      { icon:'ic-car',    label:'צבע',            val: v.color || '—',           warn: false },
      { icon:'ic-cal',    label:'שנת יצור',       val: v.year  || '—',           warn: false }
    ];
    content.innerHTML = '<div class="igrid">' + fields.map(function(f, i) {
      return '<div class="ig-card" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="ig-icon"><svg width="20" height="20"><use href="#' + f.icon + '" color="#1F8A3D"/></svg></div>' +
        '<div class="ig-lbl">' + f.label + '</div>' +
        '<div class="ig-val' + (f.warn ? ' warn' : '') + '">' + f.val + '</div>' +
      '</div>';
    }).join('') + '</div>' + renderGovSection();

  } else if (tab === 'docs') {
    if (!STATE.documents.length) {
      content.innerHTML = '<div class="empty">אין מסמכים</div>';
    } else {
      content.innerHTML = STATE.documents.map(function(d, i) {
        const warn = daysLeftWarn(d.date, 30);
        const safeLink  = (d.link  || '').replace(/'/g, "\\'");
        const safeTitle = (d.type || 'מסמך').replace(/'/g, "\\'");
        const onclick   = 'viewDoc(\'' + safeLink + '\',\'' + safeTitle + '\')';
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's" onclick="' + onclick + '">' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-file" color="#1F8A3D"/></svg></div>' +
          '<div class="dr-body">' +
            '<div class="dr-title">' + (d.type || 'מסמך') + '</div>' +
            '<div class="dr-sub' + (warn ? ' warn' : '') + '">' + formatDate(d.date) + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">' +
            '<span style="font-size:11px;font-weight:600;color:' + (d.link ? '#30D158' : '#6e6e73') + '">' + (d.link ? 'פתח' : 'אין קישור') + '</span>' +
            '<svg width="14" height="14" fill="none" stroke="' + (d.link ? '#30D158' : '#4e4e53') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
          '</div>' +
        '</div>';
      }).join('');
    }

  } else if (tab === 'insurance') {
    if (!STATE.insurance.length) {
      content.innerHTML = '<div class="empty">אין נתוני ביטוח</div>';
    } else {
      content.innerHTML = STATE.insurance.map(function(ins, i) {
        return '<div class="doc-row" style="animation-delay:' + (i * 0.05) + 's">' +
          '<div class="dr-icon-wrap"><svg width="20" height="20"><use href="#ic-shield" color="#1F8A3D"/></svg></div>' +
          '<div class="dr-body">' +
            '<div class="dr-title">ביטוח ' + (ins.year || '') + ' — ' + (ins.company || '') + '</div>' +
            '<div class="dr-sub">חובה: ₪' + Number(ins.compCost || 0).toLocaleString('he') + ' | מקיף: ₪' + Number(ins.fullCost || 0).toLocaleString('he') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

  } else if (tab === 'history') {
    renderHistory();
    const histEl = document.getElementById('history-timeline');
    content.innerHTML = '<div class="timeline">' + (histEl ? histEl.innerHTML : '') + '</div>';

  } else if (tab === 'garage') {
    content.innerHTML = renderGarageTab();
  }
}

function renderService() {
  // km display lives in the modal now; nothing else to render here
}

/* ══ Navigation ══ */
const APP = {
  nav: function(screen) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    const el = document.getElementById('screen-' + screen);
    if (el) el.classList.add('active');

    ['home','vehicle','alerts','history','service'].forEach(function(s) {
      const btn = document.getElementById('bn-' + s);
      if (btn) btn.classList.toggle('active', s === screen);
    });

    STATE.currentScreen = screen;

    if (screen === 'vehicle') renderVehicleScreen(STATE.currentTab);
    if (screen === 'alerts') {
      localStorage.setItem('driver_notif_last_seen', String(Date.now()));
      clearUnreadBadge();
      renderNotifHistory();
    }
  },

  switchTab: function(tab) {
    STATE.currentTab = tab;
    renderVehicleScreen(tab);
  },

  openKmModal: function() {
    const v = STATE.vehicle || {};
    const prev = v.currentKm
      ? Number(v.currentKm).toLocaleString('he') + ' ק"מ'
      : (v.lastServiceKm ? Number(v.lastServiceKm).toLocaleString('he') + ' ק"מ' : '—');
    document.getElementById('km-modal-prev').textContent = 'ק"מ אחרון: ' + prev;
    const inp = document.getElementById('km-modal-input');
    inp.value = '';
    // reset to form state
    document.getElementById('km-modal-form').classList.remove('hidden');
    document.getElementById('km-modal-success').classList.add('hidden');
    document.getElementById('km-modal-submit').disabled = false;
    document.getElementById('km-modal-btn-text').textContent = 'עדכן ק"מ';
    document.getElementById('km-modal-spinner').classList.add('hidden');
    document.getElementById('km-modal-error').classList.add('hidden');
    inp.style.borderColor = '';
    inp.oninput = function() {
      document.getElementById('km-modal-error').classList.add('hidden');
      inp.style.borderColor = '';
    };
    document.getElementById('km-modal').classList.remove('hidden');
    setTimeout(function() { inp.focus(); }, 120);
  },

  closeKmModal: function() {
    var overlay = document.getElementById('km-modal');
    overlay.classList.add('closing');
    setTimeout(function() {
      overlay.classList.add('hidden');
      overlay.classList.remove('closing');
    }, 560);
  },

  submitKm: async function() {
    const val = document.getElementById('km-modal-input').value;
    const km = parseInt(val, 10);
    const v = STATE.vehicle || {};
    const knownKm = Math.max(
      parseInt(v.currentKm, 10) || 0,
      parseInt(v.lastServiceKm, 10) || 0
    );
    function kmErr(msg) {
      var el = document.getElementById('km-modal-error');
      el.textContent = msg;
      el.classList.remove('hidden');
      document.getElementById('km-modal-input').style.borderColor = 'rgba(255,59,48,0.6)';
    }
    function kmErrClear() {
      document.getElementById('km-modal-error').classList.add('hidden');
      document.getElementById('km-modal-input').style.borderColor = '';
    }
    kmErrClear();
    if (!km || isNaN(km) || km <= 0) { kmErr('יש להזין מספר חיובי'); return; }
    if (km > 2000000) { kmErr('ערך גבוה מדי'); return; }
    if (knownKm > 0 && km < knownKm) {
      kmErr('לא ניתן להזין ק"מ נמוך מהדיווח האחרון — ' + knownKm.toLocaleString('he') + ' ק"מ');
      return;
    }
    if (knownKm > 0 && km === knownKm) {
      kmErr('ק"מ זה כבר דווח — הזן ערך חדש');
      return;
    }
    if (knownKm > 0 && km > knownKm + 80000) {
      kmErr('קפיצה לא סבירה — מעל 80,000 ק"מ מהדיווח האחרון');
      return;
    }
    const btn = document.getElementById('km-modal-submit');
    btn.disabled = true;
    document.getElementById('km-modal-btn-text').textContent = 'שולח...';
    document.getElementById('km-modal-spinner').classList.remove('hidden');
    try {
      await gasPost('driver_update_km', { km: km });
      if (STATE.vehicle) {
        STATE.vehicle.lastServiceKm = km;
        STATE.vehicle.currentKm = km;
      }
      renderService();
      renderServiceProgress();
      // show success state
      document.getElementById('km-success-val').textContent = km.toLocaleString('he') + ' ק"מ';
      document.getElementById('km-modal-form').classList.add('hidden');
      document.getElementById('km-modal-success').classList.remove('hidden');
      setTimeout(function() { APP.closeKmModal(); }, 4200);
    } catch(e) {
      btn.disabled = false;
      document.getElementById('km-modal-btn-text').textContent = 'עדכן ק"מ';
      document.getElementById('km-modal-spinner').classList.add('hidden');
      var errEl = document.getElementById('km-modal-error');
      errEl.textContent = 'שגיאה: ' + e.message;
      errEl.classList.remove('hidden');
    }
  },

  updateKm: async function() {
    // legacy — redirect to modal
    APP.openKmModal();
  },

  reportFault: async function() {
    const desc = document.getElementById('fault-text').value.trim();
    if (!desc) { showToast('תאר את התקלה'); return; }
    showLoader();
    try {
      await gasPost('driver_report_fault', { description: desc });
      document.getElementById('fault-text').value = '';
      showToast('דיווח נשלח בהצלחה ✓');
    } catch(e) {
      showToast('שגיאה: ' + e.message);
    } finally {
      hideLoader();
    }
  }
};

function _initSwipeDelete(container) {
  container.querySelectorAll('.notif-history-item').forEach(function(item) {
    if (item.parentNode && item.parentNode.classList.contains('nh-swipe-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'nh-swipe-wrap';
    var bg = document.createElement('div');
    bg.className = 'nh-swipe-bg';
    bg.innerHTML =
      '<div class="nh-swipe-bg-inner">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"/>' +
          '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
          '<path d="M10 11v6M14 11v6"/>' +
          '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' +
        '</svg>' +
        '<span>מחיקה</span>' +
      '</div>';
    item.parentNode.insertBefore(wrap, item);
    wrap.appendChild(bg);
    wrap.appendChild(item);
  });

  var THRESHOLD = 90;
  var startX = 0, startY = 0;
  var activeItem = null, activeWrap = null, activeBg = null;
  var locked = null, armed = false;

  function reset() { activeItem = activeWrap = activeBg = locked = null; armed = false; }

  function onStart(e) {
    var t = e.touches ? e.touches[0] : e;
    var item = e.target.closest && e.target.closest('.notif-history-item');
    if (!item) return;
    activeItem = item;
    activeWrap = item.parentNode;
    activeBg   = activeWrap && activeWrap.querySelector('.nh-swipe-bg');
    if (!activeWrap || !activeBg) { reset(); return; }
    startX = t.clientX; startY = t.clientY;
    locked = null; armed = false;
    activeItem.style.transition = 'none';
    activeBg.style.transition = 'none';
  }

  function onMove(e) {
    if (!activeItem) return;
    var t = e.touches ? e.touches[0] : e;
    var dx = t.clientX - startX;
    var dy = t.clientY - startY;
    if (locked === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (locked === 'y') { reset(); return; }
    }
    if (locked !== 'x') return;
    if (dx < 0) dx = dx * 0.25; // rubber-band left
    var travel = Math.min(320, Math.max(-40, dx));
    var progress = Math.max(0, Math.min(1, travel / THRESHOLD));
    activeItem.style.transform = 'translate3d(' + travel + 'px,0,0)';
    activeItem.style.opacity = String(Math.max(0.2, 1 - Math.abs(travel) / 260));
    activeBg.style.opacity = String(progress);
    activeBg.style.transform = 'scale(' + (0.9 + 0.1 * progress) + ')';
    var nowArmed = travel >= THRESHOLD;
    if (nowArmed !== armed) {
      armed = nowArmed;
      activeBg.classList.toggle('is-armed', armed);
      if (armed) { try { if (navigator.vibrate) navigator.vibrate(8); } catch(_) {} }
    }
  }

  function onEnd(e) {
    if (!activeItem) return;
    var t = e.changedTouches ? e.changedTouches[0] : e;
    var dx = t.clientX - startX;
    var item = activeItem, wrap = activeWrap, bg = activeBg, didArm = armed;
    reset();
    if (dx >= THRESHOLD) {
      item.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1), opacity .22s ease';
      item.style.transform  = 'translate3d(120%,0,0)';
      item.style.opacity    = '0';
      bg.style.opacity      = didArm ? '1' : String(bg.style.opacity || 1);
      var id = item.getAttribute('data-id');
      setTimeout(function() {
        wrap.style.overflow   = 'hidden';
        wrap.style.maxHeight  = wrap.offsetHeight + 'px';
        wrap.offsetHeight; // force reflow
        wrap.style.transition = 'max-height .26s ease, opacity .2s ease, margin .2s ease';
        wrap.style.maxHeight  = '0';
        wrap.style.opacity    = '0';
        wrap.style.marginBottom = '0';
        setTimeout(function() { APP.deleteNotif(id); }, 270);
      }, 230);
    } else {
      item.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1), opacity .25s ease';
      item.style.transform  = '';
      item.style.opacity    = '';
      bg.style.transition   = 'opacity .25s ease, transform .25s ease';
      bg.style.opacity      = '0';
      bg.style.transform    = 'scale(.9)';
      bg.classList.remove('is-armed');
      setTimeout(function() { item.style.transition = ''; bg.style.transition = ''; }, 360);
    }
  }

  container.addEventListener('touchstart',  onStart,  { passive: true });
  container.addEventListener('touchmove',   onMove,   { passive: true });
  container.addEventListener('touchend',    onEnd,    { passive: true });
  container.addEventListener('touchcancel', function() {
    if (!activeItem) return;
    var item = activeItem, bg = activeBg; reset();
    if (item) { item.style.transition = 'transform .25s ease'; item.style.transform = ''; item.style.opacity = ''; }
    if (bg) { bg.style.opacity = '0'; bg.style.transform = 'scale(.9)'; bg.classList.remove('is-armed'); }
  }, { passive: true });
}

APP.clearNotifHistory = function() {
  clearNotifHistory();
  renderNotifHistory();
};

APP.deleteNotif = function(id) {
  deleteNotifById(id);
  renderNotifHistory();
};

APP.refreshNotifHistory = function() {
  if (STATE.currentScreen === 'alerts') renderNotifHistory();
};

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
  APP._garageView = null;
  APP._garageStopPoll();
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
  _fireFieldEvent('puncture', {});
  var gps = STATE.helpGps;
  var mapsUrl = (gps && gps.lat)
    ? 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA/@' + gps.lat + ',' + gps.lng + ',15z'
    : 'https://www.google.com/maps/search/%D7%A4%D7%A0%D7%A6%D7%A8%D7%99%D7%94+24+%D7%A9%D7%A2%D7%95%D7%AA';

  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-spinner">&#x27F3; טוען ספק שירות...</div>' +
    '</div>'
  );

  var providerHtml = '';
  try {
    var res = await gasPost('get_service_providers', { category: 'puncture' });
    if (res.ok && res.providers && res.providers.length > 0) {
      var p = res.providers[0];
      var phoneClean = (p.phone || '').replace(/[^0-9*+]/g, '');
      var waNum = phoneClean.startsWith('+') ? phoneClean.replace('+','') : ('972' + phoneClean.replace(/^0/,''));
      var waText = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה עם פנצ\'ר.' + (gps && gps.lat ? ' מיקום: https://maps.google.com/?q=' + gps.lat + ',' + gps.lng : ''));

      /* סטטוס פתיחה */
      var isOpen = null;
      if (p.googlePlaceId) {
        try {
          var sr = await gasPost('get_place_status', { placeId: p.googlePlaceId });
          if (sr && sr.ok !== undefined) isOpen = sr.isOpen;
        } catch(e2) {}
      }
      var statusHtml = '';
      if (isOpen === true)  statusHtml = '<div class="pc-status-open">&#x2705; פתוח כרגע</div>';
      if (isOpen === false) statusHtml = '<div class="pc-status-closed">&#x26A0;&#xFE0F; סגור כרגע</div>';

      /* שעות פתיחה */
      var hoursHtml = '';
      if (p.openingHours && p.openingHours.trim()) {
        var dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        var todayName = dayNames[new Date().getDay()];
        var lines = p.openingHours.split('\n').filter(function(l){ return l.trim(); });
        hoursHtml = '<div class="prov-hours-wrap">';
        lines.forEach(function(line) {
          var isToday = line.indexOf(todayName) !== -1;
          hoursHtml += '<div class="prov-hours-row' + (isToday ? ' prov-hours-today' : '') + '">' +
            line.replace(/</g,'&lt;') + '</div>';
        });
        hoursHtml += '</div>';
      }

      var cleanAddr = p.address ? p.address.replace(/,?\s*\d[A-Z0-9]{3}\+[A-Z0-9]{2,}\s*/g,'').trim().replace(/,\s*$/,'') : '';
      var wazUrl = cleanAddr ? 'https://waze.com/ul?q=' + encodeURIComponent(cleanAddr) + '&navigate=yes' : '';
      var isMobile = /^0(5|7)\d/.test((p.phone||'').replace(/\D/g,'').replace(/^972/,'0'));
      /* WA — ללא מיקום, ללא apostrophe בתוך onclick */
      var waMsg = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה בנושא פנצר.');
      window._pcWaNum = isMobile ? waNum : '';
      window._pcWaMsg = isMobile ? waMsg : '';

      providerHtml =
        '<div class="pc-badge">🏷️ ספק מורשה — עמותת עלה</div>' +
        '<div class="pc-card">' +
          '<div class="pc-header">' +
            '<div class="pc-icon-wrap">🔧</div>' +
            '<div class="pc-name-wrap">' +
              '<div class="pc-name">' + (p.name||'') + '</div>' +
              (p.contactName ? '<div class="pc-contact">'+p.contactName+'</div>' : '') +
            '</div>' +
          '</div>' +
          (statusHtml ? '<div class="pc-status-row">'+statusHtml+'</div>' : '') +
          (cleanAddr ?
            '<div class="pc-addr-row">' +
              '<span class="pc-addr-text">📍 '+cleanAddr+'</span>' +
              (wazUrl ? '<a href="'+wazUrl+'" target="_blank" class="pc-waze-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M19.07 4.93a10 10 0 0 0-16.28 11 1.06 1.06 0 0 1 .09.82l-.8 2.9a1 1 0 0 0 1.24 1.24l2.9-.8a1.05 1.05 0 0 1 .81.1 10 10 0 0 0 12.04-15.26zm-5.2 13.07a1.08 1.08 0 1 1 1.08-1.07 1.08 1.08 0 0 1-1.08 1.07zm1.4-5.14a1.25 1.25 0 0 1-1.25 1h-.15a1.25 1.25 0 0 1-1.1-1.37l.36-3.82a1.11 1.11 0 1 1 2.2.21zm-5.5 5.14a1.08 1.08 0 1 1 1.08-1.07 1.08 1.08 0 0 1-1.05 1.07zm1.4-5.14a1.25 1.25 0 0 1-1.25 1h-.15A1.25 1.25 0 0 1 9.67 12l.36-3.82a1.11 1.11 0 1 1 2.2.21z"/></svg> Waze</a>' : '') +
            '</div>' : '') +
          (hoursHtml ?
            '<details class="pc-hours-toggle"><summary>🕐 שעות פתיחה</summary>'+hoursHtml+'</details>'
            : '') +
          '<div class="pc-btns">' +
            (phoneClean ?
              '<button class="pc-btn-call" onclick="window.open(\'tel:'+phoneClean+'\')">'+
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
                ' חייג — ' + (p.phone||'') +
              '</button>'
            : '') +
            (isMobile ?
              '<button class="pc-btn-wa" onclick="window.open(\'https://wa.me/\'+window._pcWaNum+(window._pcWaMsg?\'?text=\'+window._pcWaMsg:\'\'),\'_blank\')">'+
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
                ' וואטסאפ' +
              '</button>'
            : '') +
          '</div>' +
        '</div>';
    }
  } catch(e) { /* ספק לא נטען */ }

  var emergencyHtml = '';
  if (isOpen === false && providerHtml) {
    emergencyHtml =
      '<div class="pc-emergency">' +
        '<div class="pc-emergency-title">⚠️ ספק השירות המורשה סגור כעת</div>' +
        '<div class="pc-emergency-body">במידה ומדובר במקרה חירום שאינו יכול להידחות לשעות הפעילות של ספק השירות בהסדר — ניתן לאתר שירות פנצריות זמין באזורך.</div>' +
        '<button class="pc-btn-search" onclick="window.open(\''+mapsUrl+'\')">🔍 חיפוש פנצריות פתוחות 24/7 קרוב אליי</button>' +
      '</div>';
  }

  /* ── נתוני צמיגים ── */
  /* _wheelSvg — גלגל מבט מהצד עם חישורים, 48x48 viewBox */
  var _wheelSvg = function(clr) {
    var s = clr; /* spoke+rim color */
    /* 5 חישורים: זוויות 90°,162°,234°,306°,18° — מרכז r=5 → שפה r=15 */
    var spokes = '';
    var angles = [90, 162, 234, 306, 18];
    for (var ai = 0; ai < angles.length; ai++) {
      var rad = angles[ai] * Math.PI / 180;
      var x1 = (24 + 5 * Math.cos(rad)).toFixed(2);
      var y1 = (24 - 5 * Math.sin(rad)).toFixed(2);
      var x2 = (24 + 15 * Math.cos(rad)).toFixed(2);
      var y2 = (24 - 15 * Math.sin(rad)).toFixed(2);
      spokes += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + s + '" stroke-width="2.2" stroke-linecap="round"/>';
    }
    return '<svg width="52" height="52" viewBox="0 0 48 48" style="display:block;margin:0 auto 6px">' +
      '<circle cx="24" cy="24" r="22" fill="#0d1624" stroke="#1e293b" stroke-width="1"/>' +
      '<circle cx="24" cy="24" r="22" fill="none" stroke="' + s + '" stroke-width="4.5" stroke-dasharray="5.5 3" stroke-dashoffset="2" opacity=".75"/>' +
      '<circle cx="24" cy="24" r="17" fill="#0a1020" stroke="#1e2d40" stroke-width="1"/>' +
      '<circle cx="24" cy="24" r="15" fill="none" stroke="' + s + '" stroke-width="1.5" opacity=".5"/>' +
      spokes +
      '<circle cx="24" cy="24" r="5" fill="' + s + '" opacity=".9"/>' +
      '<circle cx="24" cy="24" r="2.2" fill="#0a1020"/>' +
    '</svg>';
  };
  var _gaugeHtml = function(psi, label) {
    if (!psi) return '';
    var pct  = Math.min(1, Math.max(0, (psi - 20) / 35)); /* 20–55 PSI range */
    var CIRC = 163.4;
    var ARC  = 122.5; /* 270° arc */
    var fill = Math.round(ARC * pct * 10) / 10;
    var clr  = psi < 29 ? '#ef4444' : psi > 40 ? '#f59e0b' : '#10b981';
    var filterId = 'gf-' + label.replace(/[^a-z]/gi,'');
    return '<div class="tg-item">' +
      '<div class="tg-label">' + label + '</div>' +
      '<svg class="tg-svg" width="84" height="84" viewBox="0 0 64 64">' +
        '<defs><filter id="' + filterId + '"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
        '<circle fill="none" stroke="rgba(255,255,255,.06)" stroke-width="7" stroke-linecap="round" cx="32" cy="32" r="26" stroke-dasharray="' + ARC + ' ' + CIRC + '" transform="rotate(135 32 32)"/>' +
        '<circle fill="none" stroke="' + clr + '" stroke-width="7" stroke-linecap="round" cx="32" cy="32" r="26" transform="rotate(135 32 32)" filter="url(#' + filterId + ')">' +
          '<animate attributeName="stroke-dasharray" from="0 ' + CIRC + '" to="' + fill + ' ' + CIRC + '" dur="1.2s" calcMode="spline" keySplines=".22 1 .36 1" fill="freeze"/>' +
        '</circle>' +
        '<text x="32" y="28" text-anchor="middle" dominant-baseline="central" fill="' + clr + '" font-size="15" font-weight="900" font-family="monospace">' + Math.round(psi) + '</text>' +
        '<text x="32" y="40" text-anchor="middle" dominant-baseline="central" fill="#64748b" font-size="9" font-weight="700">PSI</text>' +
      '</svg>' +
    '</div>';
  };
  var _gd  = STATE.govData  || {};
  var _veh = STATE.vehicle  || {};
  var _tFrontSize = _gd.zmig_kidmi || '';
  var _tRearSize  = _gd.zmig_ahori || '';
  var _pFront = parseFloat(_veh.tirePressureFront) || 0;
  var _pRear  = parseFloat(_veh.tirePressureRear)  || 0;
  var _pNote  = _veh.tirePressureNote || '';
  var tireHtml = (_tFrontSize || _tRearSize || _pFront || _pRear) ?
    '<div class="tire-card">' +
      '<div class="tire-hdr">' +
        '<div class="tire-hdr-icon">' +
          '<svg width="24" height="24" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="none" stroke="white" stroke-width="4" stroke-dasharray="5 3" opacity=".8"/><circle cx="24" cy="24" r="14" fill="none" stroke="white" stroke-width="1.5" opacity=".5"/><line x1="24" y1="3" x2="24" y2="10" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="24" y1="38" x2="24" y2="45" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="3" y1="24" x2="10" y2="24" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="38" y1="24" x2="45" y2="24" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="24" r="4.5" fill="white" opacity=".9"/><circle cx="24" cy="24" r="2" fill="#1e3a8a"/></svg>' +
        '</div>' +
        '<div class="tire-hdr-text">' +
          '<div class="tire-hdr-title">נתוני צמיגים — רכב זה</div>' +
          '<div class="tire-hdr-sub">ממשרד התחבורה</div>' +
        '</div>' +
        '<div class="tire-mot-badge">MOT API</div>' +
      '</div>' +
      (_tFrontSize || _tRearSize ?
        '<div class="tire-sizes">' +
          (_tFrontSize ?
            '<div class="tire-sz-item">' +
              _wheelSvg('#3b82f6') +
              '<div class="tire-sz-lbl">צמיג קדמי</div>' +
              '<div class="tire-sz-val">' + _tFrontSize + '</div>' +
            '</div>' : '') +
          (_tRearSize ?
            '<div class="tire-sz-item">' +
              _wheelSvg('#10b981') +
              '<div class="tire-sz-lbl">צמיג אחורי</div>' +
              '<div class="tire-sz-val">' + _tRearSize + '</div>' +
            '</div>' : '') +
        '</div>' : '') +
      (_pFront || _pRear ?
        '<div class="tire-pres">' +
          '<div class="tire-pres-hdr"><span>לחץ אוויר מומלץ</span></div>' +
          '<div class="tg-row">' +
            _gaugeHtml(_pFront, 'קדמי') +
            _gaugeHtml(_pRear, 'אחורי') +
          '</div>' +
          (_pNote ? '<div class="tire-note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' + _pNote + '</div>' : '') +
        '</div>' : '') +
    '</div>'
  : '';

  _showHelpCard(
    '<style>' +
    '@keyframes blink-warn{0%,100%{opacity:1}50%{opacity:.45}}' +
    '@keyframes fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '.pc-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(37,99,235,.35)}' +
    '.pc-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);animation:fade-in .35s ease}' +
    '.pc-header{display:flex;align-items:center;gap:14px;padding:18px 18px 14px;background:linear-gradient(135deg,#0f2942,#1e3a5f)}' +
    '.pc-icon-wrap{width:48px;height:48px;background:rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}' +
    '.pc-name{font-size:20px;font-weight:800;color:#fff;line-height:1.2}' +
    '.pc-contact{font-size:12px;color:#93c5fd;margin-top:3px}' +
    '.pc-status-row{padding:10px 18px 0}' +
    '.pc-status-open{display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#15803d;font-size:13px;font-weight:800;padding:5px 16px;border-radius:20px}' +
    '.pc-status-closed{display:inline-flex;align-items:center;gap:6px;background:#fff3cd;color:#b45309;font-size:13px;font-weight:800;padding:5px 16px;border-radius:20px;animation:blink-warn 1.4s ease-in-out infinite}' +
    '.pc-addr-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;border-bottom:1px solid #f1f5f9}' +
    '.pc-addr-text{font-size:13px;color:#475569;flex:1;line-height:1.4}' +
    '.pc-waze-btn{display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,#06aed4,#0891b2);color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:12px;text-decoration:none;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(6,174,212,.4)}' +
    '.pc-hours-toggle{padding:10px 18px;border-bottom:1px solid #f1f5f9}' +
    '.pc-hours-toggle summary{font-size:13px;color:#2563eb;font-weight:700;cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}' +
    '.prov-hours-wrap{background:#f8fafc;border-radius:10px;padding:10px 12px;margin-top:8px}' +
    '.prov-hours-row{font-size:12px;color:#64748b;padding:4px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between}' +
    '.prov-hours-row:last-child{border:none}' +
    '.prov-hours-today{font-weight:800;color:#1e3a5f;background:#eff6ff;padding:4px 8px;border-radius:8px;margin:2px -4px}' +
    '.pc-btns{display:flex;flex-direction:column;gap:10px;padding:14px 18px 18px}' +
    '.pc-btn-call{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:17px;font-weight:800;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 16px rgba(22,163,74,.4);transition:transform .15s,box-shadow .15s}' +
    '.pc-btn-call:active{transform:scale(.97)}' +
    '.pc-btn-wa{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:linear-gradient(135deg,#25D366,#1da851);color:#fff;font-size:16px;font-weight:700;border:none;border-radius:14px;cursor:pointer;box-shadow:0 4px 16px rgba(37,211,102,.35);transition:transform .15s}' +
    '.pc-btn-wa:active{transform:scale(.97)}' +
    '.pc-emergency{margin-top:14px;background:linear-gradient(135deg,#fffbeb,#fef9c3);border:2px solid #fcd34d;border-radius:18px;padding:16px 18px}' +
    '.pc-emergency-title{font-size:15px;font-weight:800;color:#92400e;margin-bottom:8px}' +
    '.pc-emergency-body{font-size:13px;color:#78350f;line-height:1.65;margin-bottom:12px}' +
    '.pc-btn-search{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:14px;font-weight:700;border:none;border-radius:12px;cursor:pointer;box-shadow:0 3px 12px rgba(245,158,11,.4)}' +
    '.pc-no-prov{text-align:center;padding:20px 0 10px;color:#64748b;font-size:14px}' +
    '@keyframes tire-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes tire-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '@keyframes sz-pop{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}' +
    '.tire-card{background:linear-gradient(145deg,#0d1b2a,#172244);border:1px solid rgba(255,255,255,.1);border-radius:24px;overflow:hidden;margin-bottom:16px;box-shadow:0 12px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);animation:tire-up .45s cubic-bezier(.22,1,.36,1)}' +
    '.tire-hdr{display:flex;align-items:center;gap:12px;padding:15px 18px 13px;background:linear-gradient(135deg,rgba(29,78,216,.85),rgba(30,58,138,.7));border-bottom:1px solid rgba(255,255,255,.09)}' +
    '.tire-hdr-icon{width:42px;height:42px;background:rgba(255,255,255,.12);border-radius:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;animation:tire-spin 10s linear infinite}' +
    '.tire-hdr-text{flex:1}' +
    '.tire-hdr-title{font-size:15px;font-weight:800;color:#fff;letter-spacing:-.2px}' +
    '.tire-hdr-sub{font-size:11px;color:#93c5fd;margin-top:2px}' +
    '.tire-mot-badge{background:rgba(96,165,250,.15);border:1px solid rgba(96,165,250,.3);border-radius:8px;padding:4px 10px;font-size:10px;font-weight:800;color:#60a5fa;letter-spacing:.8px}' +
    '.tire-sizes{display:flex;gap:10px;padding:14px 16px 12px}' +
    '.tire-sz-item{flex:1;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:14px 10px;text-align:center;animation:sz-pop .4s cubic-bezier(.22,1,.36,1) backwards}' +
    '.tire-sz-item:first-child{animation-delay:.08s}.tire-sz-item:last-child{animation-delay:.16s}' +
    '.tire-sz-lbl{font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.5px;margin:8px 0 6px}' +
    '.tire-sz-val{font-size:16px;font-weight:900;color:#f1f5f9;font-family:"Courier New",monospace;letter-spacing:1px;text-shadow:0 0 18px rgba(96,165,250,.35)}' +
    '.tire-pres{padding:4px 16px 18px}' +
    '.tire-pres-hdr{display:flex;align-items:center;gap:8px;font-size:10px;font-weight:700;color:#475569;letter-spacing:.9px;text-transform:uppercase;margin-bottom:12px}' +
    '.tire-pres-hdr::before,.tire-pres-hdr::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.07)}' +
    '.tg-row{display:flex;gap:10px;justify-content:center}' +
    '.tg-item{flex:1;text-align:center;max-width:120px}' +
    '.tg-label{font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:8px;letter-spacing:.3px}' +
    '.tg-svg{display:block;margin:0 auto;overflow:visible}' +
    '.tire-note{display:flex;align-items:flex-start;gap:8px;margin-top:12px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15);border-radius:12px;padding:10px 14px;font-size:12px;color:#cbd5e1;line-height:1.55}' +
    '</style>' +
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    (tireHtml || '') +
    (providerHtml || '<div class="pc-no-prov">לא הוגדר ספק מורשה במערכת</div>') +
    (emergencyHtml || (!providerHtml
      ? '<button class="pc-btn-search" style="margin-top:8px" onclick="window.open(\''+mapsUrl+'\')">🔍 חיפוש פנצריות פתוחות 24/7 קרוב אליי</button>'
      : '')
    ) +
    '</div>'
  );
};

/* ── מצבר / תקוע ── */
APP.helpBattery = function() {
  _fireFieldEvent('battery', { actionTaken: 'none', locationShared: false });
  window._yadWaMsg = encodeURIComponent('שלום, אני נהג עמותת עלה וצריך עזרה עם הרכב.');

  _showHelpCard(
    '<style>' +
    '@keyframes yd-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@keyframes yd-pulse{0%,100%{box-shadow:0 5px 20px rgba(21,128,61,.45)}60%{box-shadow:0 5px 28px rgba(21,128,61,.75)}}' +
    '.yd-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c2d12,#c2410c);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(194,65,12,.4)}' +
    '.yd-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.13);animation:yd-fade .35s ease}' +
    '.yd-header{background:linear-gradient(135deg,#7c2d12,#b91c1c,#dc2626);padding:20px 18px 18px;display:flex;align-items:center;gap:14px}' +
    '.yd-logo-wrap{width:58px;height:58px;flex-shrink:0;background:rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center}' +
    '.yd-title-wrap{flex:1}' +
    '.yd-org-name{font-size:24px;font-weight:900;color:#fff;letter-spacing:-.4px;line-height:1.1}' +
    '.yd-org-sub{font-size:11px;color:rgba(255,255,255,.8);margin-top:4px;line-height:1.4}' +
    '.yd-services{display:flex;gap:5px;margin-top:9px;flex-wrap:wrap}' +
    '.yd-svc-tag{background:rgba(255,255,255,.2);color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px}' +
    '.yd-vol-notice{margin:14px 16px 0;background:linear-gradient(135deg,#fff7ed,#ffedd5);border:1.5px solid #fed7aa;border-radius:14px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px}' +
    '.yd-vol-icon{font-size:22px;flex-shrink:0}' +
    '.yd-vol-text{font-size:12.5px;color:#7c2d12;font-weight:500;line-height:1.6}' +
    '.yd-vol-text strong{font-weight:800}' +
    '.yd-vol-free{display:inline-block;background:#dc2626;color:#fff;font-size:10px;font-weight:800;padding:2px 9px;border-radius:8px;margin-top:5px}' +
    '.yd-btns{display:flex;flex-direction:column;gap:10px;padding:14px 16px 18px}' +
    '.yd-btn-call{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:17px 14px;background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;font-size:18px;font-weight:900;border:none;border-radius:16px;cursor:pointer;animation:yd-pulse 2.2s ease-in-out infinite}' +
    '.yd-btn-call:active{transform:scale(.97);animation:none}' +
    '.yd-btn-call-inner{display:flex;flex-direction:column;align-items:flex-start}' +
    '.yd-btn-call-main{font-size:18px;font-weight:900;line-height:1.2}' +
    '.yd-btn-call-sub{font-size:11px;font-weight:500;opacity:.85;margin-top:2px}' +
    '.yd-btn-wa{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:linear-gradient(135deg,#25D366,#1da851);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:14px;cursor:pointer;box-shadow:0 3px 14px rgba(37,211,102,.3)}' +
    '.yd-btn-wa:active{transform:scale(.97)}' +
    '</style>' +
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="yd-badge">🛟 סיוע בדרכים</div>' +
    '<div class="yd-card">' +
      '<div class="yd-header">' +
        '<div class="yd-logo-wrap">' +
          /* Yadidim 4-color logo */
          '<svg width="40" height="40" viewBox="0 0 40 40" fill="none">' +
            '<rect x="2"  y="2"  width="16" height="16" rx="5" fill="#1565C0"/>' +
            '<rect x="22" y="2"  width="16" height="16" rx="5" fill="#C2185B"/>' +
            '<rect x="2"  y="22" width="16" height="16" rx="5" fill="#2E7D32"/>' +
            '<rect x="22" y="22" width="16" height="16" rx="5" fill="#E65100"/>' +
          '</svg>' +
        '</div>' +
        '<div class="yd-title-wrap">' +
          '<div class="yd-org-name">ידידים</div>' +
          '<div class="yd-org-sub">ארגון מתנדבים לאומי לסיוע בדרכים</div>' +
          '<div class="yd-services">' +
            '<span class="yd-svc-tag">🔋 מצבר</span>' +
            '<span class="yd-svc-tag">🔧 פנצר</span>' +
            '<span class="yd-svc-tag">🚗 רכב תקוע</span>' +
            '<span class="yd-svc-tag">24/6</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="yd-vol-notice">' +
        '<div class="yd-vol-icon">🤝</div>' +
        '<div class="yd-vol-text">' +
          'שירות זה ניתן <strong>על בסיס התנדבותי בלבד</strong>. מתנדבי ידידים מגיעים לסייע ללא תשלום כלשהו — בהתאם לזמינות המתנדבים באזורך.' +
          '<br><span class="yd-vol-free">חינם לחלוטין</span>' +
        '</div>' +
      '</div>' +
      '<div class="yd-btns">' +
        '<button class="yd-btn-call" onclick="window.open(\'tel:1230\');APP._batteryCall()">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
          '<div class="yd-btn-call-inner">' +
            '<div class="yd-btn-call-main">📞 1230 — מוקד ידידים</div>' +
            '<div class="yd-btn-call-sub">שירות התנדבותי · חייג עכשיו</div>' +
          '</div>' +
        '</button>' +
        '<button class="yd-btn-wa" onclick="window.open(\'https://wa.me/972772021230?text=\'+window._yadWaMsg,\'_blank\')">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
          ' וואטסאפ — ידידים' +
        '</button>' +
      '</div>' +
    '</div>' +
    '</div>'
  );
};

APP._batteryCall = function() { _fireFieldEvent('battery', { actionTaken: 'call', locationShared: false }); };
APP._batteryWa   = function(url) {
  _fireFieldEvent('battery', { actionTaken: 'whatsapp', locationShared: !!(STATE.helpGps && STATE.helpGps.lat) });
  window.open(url, '_blank');
};

/* ── שמשות ── */
APP.helpWindshield = async function() {
  _fireFieldEvent('windshield', {});
  _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-spinner">&#x27F3; טוען פרטי ביטוח...</div></div>');

  var plate    = (STATE.vehicle && STATE.vehicle.plate)   ? STATE.vehicle.plate   : '';
  var vehNum   = (STATE.vehicle && STATE.vehicle.num)     ? STATE.vehicle.num     : '';

  var insCompany = '', insPolicy = '', wdPhone = '', wdProvider = '';
  try {
    var res = await gasPost('get_vehicle_insurance_details', {});
    if (res.ok && res.insurance && res.insurance.hasComprehensive) {
      var ins = res.insurance;
      insCompany = ins.company || '';
      insPolicy  = ins.policyNumber || '';
    }
    /* חפש כיסוי שמשות ב-parsedData — מגיע מ-GAS דרך כיסויים */
    if (res.windshieldCoverage) {
      wdProvider = res.windshieldCoverage.provider || 'אילן קארגלס';
      wdPhone    = res.windshieldCoverage.phone    || '03-6534444';
    } else {
      wdProvider = 'אילן קארגלס';
      wdPhone    = '03-6534444';
    }
  } catch(e) {
    wdProvider = 'אילן קארגלס';
    wdPhone    = '03-6534444';
  }

  window._wdPhone = wdPhone.replace(/[^0-9+]/g,'');

  var claimUrl = 'https://app.ilan-glass.co.il/InsuranceWizard';

  _showHelpCard(
    '<style>' +
    '@keyframes wd-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '.wd-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#0369a1,#0ea5e9);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(14,165,233,.35)}' +
    '.wd-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);animation:wd-fade .35s ease}' +
    '.wd-header{background:linear-gradient(135deg,#075985,#0369a1,#0284c7);padding:20px 18px 18px;display:flex;align-items:center;gap:14px}' +
    '.wd-icon-wrap{width:56px;height:56px;flex-shrink:0;background:rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center}' +
    '.wd-company{font-size:20px;font-weight:900;color:#fff;line-height:1.2}' +
    '.wd-policy{font-size:11px;color:rgba(255,255,255,.7);margin-top:4px}' +
    '.wd-ins-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.25);color:#86efac;font-size:10px;font-weight:800;padding:3px 10px;border-radius:10px;margin-top:6px;border:1px solid rgba(34,197,94,.3)}' +
    '.wd-copy-box{margin:14px 16px 0;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:16px;padding:14px 16px}' +
    '.wd-copy-title{font-size:11px;color:#0369a1;font-weight:800;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}' +
    '.wd-copy-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #e0f2fe}' +
    '.wd-copy-row:last-child{border:none}' +
    '.wd-copy-label{font-size:11px;color:#64748b;font-weight:600}' +
    '.wd-copy-val{font-size:14px;font-weight:800;color:#0c4a6e;font-family:monospace;letter-spacing:.3px}' +
    '.wd-checklist{margin:12px 16px 0;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:16px;padding:14px 16px}' +
    '.wd-checklist-title{font-size:11px;color:#475569;font-weight:800;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}' +
    '.wd-check-item{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;line-height:1.4}' +
    '.wd-check-item:last-child{border:none}' +
    '.wd-check-icon{font-size:16px;flex-shrink:0;margin-top:1px}' +
    '.wd-provider-box{margin:12px 16px 0;background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1.5px solid #7dd3fc;border-radius:14px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}' +
    '.wd-provider-info .wd-provider-name{font-size:15px;font-weight:800;color:#0c4a6e}' +
    '.wd-provider-info .wd-provider-sub{font-size:12px;color:#0369a1;margin-top:2px}' +
    '.wd-btn-phone{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;font-size:13px;font-weight:700;padding:9px 14px;border:none;border-radius:11px;cursor:pointer;white-space:nowrap}' +
    '.wd-btns{display:flex;flex-direction:column;gap:10px;padding:14px 16px 18px}' +
    '.wd-btn-claim{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:17px;background:linear-gradient(135deg,#0369a1,#0284c7,#0ea5e9);color:#fff;font-size:17px;font-weight:900;border:none;border-radius:16px;cursor:pointer;box-shadow:0 5px 20px rgba(3,105,161,.4)}' +
    '.wd-btn-claim:active{transform:scale(.97)}' +
    '.wd-btn-claim-inner{display:flex;flex-direction:column;align-items:flex-start}' +
    '.wd-btn-claim-main{font-size:17px;font-weight:900;line-height:1.2}' +
    '.wd-btn-claim-sub{font-size:11px;font-weight:500;opacity:.8;margin-top:2px}' +
    '</style>' +
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="wd-badge">🪟 תביעת שמשות</div>' +
    '<div class="wd-card">' +

      /* Header */
      '<div class="wd-header">' +
        '<div class="wd-icon-wrap">' +
          '<svg width="34" height="34" viewBox="0 0 34 34" fill="none">' +
            '<path d="M6 26 L5 14 Q7 5 17 5 Q27 5 29 14 L28 26 Z" fill="rgba(255,255,255,0.9)"/>' +
            '<path d="M11 6 L14 14 L20 11 L18 26" stroke="#0369a1" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
          '</svg>' +
        '</div>' +
        '<div>' +
          '<div class="wd-company">' + (insCompany || 'ביטוח מקיף') + '</div>' +
          (insPolicy ? '<div class="wd-policy">פוליסה: ' + insPolicy + '</div>' : '') +
          '<div class="wd-ins-badge">✅ כיסוי שמשות פעיל</div>' +
        '</div>' +
      '</div>' +

      /* פרטים להעתקה לטופס */
      '<div class="wd-copy-box">' +
        '<div class="wd-copy-title">📋 פרטים למילוי הטופס</div>' +
        (plate  ? '<div class="wd-copy-row"><span class="wd-copy-label">מספר רישוי</span><span class="wd-copy-val">' + plate + '</span></div>' : '') +
        (vehNum ? '<div class="wd-copy-row"><span class="wd-copy-label">מספר רכב</span><span class="wd-copy-val">' + vehNum + '</span></div>' : '') +
        (insCompany ? '<div class="wd-copy-row"><span class="wd-copy-label">חברת ביטוח</span><span class="wd-copy-val">' + insCompany + '</span></div>' : '') +
        '<div class="wd-copy-row"><span class="wd-copy-label">סוג ביטוח</span><span class="wd-copy-val">ביטוח מקיף</span></div>' +
      '</div>' +

      /* צ׳קליסט הכנה */
      '<div class="wd-checklist">' +
        '<div class="wd-checklist-title">✅ מה להכין לפני הגשה</div>' +
        '<div class="wd-check-item"><span class="wd-check-icon">📸</span><span>4 תמונות שמשה: שלמה, קרוב לנזק, אזור מראה פנימי, חזית הרכב עם לוחית</span></div>' +
        '<div class="wd-check-item"><span class="wd-check-icon">📄</span><span>רישיון רכב (רישיון רכב בתוקף)</span></div>' +
        '<div class="wd-check-item"><span class="wd-check-icon">📄</span><span>אישור ביטוח חובה</span></div>' +
      '</div>' +

      /* ספק */
      '<div class="wd-provider-box">' +
        '<div class="wd-provider-info">' +
          '<div class="wd-provider-name">' + wdProvider + '</div>' +
          '<div class="wd-provider-sub">ספק שמשות מורשה</div>' +
        '</div>' +
        (window._wdPhone ? '<button class="wd-btn-phone" onclick="window.open(\'tel:\'+window._wdPhone)"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' + wdPhone + '</button>' : '') +
      '</div>' +

      /* כפתור תביעה */
      '<div class="wd-btns">' +
        '<button class="wd-btn-claim" onclick="window.open(\'' + claimUrl + '\',\'_blank\')">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
          '<div class="wd-btn-claim-inner">' +
            '<div class="wd-btn-claim-main">פתח טופס תביעה</div>' +
            '<div class="wd-btn-claim-sub">אילן קארגלס · מעבר לאתר</div>' +
          '</div>' +
        '</button>' +
      '</div>' +

    '</div>' +
    '</div>'
  );
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
      window._towMgrPhone = mgrPhone ? mgrPhone.replace(/[^0-9+]/g,'') : '';
      _showHelpCard(
        '<style>' +
        '.tw-no-ins{background:#1e293b;border-radius:20px;padding:24px 18px;text-align:center;animation:tw-fade .35s ease}' +
        '@keyframes tw-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
        '.tw-no-ins-icon{font-size:44px;margin-bottom:12px}' +
        '.tw-no-ins-title{font-size:18px;font-weight:800;color:#f8fafc;margin-bottom:8px}' +
        '.tw-no-ins-sub{font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:20px}' +
        '.tw-btn-mgr{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:16px;font-weight:800;border:none;border-radius:14px;cursor:pointer}' +
        '</style>' +
        '<div class="help-card">' +
        '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
        '<div class="tw-no-ins">' +
          '<div class="tw-no-ins-icon">🚫</div>' +
          '<div class="tw-no-ins-title">לא נמצא ביטוח מקיף</div>' +
          '<div class="tw-no-ins-sub">לרכב זה אין ביטוח מקיף פעיל במערכת. לסיוע פנה למנהל הצי.</div>' +
          (window._towMgrPhone ? '<button class="tw-btn-mgr" onclick="window.open(\'tel:\'+window._towMgrPhone)"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg> התקשר למנהל הצי</button>' : '') +
        '</div></div>'
      );
      return;
    }

    /* שמירה על window למניעת בעיות scope ב-onclick */
    window._towPhone = (ins.emergencyPhone || '').replace(/[^0-9+]/g,'');
    window._towGaragePhone = (garage && garage.phone) ? (garage.phone).replace(/[^0-9+]/g,'') : '';

    _showHelpCard(
      '<style>' +
      '@keyframes tw-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '.tw-badge{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;font-size:11px;font-weight:800;letter-spacing:.8px;padding:5px 16px;border-radius:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(37,99,235,.35)}' +
      '.tw-card{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.13);animation:tw-fade .35s ease}' +
      '.tw-header{background:linear-gradient(135deg,#0f2942,#1e3a5f,#1d4ed8);padding:20px 18px 18px;display:flex;align-items:center;gap:14px}' +
      '.tw-icon-wrap{width:56px;height:56px;flex-shrink:0;background:rgba(255,255,255,.15);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px}' +
      '.tw-company{font-size:20px;font-weight:900;color:#fff;line-height:1.2}' +
      '.tw-policy{font-size:11px;color:rgba(255,255,255,.7);margin-top:4px}' +
      '.tw-active-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.25);color:#86efac;font-size:10px;font-weight:800;padding:3px 10px;border-radius:10px;margin-top:6px;border:1px solid rgba(34,197,94,.3)}' +
      '.tw-provider-box{margin:14px 16px 0;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:14px;padding:14px 16px}' +
      '.tw-provider-label{font-size:11px;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}' +
      '.tw-provider-name{font-size:17px;font-weight:800;color:#0c4a6e}' +
      '.tw-provider-phone{font-size:14px;color:#0369a1;margin-top:3px;font-weight:600}' +
      '.tw-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 16px}' +
      '.tw-info-cell{background:#f8fafc;border-radius:12px;padding:12px 14px}' +
      '.tw-info-label{font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}' +
      '.tw-info-val{font-size:15px;font-weight:800;color:#1e293b}' +
      '.tw-btns{display:flex;flex-direction:column;gap:10px;padding:4px 16px 18px}' +
      '.tw-btn-call{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:17px;background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;font-size:17px;font-weight:900;border:none;border-radius:16px;cursor:pointer;box-shadow:0 5px 20px rgba(21,128,61,.4)}' +
      '.tw-btn-call:active{transform:scale(.97)}' +
      '.tw-btn-call-inner{display:flex;flex-direction:column;align-items:flex-start}' +
      '.tw-btn-call-main{font-size:17px;font-weight:900;line-height:1.2}' +
      '.tw-btn-call-sub{font-size:11px;font-weight:500;opacity:.8;margin-top:2px}' +
      '.tw-garage-box{margin:0 16px 18px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;padding:14px 16px}' +
      '.tw-garage-label{font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px}' +
      '.tw-garage-name{font-size:15px;font-weight:800;color:#1e293b}' +
      '.tw-garage-addr{font-size:12px;color:#64748b;margin-top:3px}' +
      '.tw-btn-garage{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:14px;font-weight:700;border:none;border-radius:12px;cursor:pointer;margin-top:10px}' +
      '</style>' +
      '<div class="help-card">' +
      '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
      '<div class="tw-badge">🛡️ ביטוח מקיף</div>' +
      '<div class="tw-card">' +
        '<div class="tw-header">' +
          '<div class="tw-icon-wrap">🚛</div>' +
          '<div>' +
            '<div class="tw-company">' + (ins.company||'') + '</div>' +
            (ins.policyNumber ? '<div class="tw-policy">פוליסה: ' + ins.policyNumber + '</div>' : '') +
            '<div class="tw-active-badge">✅ ביטוח מקיף פעיל</div>' +
          '</div>' +
        '</div>' +
        (ins.towingProvider || ins.emergencyPhone ?
          '<div class="tw-provider-box">' +
            '<div class="tw-provider-label">🔗 ספק גרירה ושירותי דרך</div>' +
            (ins.towingProvider ? '<div class="tw-provider-name">' + ins.towingProvider + '</div>' : '') +
            (ins.emergencyPhone ? '<div class="tw-provider-phone">📞 ' + ins.emergencyPhone + '</div>' : '') +
          '</div>' : '') +
        '<div class="tw-info-grid">' +
          '<div class="tw-info-cell"><div class="tw-info-label">רכב חלופי</div><div class="tw-info-val">' + (ins.includesRentalCar ? '✅ כלול' : '❌ לא כלול') + '</div></div>' +
          (ins.expiryDate ? '<div class="tw-info-cell"><div class="tw-info-label">בתוקף עד</div><div class="tw-info-val" style="font-size:13px">' + ins.expiryDate + '</div></div>' : '<div class="tw-info-cell"><div class="tw-info-label">סוג ביטוח</div><div class="tw-info-val" style="font-size:12px">מקיף מלא</div></div>') +
        '</div>' +
        (window._towPhone ?
          '<div class="tw-btns">' +
            '<button class="tw-btn-call" onclick="window.open(\'tel:\'+window._towPhone)">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
              '<div class="tw-btn-call-inner">' +
                '<div class="tw-btn-call-main">חייג לספק גרירה</div>' +
                '<div class="tw-btn-call-sub">' + (ins.emergencyPhone||'') + ' · מוקד 24/7</div>' +
              '</div>' +
            '</button>' +
          '</div>' : '') +
        (garage ?
          '<div class="tw-garage-box">' +
            '<div class="tw-garage-label">🔧 יעד גרירה מומלץ</div>' +
            '<div class="tw-garage-name">' + (garage.name||'') + '</div>' +
            (garage.address ? '<div class="tw-garage-addr">📍 ' + garage.address + '</div>' : '') +
            (window._towGaragePhone ? '<button class="tw-btn-garage" onclick="window.open(\'tel:\'+window._towGaragePhone)"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg> התקשר למוסך</button>' : '') +
          '</div>' : '') +
      '</div>' +
      '</div>'
    );
  } catch(e) {
    _showHelpCard('<div class="help-card"><button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button><div class="help-card-error">שגיאה בטעינת נתונים.</div></div>');
  }
};

/* ── מוסך — זרימת אישור מנהל ── */
APP.helpGarage = function() {
  APP._garageView = 'main';
  var g = (STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : null;
  var garageName = (g && g.name) ? g.name : '';
  var garageAddr = (g && g.address) ? g.address : '';
  var garageId   = (g && g.id) ? g.id : '';

  // אם יש אישור פעיל — הצג מסך מוסך מאושר עם פרטי קשר מלאים
  var approved = APP._garageGetApproved && APP._garageGetApproved();
  if (approved) { APP._garageShowApprovedFromStorage(); return; }

  // Check if there's a pending request — show UI then start live status polling
  var pending = APP._garageGetPending();
  if (pending) {
    APP._garageShowPending(pending);
    APP._garagePollStatus(pending);
    return;
  }

  var garageInfo = '<div style="background:rgba(255,255,255,0.07);border-radius:10px;padding:10px 14px;margin-bottom:14px">' +
    '<div style="font-size:12px;color:#94a3b8;margin-bottom:2px">המוסך שלך</div>' +
    '<div style="font-size:14px;font-weight:700;color:#f1f5f9">' + (garageName || 'מוסך') + '</div>' +
    (garageAddr ? '<div style="font-size:12px;color:#94a3b8;margin-top:1px">&#x1F4CD; ' + garageAddr + '</div>' : '') +
    '</div>';

  var reasons = [
    { id: 'periodic_service', label: 'טיפול תקופתי', icon: '🔧', sub: 'לפי לוח שירות הרכב' },
    { id: 'fault',            label: 'תקלה / בעיה',  icon: '⚠️', sub: 'תיאור חופשי של הבעיה' }
  ];
  var reasonsHtml = reasons.map(function(r) {
    return '<button onclick="APP._garageSelectReason(\'' + r.id + '\')" style="display:flex;align-items:center;gap:14px;width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer;text-align:right">' +
      '<span style="font-size:26px;flex-shrink:0">' + r.icon + '</span>' +
      '<div style="flex:1">' +
        '<div style="font-size:15px;font-weight:700;color:#f1f5f9">' + r.label + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:2px">' + r.sub + '</div>' +
      '</div>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</button>';
  }).join('');

  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">🏭 כניסה למוסך</div>' +
    '<div class="help-card-sub">כל כניסה למוסך מחייבת אישור מנהל</div>' +
    '<hr class="help-card-divider">' +
    garageInfo +
    '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:10px">בחר סיבת הפנייה:</div>' +
    reasonsHtml +
    '</div>'
  );
  APP._garageCtx = {
    garageId:      garageId,
    garageName:    garageName,
    garageAddress: garageAddr,
    garageInfo:    APP._garageBuildInfoFromState()
  };
};

APP._garageSelectReason = function(reasonId) {
  var labels = { periodic_service: 'טיפול תקופתי', fault: 'תקלה / בעיה' };
  var reasonLabel = labels[reasonId] || reasonId;
  APP._garageCtx = APP._garageCtx || {};
  APP._garageCtx.reasonId = reasonId;
  APP._garageCtx.reasonLabel = reasonLabel;
  if (reasonId === 'periodic_service') {
    APP._garagePeriodicFlow();
  } else {
    APP._garageFaultFlow();
  }
};

APP._garagePeriodicFlow = function() {
  var v = STATE.vehicle || {};
  var nextServiceKm = parseFloat(v.nextServiceKm || v.nextService || 0);
  var currentKm = parseFloat(v.currentKm || v.estKm || 0);
  var distance = nextServiceKm > 0 ? (nextServiceKm - currentKm) : null;

  if (distance !== null && distance > 1500) {
    _showHelpCard(
      '<div class="help-card">' +
      '<button class="help-back-btn" onclick="APP.helpGarage()">&#x25C4; חזרה</button>' +
      '<div class="help-card-title">🔧 טיפול תקופתי</div>' +
      '<hr class="help-card-divider">' +
      '<div style="text-align:center;padding:20px 0">' +
        '<div style="font-size:48px;margin-bottom:12px">📊</div>' +
        '<div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:8px">הרכב אינו זקוק לטיפול בשלב זה</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:6px">מרחק לטיפול הבא: <b style="color:#10b981">' + Math.round(distance).toLocaleString('he-IL') + ' ק"מ</b></div>' +
        '<div style="font-size:12px;color:#64748b">ניתן לפנות כשהמרחק יירד מתחת ל-1,500 ק"מ</div>' +
      '</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
    return;
  }

  var distanceLabel = distance === null ? '' :
    (distance < 0 ? 'חריגה: ' + Math.abs(Math.round(distance)).toLocaleString('he-IL') + ' ק"מ' :
     'מרחק לטיפול: ' + Math.round(distance).toLocaleString('he-IL') + ' ק"מ');
  var distanceColor = distance !== null && distance < 0 ? '#ef4444' : '#10b981';

  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP.helpGarage()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">🔧 טיפול תקופתי</div>' +
    '<div class="help-card-sub">שליחת בקשה לאישור מנהל</div>' +
    '<hr class="help-card-divider">' +
    '<div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px">' +
      (v.num ? '<div style="margin-bottom:4px"><span style="color:#94a3b8">רכב:</span> <b style="color:#f1f5f9">' + (v.brand || '') + ' ' + (v.model || '') + ' · ' + v.num + '</b></div>' : '') +
      (currentKm ? '<div style="margin-bottom:4px"><span style="color:#94a3b8">ק"מ נוכחי:</span> <b style="color:#f1f5f9">' + Math.round(currentKm).toLocaleString('he-IL') + '</b></div>' : '') +
      (distanceLabel ? '<div><span style="color:#94a3b8">סטטוס:</span> <b style="color:' + distanceColor + '">' + distanceLabel + '</b></div>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:#94a3b8;margin-bottom:16px">לאחר אישור המנהל תקבל פרטי המוסך ואפשרות קביעת תור</div>' +
    '<button class="help-action-btn" onclick="APP._garageSubmitRequest()">&#x1F4E8; שלח בקשה לאישור מנהל</button>' +
    '</div>'
  );
  APP._garageCtx.km = currentKm;
  APP._garageCtx.kmToService = distance;
  APP._garageCtx.licensePlate = v.num || '';
};

APP._garageFaultFlow = function() {
  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP.helpGarage()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">⚠️ תקלה / בעיה</div>' +
    '<div class="help-card-sub">תאר את הבעיה — הבקשה תישלח לאישור מנהל</div>' +
    '<hr class="help-card-divider">' +
    '<textarea class="help-textarea" id="garage-fault-desc" placeholder="תאר את הבעיה בפרוטרוט (מינימום 20 תווים)..." rows="4" style="margin-bottom:14px"></textarea>' +
    '<button class="help-action-btn" onclick="APP._garageSubmitFault()">&#x1F4E8; שלח בקשה לאישור מנהל</button>' +
    '</div>'
  );
  APP._garageCtx.km = parseFloat((STATE.vehicle || {}).currentKm || (STATE.vehicle || {}).estKm || 0);
  APP._garageCtx.licensePlate = (STATE.vehicle || {}).num || '';
};

APP._garageSubmitFault = async function() {
  var desc = ((document.getElementById('garage-fault-desc') || {}).value || '').trim();
  if (desc.length < 20) { showToast('יש לתאר את הבעיה (מינימום 20 תווים)'); return; }
  if (!APP._garageCtx) APP._garageCtx = {};
  APP._garageCtx.description = desc;
  await APP._garageSubmitRequest();
};

APP._garageSubmitRequest = async function() {
  var btn = document.querySelector('.help-action-btn');
  try {
    var ctx = APP._garageCtx || {};
    var v = STATE.vehicle || {};
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
      driverName:    (STATE.user && STATE.user.name) || v.holder || ''
    };
    if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
    var result = await _fireFieldEvent('garage_request', details);
    if (result.ok) {
      var eventId = result.eventId || '';
      try {
        var _pendingData = { eventId: eventId, reason: ctx.reasonId, reasonLabel: ctx.reasonLabel, description: ctx.description || '', submittedAt: Date.now() };
        localStorage.setItem('pendingGarageRequest', JSON.stringify(_pendingData));
        _fbSetPendingGarage(_pendingData);
      } catch(e) {}
      _showHelpCard(
        '<div class="help-card" style="text-align:center;padding:32px 20px">' +
        '<div style="font-size:48px;margin-bottom:12px">📤</div>' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:8px">הבקשה נשלחה!</div>' +
        '<div style="font-size:14px;color:#94a3b8;margin-bottom:20px">ממתין לאישור מנהל הצי — תקבל התראה בהקדם</div>' +
        '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
        '</div>'
      );
    } else if (result && result.error === 'duplicate_pending_request') {
      // Preserve existing pending (has correct reason/description from original submission)
      // Only write minimal entry if localStorage is empty (different device)
      var dup = APP._garageGetPending();
      if (!dup && result.eventId) {
        try {
          var _dupPending = { eventId: result.eventId, submittedAt: Date.now() };
          localStorage.setItem('pendingGarageRequest', JSON.stringify(_dupPending));
          _fbSetPendingGarage(_dupPending);
          dup = APP._garageGetPending();
        } catch(_e) {}
      }
      if (btn) { btn.disabled = false; }
      // מסך הסבר ברור לנהג במקום להציג ישירות את מסך ההמתנה
      _showHelpCard(
        '<div class="help-card" style="text-align:center;padding:28px 20px">' +
        '<div style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:20px;background:linear-gradient(135deg,#d97706,#f59e0b);margin-bottom:14px">' +
          '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '</div>' +
        '<div style="font-size:17px;font-weight:800;color:#f1f5f9;margin-bottom:8px">יש בקשה פתוחה</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px;line-height:1.6">הבקשה הקודמת שלך עדיין ממתינה לאישור המנהל.<br>לא ניתן לשלוח בקשה חדשה עד שתאושר או תידחה.</div>' +
        (dup && dup.reasonLabel ? '<div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;text-align:right">' +
          '<div style="color:#94a3b8;margin-bottom:3px">סיבת הבקשה הקודמת</div>' +
          '<div style="color:#f1f5f9;font-weight:600">' + _escHtml(dup.reasonLabel) + '</div>' +
          (dup.description ? '<div style="color:#94a3b8;margin-top:4px">' + _escHtml(dup.description) + '</div>' : '') +
        '</div>' : '') +
        '<button class="help-action-btn" style="margin-bottom:8px" onclick="(function(){' +
          'var d=APP._garageGetPending();if(d){APP._garageShowPending(d);APP._garagePollStatus(d);}' +
        '})()">&#x23F3; המתן לאישור מנהל</button>' +
        '<button class="help-action-btn secondary" onclick="APP._garageCancelAndReset(this)">&#x1F5D1; מחק בקשה ישנה — שלח חדשה</button>' +
        '</div>'
      );
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📨 שלח בקשה לאישור מנהל'; }
      showToast('שגיאה בשליחה: ' + ((result && result.error) || 'נסה שוב'));
    }
  } catch(e) {
    console.error('_garageSubmitRequest:', e);
    if (btn) { btn.disabled = false; btn.textContent = '📨 שלח בקשה לאישור מנהל'; }
    showToast('שגיאה: ' + (e.message || String(e)));
  }
};

APP._garageGetPending = function() {
  try {
    var raw = localStorage.getItem('pendingGarageRequest');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
};

APP._garageGetApproved = function() {
  try {
    var raw = localStorage.getItem('approvedGarageRequest');
    if (!raw) return null;
    var obj = JSON.parse(raw);
    // אישור פג תוקף אחרי 14 ימים
    if (obj.approvedAt && (Date.now() - obj.approvedAt) > 14 * 24 * 3600 * 1000) {
      try { localStorage.removeItem('approvedGarageRequest'); } catch(e) {}
      _fbClearApprovedGarage();
      return null;
    }
    return obj;
  } catch(e) { return null; }
};

APP._garageClearApproved = function() {
  try { localStorage.removeItem('approvedGarageRequest'); } catch(e) {}
  _fbClearApprovedGarage();
};

// בונה אובייקט garageInfo מלא מ-STATE.vehicle.garage עבור מסך מוסך מאושר
APP._garageBuildInfoFromState = function() {
  var g = (STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : {};
  return {
    id:           g.id || '',
    name:         g.name || '',
    address:      g.address || '',
    phone:        g.phone || '',
    email:        g.email || '',
    contactName:  g.contactName || '',
    contactPhone: g.contactPhone || g.phone || '',
    bookingUrl:   g.bookingUrl || ''
  };
};

// מציג מסך מוסך מאושר מתוך נתוני localStorage + STATE — בלי קריאה לשרת.
// אם יש eventId — ננסה לרענן מהשרת ברקע, אבל מציגים מיידית את מה שיש.
APP._garageShowApprovedFromStorage = function(meta) {
  var approved = APP._garageGetApproved();
  if (!approved && meta && meta.eventId) {
    // אם הגענו דרך toast עם meta אבל עדיין לא נשמר — שמור עכשיו
    try {
      var _metaApproved = {
        eventId:       meta.eventId,
        reasonLabel:   meta.reasonLabel   || '',
        requestNumber: meta.requestNumber || '',
        managerNote:   meta.managerNote   || '',
        approvedAt:    meta.approvedAt    || Date.now()
      };
      localStorage.setItem('approvedGarageRequest', JSON.stringify(_metaApproved));
      _fbSetApprovedGarage(_metaApproved);
    } catch(e) {}
    approved = APP._garageGetApproved();
  }
  if (!approved) {
    // אין נתוני אישור — נפילה חזרה לזרימת הבקשה
    APP.helpGarage();
    return;
  }
  var info          = APP._garageBuildInfoFromState();
  var eventId       = approved.eventId       || '';
  var reason        = approved.reasonLabel   || '';
  var requestNumber = approved.requestNumber || '';
  var approvedAt    = approved.approvedAt    || 0;
  APP._garageShowApproved(info, eventId, reason, requestNumber, approvedAt);

  // רענון אופציונלי מהשרת — silent: לא מפעיל _sessionExpired אם נכשל
  if (eventId && typeof gasPost === 'function') {
    gasPost('get_garage_status', { eventId: eventId }, { silent: true }).then(function(r) {
      if (r && r.ok && String(r.status||'').toLowerCase() === 'approved' && r.garageInfo) {
        APP._garageShowApproved(r.garageInfo, eventId, r.reasonLabel || reason);
      }
    }).catch(function() {});
  }
};

APP._garageShowPending = function(pending) {
  APP._garageView = 'pending';
  var since = '';
  if (pending.submittedAt) {
    try {
      var d = new Date(pending.submittedAt);
      since = d.toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'2-digit' }) +
              ' · ' + d.toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit' });
    } catch(e) {}
  }
  var reqNum = '';
  if (pending.eventId) {
    var m = String(pending.eventId).match(/-(\d+)$/);
    if (m) reqNum = String(parseInt(m[1], 10));
  }
  var reasonLabel = pending.reasonLabel || pending.reason || '';

  _showHelpCard(
    '<div class="help-card" style="padding:0;overflow:hidden">' +

    '<div style="background:linear-gradient(135deg,#78350f,#b45309,#d97706);padding:26px 20px 20px;text-align:center;position:relative">' +
      '<button class="help-back-btn" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:6px 14px;margin:0" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
      '<div class="hourglass-wrap">' +
        '<span class="hourglass-spin">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>' +
        '</span>' +
      '</div>' +
      '<div style="font-size:17px;font-weight:900;color:#fff;margin-bottom:3px">בקשה בהמתנה</div>' +
      '<div style="font-size:12px;color:rgba(255,255,255,.75)">ממתינה לאישור מנהל הצי</div>' +
    '</div>' +

    '<div style="padding:20px">' +

      '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.22);border-radius:14px;padding:14px 16px;margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:10px;display:flex;align-items:center;gap:7px">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>' +
          'כבר הגשת בקשה להיכנס למוסך' +
        '</div>' +
        (reqNum ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
          '<span style="font-size:11px;color:#64748b">מספר פנייה</span>' +
          '<span style="font-size:15px;font-weight:900;color:#f1f5f9">#' + reqNum + '</span>' +
        '</div>' : '') +
        (reasonLabel ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
          '<span style="font-size:11px;color:#64748b">סיבה</span>' +
          '<span style="font-size:12px;font-weight:600;color:#f1f5f9">' + _escHtml(reasonLabel) + '</span>' +
        '</div>' : '') +
        (pending.description ? '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:10px">' +
          '<span style="font-size:11px;color:#64748b;flex-shrink:0;padding-top:2px">תיאור</span>' +
          '<span style="font-size:12px;font-weight:600;color:#f1f5f9;text-align:start;line-height:1.4">' + _escHtml(pending.description) + '</span>' +
        '</div>' : '') +
        (since ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0">' +
          '<span style="font-size:11px;color:#64748b">נשלח</span>' +
          '<span style="font-size:12px;font-weight:600;color:#f1f5f9">' + since + '</span>' +
        '</div>' : '') +
      '</div>' +

      '<div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:11px 14px;margin-bottom:16px">' +
        '<div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;flex-shrink:0;animation:notif-critical-pulse 2s ease infinite"></div>' +
        '<div style="font-size:12px;color:#94a3b8">תקבל התראה push כשהמנהל יאשר את הבקשה</div>' +
      '</div>' +

      '<div style="font-size:11px;color:#475569;text-align:center;margin-bottom:14px;padding:10px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">' +
        'במידה ומדובר בפנייה חדשה ושונה — לחץ "בקשה חדשה"' +
      '</div>' +

      '<button class="help-action-btn secondary" style="margin-bottom:8px" onclick="APP._garageCancelAndReset(this)">&#x1F504; בקשה חדשה</button>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
    '</div></div>'
  );
};

APP._garageClearPending = function() {
  try { localStorage.removeItem('pendingGarageRequest'); } catch(e) {}
  _fbClearPendingGarage();
  APP._garageStopPoll();
};

APP._garageCancelAndReset = async function(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ מבטל...'; }
  var pending = APP._garageGetPending();
  var eventId = pending && pending.eventId;
  if (eventId && String(eventId).indexOf('queued') === -1) {
    try {
      await gasPost('garage_request_action', { requestAction: 'cancel', eventId: eventId }, { silent: true });
    } catch(e) {}
  }
  // Write cancelled marker to Firebase so all other devices clear their state too
  var cancelRef = _fbRef('pendingGarage');
  if (cancelRef) {
    try { cancelRef.set({ status: 'cancelled', ts: Date.now() }); } catch(e) {}
  }
  // Clear local state
  try { localStorage.removeItem('pendingGarageRequest'); } catch(e) {}
  APP._garageStopPoll();
  APP.helpGarage();
};

APP._garageCancelAppointment = function(eventId) {
  var existing = document.getElementById('_gcancel_overlay');
  if (existing) existing.remove();
  var ol = document.createElement('div');
  ol.id = '_gcancel_overlay';
  ol.setAttribute('style', 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .15s ease');
  ol.innerHTML =
    '<div style="background:#1e293b;border-radius:20px;padding:32px 24px;max-width:320px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6)">' +
    '<div style="font-size:36px;margin-bottom:12px">⚠️</div>' +
    '<div style="font-size:17px;font-weight:800;color:#f1f5f9;margin-bottom:8px">ביטול תור</div>' +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:24px">האם לבטל את התור שנקבע?<br>תוכל לקבוע מועד חדש.</div>' +
    '<button style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px" ' +
    'onclick="APP._garageDoCancelAppointment(\'' + (eventId||'') + '\',this)">כן, בטל תור</button>' +
    '<button style="width:100%;padding:14px;background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,.3);border-radius:12px;font-size:15px;cursor:pointer" ' +
    'onclick="document.getElementById(\'_gcancel_overlay\').remove()">חזרה</button>' +
    '</div>';
  document.body.appendChild(ol);
};

APP._garageDoCancelAppointment = async function(eventId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ מבטל...'; }
  var _ol = document.getElementById('_gcancel_overlay');
  if (_ol) _ol.remove();
  try {
    if (eventId) await gasPost('cancel_appointment', { eventId: eventId }, { silent: true });
    try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
    _fbClearActiveAppointment();
    if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
    showToast('התור בוטל');
    APP.helpGarage();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'כן, בטל תור'; }
    showToast('שגיאה — נסה שוב');
  }
};

APP._garageStopPoll = function() {
  if (APP._garagePollTimer) { clearInterval(APP._garagePollTimer); APP._garagePollTimer = null; }
};

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
      var st = String(r.status || '').toLowerCase();
      if (st === 'approved') {
        APP._garageStopPoll();
        APP._garageClearPending();
        try {
          var _reqMatch = String(pending.eventId || '').match(/-(\d+)$/);
          var _reqNum   = _reqMatch ? String(parseInt(_reqMatch[1], 10)) : '';
          var _pollApproved = {
            eventId:       pending.eventId,
            reasonLabel:   r.reasonLabel   || pending.reasonLabel || '',
            requestNumber: r.requestNumber || _reqNum,
            managerNote:   r.managerNote   || '',
            approvedAt:    Date.now()
          };
          localStorage.setItem('approvedGarageRequest', JSON.stringify(_pollApproved));
          _fbSetApprovedGarage(_pollApproved);
        } catch(e) {}
        APP._garageShowApproved(r.garageInfo, pending.eventId, r.reasonLabel || pending.reasonLabel);
      } else if (st === 'rejected') {
        APP._garageStopPoll();
        APP._garageClearPending();
        _showHelpCard(
          '<div class="help-card" style="text-align:center;padding:28px 20px">' +
          '<div style="font-size:40px;margin-bottom:10px">❌</div>' +
          '<div style="font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:6px">הבקשה נדחתה</div>' +
          (r.managerNote ? '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">הערת המנהל: <b style="color:#f1f5f9">' + _escHtml(r.managerNote) + '</b></div>' : '') +
          '<button class="help-action-btn secondary" onclick="APP.helpGarage()">&#x1F504; בקשה חדשה</button>' +
          '<button class="help-action-btn secondary" style="margin-top:8px" onclick="APP.closeHelpMenu()">סגור</button>' +
          '</div>'
        );
      }
    } catch(e) { console.warn('[garagePoll]', e.message); }
  };

  check();
  APP._garagePollTimer = setInterval(check, 8000);
  // Auto-stop after 10 minutes
  setTimeout(function() { APP._garageStopPoll(); }, 600000);
};

APP._garageShowApproved = function(garageInfo, eventId, reasonLabel, requestNumber, approvedAt) {
  APP._garageView = 'approved';
  var g = garageInfo || {};
  var name = g.name || g.garageName || '';
  var addr = g.address || g.garageAddress || '';
  var contact = g.contactName || '';
  var phone = g.contactPhone || g.phone || '';
  var wa = g.whatsapp || phone;
  var bookingUrl = g.bookingUrl || '';

  var approvedDateStr = '';
  if (approvedAt) {
    try {
      approvedDateStr = new Date(approvedAt).toLocaleString('he-IL', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    } catch(e) {}
  }

  var metaRows = '<div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:12px">';
  if (requestNumber) metaRows += '<div style="color:#94a3b8;margin-bottom:3px">מספר אישור: <b style="color:#f1f5f9">#' + requestNumber + '</b></div>';
  if (reasonLabel)   metaRows += '<div style="color:#94a3b8;margin-bottom:3px">סיבה: <b style="color:#f1f5f9">' + _escHtml(reasonLabel) + '</b></div>';
  if (approvedDateStr) metaRows += '<div style="color:#64748b">אושר: ' + approvedDateStr + '</div>';
  metaRows += '</div>';

  var contactRows = '';
  if (contact || phone) {
    contactRows += '<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;margin-bottom:8px;font-size:13px">' +
      (contact ? '<div style="color:#94a3b8">איש קשר: <b style="color:#f1f5f9">' + contact + '</b></div>' : '') +
      (phone ? '<div style="color:#94a3b8;margin-top:2px" dir="ltr">' + phone + '</div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
      (phone ? '<button class="help-action-btn secondary" style="flex:1;padding:9px 6px;font-size:12px" onclick="window.open(\'tel:' + phone.replace(/[^0-9+]/g,'') + '\')">📞 חייג</button>' : '') +
      (wa ? '<button class="help-action-btn secondary" style="flex:1;padding:9px 6px;font-size:12px" onclick="window.open(\'https://wa.me/' + phoneToWa(wa) + '\')">💬 וואטסאפ</button>' : '') +
      '</div></div>';
  }

  _showHelpCard(
    '<div class="help-card">' +
    '<div style="text-align:center;margin-bottom:12px">' +
      '<div style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);border-radius:50px;padding:6px 16px;font-size:12px;font-weight:700;color:#fff">✅ מאושר על ידי מנהל</div>' +
    '</div>' +
    '<div class="help-card-title" style="margin-bottom:4px">🏭 ' + (name || 'המוסך') + '</div>' +
    (addr ? '<div style="font-size:13px;color:#94a3b8;margin-bottom:10px">📍 ' + addr + '</div>' : '') +
    metaRows +
    '<hr class="help-card-divider">' +
    contactRows +
    (bookingUrl ? '<a class="help-action-btn" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px" href="' + bookingUrl + '" target="_blank" rel="noopener">📅 קבע תור אונליין</a>' : '') +
    '<hr class="help-card-divider">' +
    '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:8px">האם קבעת תור במוסך?</div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="help-action-btn" style="flex:1" onclick="APP._garageAppointmentYes(\'' + (eventId||'') + '\')">✅ כן, קבעתי תור</button>' +
      '<button class="help-action-btn secondary" style="flex:1" onclick="APP._garageAppointmentNo()">⏳ עוד לא</button>' +
    '</div>' +
    '</div>'
  );
};

APP._garageAppointmentYes = function(eventId) {
  var todayStr = new Date().toISOString().slice(0, 10);
  var inputStyle = 'width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#f1f5f9;font-size:14px;box-sizing:border-box';
  var labelStyle = 'font-size:11px;color:#64748b;margin-bottom:5px;font-weight:600;display:block';
  _showHelpCard(
    '<div class="help-card">' +
    '<div class="help-card-title">📅 קביעת מועד תור</div>' +
    '<hr class="help-card-divider">' +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:12px">מתי התור שלך במוסך?</div>' +
    '<div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:14px">' +
      '<div style="flex:1">' +
        '<label style="' + labelStyle + '">תאריך</label>' +
        '<input type="date" id="garage-appt-date" min="' + todayStr + '" style="' + inputStyle + '">' +
      '</div>' +
      '<div style="flex:0 0 110px">' +
        '<label style="' + labelStyle + '">שעת הגעה</label>' +
        '<input type="time" id="garage-appt-time" value="09:00" style="' + inputStyle + '">' +
      '</div>' +
    '</div>' +
    '<button class="help-action-btn" onclick="APP._garageConfirmAppointment(\'' + (eventId || '') + '\')">&#x1F4E8; אשר מועד תור</button>' +
    '</div>'
  );
};

APP._garageConfirmAppointment = async function(eventId) {
  var dateVal = ((document.getElementById('garage-appt-date') || {}).value || '').trim();
  var timeVal = ((document.getElementById('garage-appt-time') || {}).value || '09:00').trim();
  if (!dateVal) { showToast('יש לבחור תאריך'); return; }
  if (!eventId) { showToast('מזהה אירוע חסר — פנה למנהל'); return; }
  var btn = document.querySelector('.help-action-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ שולח...'; }
  try {
    var result = await gasPost('garage_set_appointment',
      { eventId: eventId, appointmentDate: dateVal, appointmentTime: timeVal },
      { silent: true }
    );
    if (result && result.ok) {
      APP._garageClearPending();
      APP._garageClearApproved();

      // Save appointment data for home-screen widget
      var _garageCtx = APP._garageCtx || {};
      var _apptData = {
        eventId:         eventId,
        appointmentDate: dateVal,
        appointmentTime: timeVal,
        garageName:    _garageCtx.garageName    || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
        garageAddress: _garageCtx.garageAddress || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
        garagePhone:   _garageCtx.garagePhone   || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || ''
      };
      try {
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_apptData));
        _fbSetActiveAppointment(_apptData);
      } catch(lsErr) { console.warn('activeGarageAppointment save:', lsErr); }

      // Refresh home screen widget immediately
      if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();

      var _dateFmt  = dateVal.split('-').reverse().join('/');
      var _timeDisp = timeVal || '09:00';
      var _calUrl   = _buildGoogleCalendarUrl(dateVal, timeVal, STATE.vehicle);

      _showHelpCard(
        '<div class="help-card" style="padding:0;overflow:hidden">' +

        '<div style="background:linear-gradient(135deg,#052e16,#064e3b,#059669);padding:30px 20px 24px;text-align:center">' +
          '<div style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:20px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);margin-bottom:12px;animation:notif-approved-glow 2.5s ease infinite">' +
            '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</div>' +
          '<div style="font-size:20px;font-weight:900;color:#fff;margin-bottom:4px">תור נקבע!</div>' +
          '<div style="font-size:14px;color:rgba(255,255,255,.85)">תאריך: <b>' + _dateFmt + '</b> · <b>' + _timeDisp + '</b></div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:4px">מנהל הצי קיבל עדכון</div>' +
        '</div>' +

        '<div style="padding:20px">' +

          '<a href="' + _calUrl + '" target="_blank" style="display:flex;align-items:center;gap:12px;background:rgba(59,130,246,.10);border:1px solid rgba(59,130,246,.25);border-radius:14px;padding:14px 16px;margin-bottom:10px;text-decoration:none;cursor:pointer;transition:background .2s" onclick="this.style.background=\'rgba(59,130,246,.2)\'">' +
            '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#1d4ed8,#3b82f6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:14px;font-weight:700;color:#93c5fd">הוסף ליומן Google</div>' +
              '<div style="font-size:11px;color:#64748b;margin-top:2px">פותח את Google Calendar</div>' +
            '</div>' +
          '</a>' +

          '<button onclick="APP._garageShowReminderPicker(\'' + dateVal + '\',\'' + timeVal + '\')" style="display:flex;align-items:center;gap:12px;width:100%;background:rgba(139,92,246,.10);border:1px solid rgba(139,92,246,.22);border-radius:14px;padding:14px 16px;margin-bottom:18px;cursor:pointer;transition:background .2s" onmouseover="this.style.background=\'rgba(139,92,246,.2)\'" onmouseout="this.style.background=\'rgba(139,92,246,.10)\'">' +
            '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-size:14px;font-weight:700;color:#c4b5fd">קבע תזכורת</div>' +
              '<div style="font-size:11px;color:#64748b;margin-top:2px">התראה לפני מועד התור</div>' +
            '</div>' +
          '</button>' +

          '<button class="help-action-btn secondary" style="color:#f87171;border-color:rgba(248,113,113,.3);margin-bottom:8px" onclick="APP._garageCancelAppointment(\'' + eventId + '\')">✕ בטל תור</button>' +
          '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
        '</div></div>'
      );
    } else {
      if (btn) { btn.disabled = false; btn.textContent = '📨 אשר מועד תור'; }
      var errCode = (result && result.error) || 'unknown';
      console.error('[garageAppt] GAS error:', errCode);
      if (errCode === 'session_expired') {
        showToast('פג תוקף הכניסה — התחבר מחדש');
      } else if (errCode === 'not_found') {
        showToast('האירוע לא נמצא — נסה לסגור ולפתוח מחדש');
      } else if (errCode === 'unauthorized') {
        showToast('נדרש אימות מחדש — התחבר שוב');
      } else {
        showToast('שגיאה בקביעת תור (' + errCode + ') — נסה שוב');
      }
    }
  } catch(e) {
    console.error('_garageConfirmAppointment:', e);
    if (btn) { btn.disabled = false; btn.textContent = '📨 אשר מועד תור'; }
    showToast('שגיאה — נסה שוב');
  }
};

function _buildGoogleCalendarUrl(dateVal, timeVal, vehicle) {
  // Build a 1-hour timed event at the driver's chosen time
  var tStr  = (timeVal && timeVal.length >= 5) ? timeVal : '09:00';
  var hh    = parseInt(tStr.split(':')[0], 10);
  var mm    = tStr.split(':')[1] || '00';
  var hhEnd = hh + 1;
  if (hhEnd >= 24) { hhEnd = 23; mm = '59'; }
  var dateFlat  = dateVal.replace(/-/g, '');
  var startTime = dateFlat + 'T' + String(hh).padStart(2, '0') + mm + '00';
  var endTime   = dateFlat + 'T' + String(hhEnd).padStart(2, '0') + mm + '00';
  var vNum  = (vehicle && vehicle.num)  || '';
  var gName = (vehicle && vehicle.garage && vehicle.garage.name)    || 'מוסך';
  var gAddr = (vehicle && vehicle.garage && vehicle.garage.address) || '';
  var title   = encodeURIComponent('תור במוסך — ' + vNum);
  var details = encodeURIComponent('תור במוסך ' + gName + '\nרכב: ' + vNum + '\nשעה: ' + tStr);
  var loc     = encodeURIComponent(gAddr);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + title +
    '&dates=' + startTime + '/' + endTime + '&details=' + details + '&location=' + loc + '&sf=true&output=xml';
}

APP._garageShowReminderPicker = function(dateVal, timeVal) {
  var tVal    = timeVal || '09:00';
  var dateFmt = dateVal.split('-').reverse().join('/');
  var opts = [
    { days: 7, label: 'שבוע לפני התור' },
    { days: 3, label: '3 ימים לפני' },
    { days: 2, label: 'יומיים לפני' },
    { days: 1, label: 'יום לפני' }
  ];
  _showHelpCard(
    '<div class="help-card">' +
    '<button class="help-back-btn" onclick="APP.closeHelpMenu()">&#x25C4; חזרה</button>' +
    '<div class="help-card-title">קבע תזכורת</div>' +
    '<div class="help-card-sub">מועד התור: ' + dateFmt + ' · ' + tVal + '</div>' +
    '<hr class="help-card-divider">' +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:14px">מתי לשלוח תזכורת?</div>' +
    opts.map(function(opt) {
      return '<button onclick="APP._saveGarageReminder(\'' + dateVal + '\',' + opt.days + ',\'' + tVal + '\')" ' +
        'style="display:flex;align-items:center;gap:12px;width:100%;background:rgba(168,85,247,.10);border:1px solid rgba(168,85,247,.22);border-radius:14px;padding:14px 16px;margin-bottom:10px;cursor:pointer;transition:background .2s" ' +
        'onmouseover="this.style.background=\'rgba(168,85,247,.2)\'" onmouseout="this.style.background=\'rgba(168,85,247,.10)\'">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#f1f5f9;text-align:right">' + opt.label + '</div>' +
        '</button>';
    }).join('') +
    '<div style="font-size:11px;color:#475569;text-align:center;margin-top:4px">תזכורת תישלח בהתראת מערכת</div>' +
    '</div>'
  );
};

APP._saveGarageReminder = function(appointmentDate, daysBefore, appointmentTime) {
  try {
    var tStr     = appointmentTime || '09:00';
    var apptMs   = new Date(appointmentDate + 'T' + tStr + ':00').getTime();
    var remindMs = apptMs - (daysBefore * 86400000);
    var reminders = [];
    try { reminders = JSON.parse(localStorage.getItem('driver_garage_reminders') || '[]'); } catch(_) {}
    // Replace any existing reminder for the same appointment date
    reminders = reminders.filter(function(r) { return r.appointmentDate !== appointmentDate; });
    var _garageName = (APP._garageCtx && APP._garageCtx.garageName) ||
                      (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name) || 'המוסך';
    var _newReminder = {
      id:              'GR-' + remindMs,
      appointmentDate: appointmentDate,
      appointmentTime: tStr,
      remindAt:        remindMs,
      daysBefore:      daysBefore,
      vehicleNum:      (STATE.vehicle && STATE.vehicle.num) || '',
      garageName:      _garageName,
      shown:           false
    };
    reminders.push(_newReminder);
    localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
    _fbSaveReminder(_newReminder);

    // Post to GAS so server-side push fires on the right day
    gasPost('save_garage_reminder', {
      remindAt:        remindMs,
      appointmentDate: appointmentDate,
      appointmentTime: tStr,
      garageName:      _garageName,
      daysBefore:      daysBefore
    }, { silent: true }).catch(function(e) { console.warn('save_garage_reminder GAS:', e); });

    var _dFmt = appointmentDate.split('-').reverse().join('/');
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:32px 20px">' +
      '<div style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:20px;background:linear-gradient(135deg,#7c3aed,#8b5cf6);margin-bottom:14px;animation:notif-approved-glow 2.5s ease infinite">' +
        '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</div>' +
      '<div style="font-size:17px;font-weight:800;color:#f1f5f9;margin-bottom:6px">תזכורת נקבעה!</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:4px">' +
        daysBefore + (daysBefore === 1 ? ' יום' : ' ימים') + ' לפני התור' +
      '</div>' +
      '<div style="font-size:12px;color:#475569;margin-bottom:20px">' + _dFmt + ' בשעה ' + tStr + '</div>' +
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
      if (r.shown || now < r.remindAt) return;
      r.shown = true;
      updated  = true;

      var apptFmt = r.appointmentDate.split('-').reverse().join('/');
      var tStr    = r.appointmentTime || '09:00';
      var daysLbl = r.daysBefore === 1 ? 'מחר' : 'בעוד ' + r.daysBefore + ' ימים';
      var body    = 'התור שלך ' + daysLbl + ' · ' + apptFmt + ' ' + tStr;

      // Layer 1: OS notification via service worker (if permission granted)
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(function(reg) {
          reg.showNotification('🔧 תזכורת תור מוסך', {
            body:               body,
            icon:               './icons/icon-192.png',
            badge:              './icons/badge-blue.png',
            dir:                'rtl',
            lang:               'he',
            tag:                'garage-reminder-' + (r.id || r.remindAt),
            vibrate:            [300, 100, 300],
            requireInteraction: true
          });
        }).catch(function(e) { console.warn('showNotification:', e); });
      }

      // Layer 2: in-app notification toast (always shown when app is open)
      var payload = {
        notification: { title: '🔧 תזכורת תור מוסך', body: body },
        data: { alertType: 'plan', vehicleNum: r.vehicleNum || '' },
        ts: now
      };
      if (typeof showInAppNotification === 'function') showInAppNotification(payload);
    });

    // Prune reminders older than 3 days after appointment time
    reminders = reminders.filter(function(r) {
      var apptMs = new Date((r.appointmentDate || '2000-01-01') + 'T23:59:00').getTime();
      var keep = now < apptMs + (3 * 86400000);
      if (!keep && r.id) { try { _fbDeleteReminder(r.id); } catch(_) {} }
      return keep;
    });

    if (updated) localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
  } catch(e) { console.warn('_checkGarageReminders:', e); }
};

APP._garageAppointmentNo = function() {
  // Try to create a real 3-day reminder using any stored appointment data
  var apptData = null;
  try { apptData = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null'); } catch(_) {}
  var appointmentDate = (apptData && apptData.appointmentDate) || '';
  var appointmentTime = (apptData && apptData.appointmentTime) || '09:00';

  if (appointmentDate) {
    // Create actual 3-day-before reminder
    APP._saveGarageReminder(appointmentDate, 3, appointmentTime);
  } else {
    // No appointment date yet — show informational card only
    _showHelpCard(
      '<div class="help-card" style="text-align:center;padding:28px 20px">' +
      '<div style="font-size:40px;margin-bottom:10px">⏰</div>' +
      '<div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-bottom:8px">בסדר!</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:20px">כשתקבע תאריך תור, תוכל להגדיר תזכורת.</div>' +
      '<button class="help-action-btn secondary" onclick="APP.closeHelpMenu()">סגור</button>' +
      '</div>'
    );
  }
};


/* ══ Web Push (direct PushManager.subscribe — no Firebase SDK) ══ */
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] not supported');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { console.log('[Push] permission denied'); return; }

    const swReg = await navigator.serviceWorker.ready;
    console.log('[Push] SW ready');

    const vapidPublic = window.__VAPID_PUBLIC || 'BFLZcYjxU_yOMukgr3oSnP8ayrFzw16i0s8-z1fbEy1I_E-qP0_B8k3ccvjpE8RmyGYRzSu-ybm2k94pyJfMLyg';
    const applicationServerKey = urlBase64ToUint8Array(vapidPublic);

    // Check existing subscription
    let subscription = await swReg.pushManager.getSubscription();

    if (subscription) {
      // VERIFY existing subscription's applicationServerKey matches current VAPID
      const existingKey = subscription.options && subscription.options.applicationServerKey;
      let needsResubscribe = false;

      if (!existingKey) {
        needsResubscribe = true;
        console.log('[Push] Existing sub has no applicationServerKey, re-subscribing');
      } else {
        const existingBytes = new Uint8Array(existingKey);
        if (existingBytes.length !== applicationServerKey.length) {
          needsResubscribe = true;
        } else {
          for (let i = 0; i < existingBytes.length; i++) {
            if (existingBytes[i] !== applicationServerKey[i]) {
              needsResubscribe = true;
              break;
            }
          }
        }
        if (needsResubscribe) {
          console.log('[Push] VAPID changed, unsubscribing old...');
        }
      }

      if (needsResubscribe) {
        try { await subscription.unsubscribe(); } catch(e) { console.warn('[Push] unsubscribe failed:', e.message); }
        subscription = null;
      } else {
        console.log('[Push] Existing subscription matches current VAPID — will re-register with GAS to ensure vehicleId is current');
      }
    }

    if (!subscription) {
      console.log('[Push] Creating new subscription...');
      const subPromise = swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey });
      const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('subscribe timeout 20s')), 20000));
      subscription = await Promise.race([subPromise, timeoutP]);
    }

    if (!subscription) { console.warn('[Push] no subscription'); return; }

    const subJson = subscription.toJSON();
    console.log('[Push] Subscribed! endpoint:', subJson.endpoint.substring(0, 60) + '...');
    console.log('[Push] keys:', {
      p256dh: (subJson.keys && subJson.keys.p256dh ? subJson.keys.p256dh.substring(0,20) + '...' : 'n/a'),
      auth:   (subJson.keys && subJson.keys.auth   ? subJson.keys.auth.substring(0,8)   + '...' : 'n/a')
    });

    const vid = (typeof STATE !== 'undefined' && STATE.vehicle && STATE.vehicle.id) ? STATE.vehicle.id : '';
    try {
      const regResp = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action:    'driver_register_push',
          idToken:   STATE.idToken || '',
          endpoint:  subJson.endpoint,
          p256dh:    subJson.keys && subJson.keys.p256dh,
          auth:      subJson.keys && subJson.keys.auth,
          vehicleId: vid
        })
      });
      const regData = await regResp.json();
      if (regData.ok) console.log('[Push] Registered with GAS ✓ vid:', vid);
      else console.warn('[Push] GAS register error:', regData.error);
    } catch(e) {
      console.warn('[Push] gas register failed:', e.message);
    }
  } catch(e) {
    console.error('[Push] error:', e.message, e);
  }
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Expose for manual console testing
if (typeof window !== 'undefined') {
  window.registerPush = registerPush;
}

/* ══ Utils ══ */
function formatPlate(num) {
  if (!num) return '—';
  var d = String(num).replace(/\D/g, '');
  if (d.length === 8) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
  if (d.length === 7) return d.slice(0,2) + '-' + d.slice(2,5) + '-' + d.slice(5);
  return num;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return dateStr; }
}

function daysLeftWarn(dateStr, threshold) {
  if (!dateStr) return false;
  return Math.round((new Date(dateStr) - new Date()) / 86400000) <= threshold;
}

function showLoader()  { document.getElementById('splash-screen').classList.remove('hidden'); }
function hideLoader()  { document.getElementById('splash-screen').classList.add('hidden'); }

/* ══ Doc Viewer (PDF.js) ══ */
async function viewDoc(link, title) {
  if (!link) { showToast('לא קיים קישור — פנה למשרד'); return; }
  const overlay  = document.getElementById('doc-viewer');
  const loading  = document.getElementById('doc-viewer-loading');
  const pages    = document.getElementById('doc-viewer-pages');
  const errDiv   = document.getElementById('doc-viewer-error');
  const errMsg   = document.getElementById('doc-viewer-error-msg');
  const ttl      = document.getElementById('doc-viewer-title');

  overlay.style.display  = 'flex';
  loading.style.display  = 'flex';
  pages.style.display    = 'none';
  errDiv.style.display   = 'none';
  pages.innerHTML        = '';
  ttl.textContent        = title || 'מסמך';

  try {
    const result = await gasPost('view_doc_b64', { fileId: link });

    /* iframe עם Google Drive preview — רינדור native מושלם לעברית */
    const iframe = document.createElement('iframe');
    iframe.src = result.previewUrl;
    iframe.style.cssText = 'width:100%;flex:1;border:none;background:#525659';
    iframe.allow = 'autoplay';

    loading.style.display = 'none';
    pages.style.display   = 'flex';
    pages.style.padding   = '0';
    pages.appendChild(iframe);
  } catch(e) {
    loading.style.display = 'none';
    errDiv.style.display  = 'flex';
    errMsg.textContent    = e.message || 'שגיאה בטעינת המסמך';
  }
}

function closeDocViewer() {
  document.getElementById('doc-viewer').style.display = 'none';
  document.getElementById('doc-viewer-pages').innerHTML = '';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.classList.remove('show'); }, 2800);
}

function showLoginError(msg) {
  const el = document.getElementById('login-err');
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ══ In-App Notification Toast ══ */
var SEVERITY_MAP = {
  overdue:         'critical',
  test_urgent:     'critical',
  urgent:          'urgent',
  test_due:        'urgent',
  fuel_high:       'urgent',
  plan:            'plan',
  km_update:       'plan',
  fuel_km_high:    'info',
  garage_rejected: 'info',
  garage_approved: 'approved'
};

var TOAST_DURATION = {
  critical: 8000,
  urgent:   6000,
  plan:     4000,
  info:     3000,
  approved: 5000
};

var SEVERITY_ICONS = {
  critical: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  urgent:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#f59e0b"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  plan:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#3b82f6"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  info:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#8b5cf6"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>',
  approved: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#22c55e"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>'
};

var _activeToast = null;

function showInAppNotification(payload) {
  var notif     = payload.notification || {};
  var meta      = payload.data || {};
  var alertType = meta.alertType || 'plan';
  var severity  = SEVERITY_MAP[alertType] || 'plan';
  var duration  = TOAST_DURATION[severity] || 4000;
  var icon      = SEVERITY_ICONS[severity] || SEVERITY_ICONS.plan;

  // Save to history
  saveNotifToHistory(payload);

  // Remove existing toast
  if (_activeToast && _activeToast.parentNode) {
    _activeToast.parentNode.removeChild(_activeToast);
  }

  var el = document.createElement('div');
  el.className = 'notif-toast notif-card notif-' + severity;
  el.setAttribute('role', 'alert');
  el.innerHTML =
    '<div class="notif-icon">' + icon + '</div>' +
    '<div class="notif-content">' +
      '<div class="notif-title">' + (notif.title || 'עלה — התראה') + '</div>' +
      '<div class="notif-body">' + (notif.body || '') + '</div>' +
    '</div>' +
    '<button class="notif-action">פרטים ›</button>' +
    '<button class="notif-dismiss" aria-label="סגור">×</button>';

  document.body.appendChild(el);
  _activeToast = el;

  // Sound
  _playNotifSound(alertType);

  // "פרטים" button
  el.querySelector('.notif-action').addEventListener('click', function(e) {
    e.stopPropagation();
    dismissToast(el);
    navigateForAlertType(alertType, meta);
  });

  // Dismiss button
  el.querySelector('.notif-dismiss').addEventListener('click', function(e) {
    e.stopPropagation();
    dismissToast(el);
  });

  // Tap anywhere on toast
  el.addEventListener('click', function() {
    dismissToast(el);
    navigateForAlertType(alertType, meta);
  });

  // Auto-dismiss
  var _dismissTimer = setTimeout(function() { dismissToast(el); }, duration);
  el._dismissTimer = _dismissTimer;
}

function dismissToast(el) {
  if (!el || !el.parentNode) return;
  clearTimeout(el._dismissTimer);
  el.classList.add('leaving');
  setTimeout(function() {
    if (el.parentNode) el.parentNode.removeChild(el);
    if (_activeToast === el) _activeToast = null;
  }, 320);
}

/* SW message handler — receives push-foreground from service worker */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg) return;
    if (msg.type === 'push-foreground' && msg.payload) {
      showInAppNotification(msg.payload);
    } else if (msg.type === 'push-received' && msg.payload) {
      saveNotifToHistory(msg.payload);
      navigateForAlertType(
        (msg.payload.data && msg.payload.data.alertType) || 'plan',
        msg.payload.data || {}
      );
    } else if (msg.type === 'notification-click' && msg.data) {
      navigateForAlertType(msg.data.alertType || 'plan', msg.data);
    }
  });
}

/* ══ Greeting ══ */
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'בוקר טוב,';
  if (h >= 12 && h < 17) return 'צהריים טובים,';
  if (h >= 17 && h < 21) return 'ערב טוב,';
  return 'לילה טוב,';
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

function showGreeting(holderName) {
  hideLoader();

  document.getElementById('gr-time').textContent = getGreeting();
  document.getElementById('gr-name').textContent = holderName || '';
  const el = document.getElementById('greeting');
  el.classList.remove('hidden');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('gr-show'); });
  });
}

function hideGreeting() {
  const el = document.getElementById('greeting');
  el.style.transition = 'opacity .4s ease';
  el.style.opacity = '0';
  setTimeout(function() {
    el.classList.add('hidden');
    el.classList.remove('gr-show');
    el.style.opacity = '';
    el.style.transition = '';
  }, 420);
}

/* ══ Boot ══ */
document.addEventListener('DOMContentLoaded', async function() {
  /* פתח נעילת orientation — עוקף manifest ישן ומאפשר סיבוב */
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      /* בדוק עדכון בכל טעינה */
      reg.update();
      reg.addEventListener('updatefound', function() {
        const sw = reg.installing;
        if (!navigator.serviceWorker.controller) return; /* התקנה ראשונה — לא reload */
        sw.addEventListener('statechange', function() {
          if (sw.state === 'activated') window.location.reload();
        });
      });
    }).catch(function(e) {
      console.warn('SW:', e.message);
    });
  }

  // Try cached session
  const session = loadSession();
  if (session && session.token !== 'demo_token') {
    STATE.idToken = session.token;
    STATE.vehicle = session.vehicleData;
    STATE.user    = session.userInfo;

    // If token already expired — clear silently and fall through to login (no scary overlay)
    if (_isTokenExpired(STATE.idToken)) {
      localStorage.removeItem(SESSION_KEY);
      STATE.idToken = null;
      STATE.vehicle = null;
      STATE.user    = null;
    } else {
      try {
        _fbSignIn(STATE.idToken).catch(function() {}); // Firebase Auth מ-session שמור — non-blocking
        hideLoader();
        showGreeting((STATE.vehicle && STATE.vehicle.holder) || (STATE.user && STATE.user.name));
        await loadFullData();
        hideGreeting();
        startApp();
        return;
      } catch(e) {
        hideGreeting();
        localStorage.removeItem(SESSION_KEY);
      }
    }
  } else if (session && session.token === 'demo_token') {
    localStorage.removeItem(SESSION_KEY);
  }

  // splash-screen stays visible — login button appears via CSS at ~4s

  if (!GOOGLE_CLIENT_ID) {
    // Demo mode — login button goes straight in
    document.getElementById('login-btn').addEventListener('click', demoLogin);
    return;
  }

  // Load Google Identity Services
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.onload = function() {
    initGoogleAuth();
    document.getElementById('login-btn').addEventListener('click', function() {
      google.accounts.id.prompt();
    });
  };
  document.head.appendChild(script);
});

/* ══ רענון נתונים בחזרה לאפליקציה ══ */
var _lastRefresh = 0;
var _REFRESH_MIN = 5 * 60 * 1000; // 5 דקות מינימום בין רענונים

document.addEventListener('visibilitychange', async function() {
  if (document.visibilityState !== 'visible') return;
  if (!STATE.idToken || !STATE.vehicle) return;
  if (_isTokenExpired(STATE.idToken)) return; // אל תקרא _sessionExpired בפורגראונד — יציג re-login בהפתעה
  if (Date.now() - _lastRefresh < _REFRESH_MIN) return;
  try {
    await loadFullData();
    renderAll();
    _lastRefresh = Date.now();
  } catch(e) {
    console.warn('visibilitychange refresh error:', e.message);
  }
});
