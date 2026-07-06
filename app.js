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

var BIO_SESSION_KEY = 'aleh_bio_active_v1';
var BIO_SESSION_TTL = 30 * 60 * 1000; // 30 minutes

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
  // אסור לנווט לתוך האפליקציה ללא session — מונע הצגת מסך פייק
  if (!STATE.idToken || !STATE.vehicle) return;
  switch (alertType) {
    case 'km_update':
      APP.nav('vehicle');
      setTimeout(function() { if (typeof APP.openKmModal === 'function') APP.openKmModal(); }, 350);
      break;

    case 'plan':
    case 'overdue':
    case 'urgent':
    case 'maintenance_overdue':
    case 'maintenance_urgent':
      /* Opens garage request interface so driver can submit a new service request. */
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
      setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
      break;

    case 'maintenance_plan':
      /* Set aside — routing TBD after product discussion. */
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
      setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
      break;

    case 'test_due':
    case 'test_urgent':
      APP.openTestHub();
      break;

    case 'garage_approved':
      /* helpGarage() auto-detects approved state in localStorage and shows
         the approved garage details / appointment screen internally. */
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
      setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
      break;

    case 'garage_rejected':
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
      setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
      break;

    case 'garage_appointment_cancelled':
      if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
      setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
      break;

    case 'garage_appointment_set':
      /* Guard: if the appointment was cancelled, activeGarageAppointment is gone.
         Show a cancelled popup instead of opening a stale calendar URL. */
      try {
        var _apptData = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null');
        if (!_apptData) {
          _nrdShowCancelledPopup(meta, {
            title:    'התור בוטל',
            body:     'התור שנקבע עבור בקשה זו בוטל.\nכדי לתאם תור חדש יש לפתוח בקשת מוסך חדשה.',
            btnLabel: 'פתח בקשה חדשה',
            onNewRequest: function() {
              if (typeof APP !== 'undefined' && typeof APP.openHelpMenu === 'function') {
                APP.openHelpMenu();
                setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
              }
            }
          });
          return;
        }
      } catch(_e) {}
      try {
        var url = _buildGoogleCalendarUrl(meta.appointmentDate, meta.appointmentTime || '09:00', (typeof STATE !== 'undefined' ? STATE.vehicle : null));
        if (url) window.open(url, '_blank');
      } catch(_) {}
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

var _gateRef = null; // module-level — מאפשר ניתוק listener ישן לפני חיבור חדש

/** מפעיל את כל ה-listeners — נקרא פעם אחת מ-_fbSignIn */
function _initFbSync() {
  _initFbNotifSync();
  _initFbGarageSync();
  _initFbReminderSync();
  _initFbGateSync();
  _initFbVehicleSync();
  // Re-attach garageSync status listener with auth context (vehicle must already be loaded)
  if (STATE.vehicle) _initFbGarageStatusSync();
}

/* ── Listener: Gate access config ── */
function _initFbGateSync() {
  // ניתוק listener קודם — מניעת כפילות כשהפונקציה נקראת שוב אחרי loadFullData
  if (_gateRef) { try { _gateRef.off('value'); } catch(_grE) {} _gateRef = null; }
  var ref = _fbRef('gateAccess');
  if (!ref) return;
  _gateRef = ref;
  ref.on('value', function(snap) {
    try {
      // STATE.vehicle טרם נטען (onAuthStateChanged מוקדם מדי) — לא מוחקים ולא מסתירים.
      // _initFbVehicleSync יפעיל אותנו שוב לאחר שloadFullData יסיים.
      if (!STATE.vehicle || !STATE.vehicle.id) return;
      var gateAccess = snap.val();
      if (gateAccess && gateAccess.enabled && String((STATE.vehicle||{}).gateAccessEnabled).toUpperCase() === 'TRUE') {
        APP._gateConfig = gateAccess;
        _gateInit();
      } else {
        // Self-provision: fetch config from GAS if vehicle has gate enabled
        var vehId = STATE.vehicle && STATE.vehicle.id;
        if (vehId && String((STATE.vehicle||{}).gateAccessEnabled).toUpperCase() === 'TRUE') {
          gasPost('get_gate_config', { vehicleId: vehId }, { silent: true }).then(function(r) {
            if (r && r.ok && r.config) {
              APP._gateConfig = r.config;
              // Write to Firebase so future loads are instant
              if (ref) ref.set(r.config);
              _gateInit();
            } else {
              // Vehicle IS gate-enabled but no config available yet — show disabled, don't hide.
              _gateSetDisabled('ממתין\nלהרשאה');
            }
          }).catch(function() {
            _gateSetDisabled('ממתין\nלהרשאה');
          });
        } else {
          // Vehicle is assigned but gate access is NOT enabled (revoked / never granted).
          // Show the card DISABLED (grayed, not tappable) — it must NEVER disappear.
          _gateSetDisabled('ביטלו הרשאת\nכניסה לחניון');
          // Remove the stale gateAccess node so an active config can't be acted on,
          // but keep the card visible in its disabled state.
          if (gateAccess && ref) { try { ref.remove(); } catch(_gaRmE) {} }
          // GPS watch is already cleared inside _gateSetDisabled().
        }
      }
    } catch(e) { console.warn('[fbSync] gate onValue:', e.message); }
  }, function(err) { console.warn('[fbSync] gate listener:', err.message); });
}

/* ── Listener: Vehicle Assignment ── */
var _vehAssignRef = null; // module-level — allows detaching a stale listener before re-attaching
function _initFbVehicleSync() {
  var email = STATE.user && STATE.user.email;
  // Detach any previous listener first — this function is re-called after login
  // (see startApp) once STATE.user.email is finally populated. Without the detach
  // we'd stack duplicate listeners; without the re-call the listener never attaches
  // at all, because onAuthStateChanged fires _initFbSync before STATE.user is set.
  if (_vehAssignRef) { try { _vehAssignRef.off('value'); } catch(_vaE) {} _vehAssignRef = null; }
  if (!email || !_fbDb) return;
  var emailKey = email.replace(/[.#$[\]]/g, '_').toLowerCase();
  _vehAssignRef = _fbDb.ref('vehicleAssignment/' + emailKey);
  _vehAssignRef.on('value', function(snap) {
    try {
      var va = snap.val();
      if (!va || !va.vehicleId) return;
      // If vehicle changed, isActive changed, or gateAccessEnabled changed, refresh state
      var curId = STATE.vehicle && STATE.vehicle.id;
      var curGate = String((STATE.vehicle||{}).gateAccessEnabled||'').toUpperCase();
      var newGate = String(va.gateAccessEnabled||'').toUpperCase();
      // Instant visual feedback for gate access flips — don't wait for loadFullData.
      if (curGate !== newGate) {
        if (newGate === 'TRUE') { _gateSetEnabled(); }
        else { _gateSetDisabled('ביטלו הרשאת\nכניסה לחניון'); }
      }
      if (va.vehicleId !== curId ||
          (STATE.vehicle && String(STATE.vehicle.isActive||'').toLowerCase() !== String(va.isActive||'').toLowerCase()) ||
          curGate !== newGate) {
        // Re-fetch full data from GAS, then re-evaluate gate card visibility
        // (loadFullData refreshes STATE.vehicle but does NOT re-run gate init).
        if (typeof loadFullData === 'function') {
          var _lfd = loadFullData();
          if (_lfd && typeof _lfd.then === 'function') {
            _lfd.then(function() { if (typeof _initFbGateSync === 'function') _initFbGateSync(); });
          } else if (typeof _initFbGateSync === 'function') {
            _initFbGateSync();
          }
        }
      }
    } catch(e) { console.warn('[fbSync] vehicleAssignment:', e.message); }
  }, function(err) { console.warn('[fbSync] vehicleAssignment listener:', err.message); });
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
        .sort(function(a, b) { return b.ts - a.ts; });
      // Collapse cross-path duplicates (push ts vs GAS ts) before persisting
      /* MERGE Firebase items with any locally-saved items (from FCM delivery)
         before writing. Firebase items come first → win on dedup conflict.
         Prevents FCM-saved item from creating a second card when Firebase
         listener fires later with a differently-formatted GAS version. */
      var _localRaw = [];
      try { _localRaw = JSON.parse(localStorage.getItem(_NOTIF_HISTORY_KEY) || '[]'); } catch(_e) {}
      items = dedupNotifList(items.concat(_localRaw)).slice(0, 30);

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
            /* Guard: reject Firebase snapshot if it is older than what localStorage
               already has. Prevents a stale cached snapshot from overwriting a newer
               approval that just arrived via FCM/saveNotifToHistory. */
            try {
              var _prev = JSON.parse(prevRaw || '{}');
              var _prevAt = _prev.approvedAt || 0;
              var _newAt  = (data.approvedAt) || 0;
              if (_prevAt && _newAt && _newAt < _prevAt) {
                /* Firebase snapshot is older — skip overwrite but still sync Firebase
                   to match localStorage so future listeners see the newer value. */
                _fbSetApprovedGarage(_prev);
                return;
              }
            } catch(_e) {}
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
          // Normalize time — guard against poisoned "Sat Dec 30 1899..." strings from GAS
          if (data.appointmentTime) {
            var _tmMatch = String(data.appointmentTime).match(/(\d{1,2}):(\d{2})/);
            data.appointmentTime = _tmMatch
              ? (('0'+_tmMatch[1]).slice(-2) + ':' + _tmMatch[2])
              : '09:00';
          }
          // Normalize date — strip time component if present
          if (data.appointmentDate) {
            data.appointmentDate = String(data.appointmentDate).split('T')[0].split(' ')[0];
          }
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

/* Canonical dedup key for a notification.
   Same logical notification can arrive via push (ts=Date.now) and GAS pull
   (ts=server canonical) with DIFFERENT ts values. When eventId/requestNumber
   are absent (plan alerts), fall back to a content fingerprint so the two
   copies collapse despite differing ts. */
/* Map every garage status/alertType to ONE canonical event family so FCM and
   GAS copies of the same logical event collapse even if their alertType strings
   differ slightly. Mirrors _normGarageEventKey's table. */
function _canonGarageType(alertType) {
  var t = String(alertType || '').toLowerCase();
  var map = {
    'cancelled':                    'garage_appointment_cancelled',
    'garage_appointment_cancelled': 'garage_appointment_cancelled',
    'appointment_set':              'garage_appointment_set',
    'garage_appointment_set':       'garage_appointment_set',
    'approved':                     'garage_approved',
    'garage_approved':              'garage_approved',
    'rejected':                     'garage_rejected',
    'garage_rejected':              'garage_rejected'
  };
  return map[t] || t;
}

function _notifDedupKey(n) {
  var _aType = n.alertType || '';
  var _canon = _canonGarageType(_aType);
  var _isGarageStatus = (_canon === 'garage_approved' || _canon === 'garage_rejected' ||
                         _canon === 'garage_appointment_set' || _canon === 'garage_appointment_cancelled');
  /* For garage STATUS notifications, FCM and GAS share the same logical request
     but may carry different/empty eventIds. Prefer requestNumber (the stable
     garage request #) collapsed onto the CANONICAL type so the two copies merge.
     This is what prevents the recurring duplicate garage_rejected/approved cards. */
  if (_isGarageStatus) {
    if (n.requestNumber) return 'greq:' + _canon + '|' + String(n.requestNumber);
    if (n.eventId)       return 'geid:' + _canon + '|' + String(n.eventId);
    /* appointment types without a request#: vehicleId + appointmentDate is stable */
    if ((_canon === 'garage_appointment_set' || _canon === 'garage_appointment_cancelled') &&
        n.vehicleId && n.appointmentDate) {
      return 'appt:' + _canon + '|' + String(n.vehicleId) + '|' + String(n.appointmentDate);
    }
    /* last resort for garage status: collapse on canonical type + vehicleId
       (a vehicle won't legitimately receive two distinct same-status garage
       cards in the same history window without a request#/eventId). */
    return 'gveh:' + _canon + '|' + String(n.vehicleId || '');
  }
  if (n.eventId) return 'eid:' + n.eventId + '|' + (n.alertType || '');
  if (n.requestNumber) return 'req:' + n.requestNumber + '|' + (n.alertType || '');
  return 'sig:' + _aType + '|' + (n.title || '') + '|' + (n.body || '') + '|' + (n.vehicleId || '');
}

/* Deduplicate a notification list using the canonical key plus a ts guard.
   Keeps first occurrence (list is unshifted newest-first / sorted desc by ts). */
function dedupNotifList(raw) {
  var seen = {};
  return raw.filter(function(n) {
    if (!n) return false;
    var k = _notifDedupKey(n);
    if (seen[k]) return false;
    seen[k] = true;
    var tsKey = 'ts:' + n.ts;
    if (seen[tsKey]) return false;
    seen[tsKey] = true;
    return true;
  });
}

function getNotifHistory() {
  try {
    var raw = JSON.parse(localStorage.getItem(_NOTIF_HISTORY_KEY) || '[]');
    // Deduplicate via shared helper (eventId/requestNumber/content-signature + ts guard)
    var cleaned = dedupNotifList(raw);
    // Write back cleaned list if duplicates were found
    if (cleaned.length !== raw.length) {
      try { localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(cleaned)); } catch(_) {}
    }
    return cleaned;
  } catch(e) { return []; }
}

/* ──────────────────────────────────────────────────────────────
   Universal persistent dedup gate. Returns true if a notification
   matching (alertType, eventId, title, body) is ALREADY in history.
   Used as the first line of defense before any showInAppNotification /
   saveNotifToHistory write, regardless of channel (FCM foreground, FCM
   pending buffer, GAS pull, Firebase garageSync listener, cold-start).
   Matches via the SAME canonical key as dedupNotifList so the gate and
   the list-cleaner can never disagree, plus a content-fingerprint fallback.
   ────────────────────────────────────────────────────────────── */
function _notifAlreadyInHistory(alertType, eventId, title, body, extra) {
  try {
    var hist = getNotifHistory();
    if (!hist || !hist.length) return false;
    var probe = {
      alertType:     alertType || '',
      eventId:       eventId   || '',
      requestNumber: (extra && extra.requestNumber) || '',
      vehicleId:     (extra && extra.vehicleId) || '',
      appointmentDate: (extra && extra.appointmentDate) || '',
      title:         title || '',
      body:          body  || ''
    };
    var probeKey = _notifDedupKey(probe);
    return hist.some(function(n) {
      if (!n) return false;
      // Canonical-key match (collapses cross-channel eventId/requestNumber/format diffs)
      if (_notifDedupKey(n) === probeKey) return true;
      // Content fingerprint fallback: same type + identical title + body
      if ((n.alertType || '') === probe.alertType &&
          (n.title || '') === probe.title &&
          (n.body  || '') === probe.body) return true;
      // Explicit eventId match when both present
      if (probe.eventId && n.eventId && String(n.eventId) === String(probe.eventId) &&
          (n.alertType || '') === probe.alertType) return true;
      return false;
    });
  } catch (_e) { return false; }
}

/* ──────────────────────────────────────────────────────────────
   Cross-channel notif dedup: FCM (SW→push-foreground) and Firebase
   garageSync listener can fire for the same event. First channel wins,
   second is silenced for TTL_MS. Keyed by alertType+eventId normalized
   to a logical event (see _normGarageEventKey).
   ────────────────────────────────────────────────────────────── */
var _GARAGE_DEDUP_TTL_MS = 12000;
var _garageDedupMap = {};
function _normGarageEventKey(typeOrStatus, eventId) {
  if (!eventId) return '';
  var t = String(typeOrStatus || '').toLowerCase();
  // map FB statuses ↔ FCM alertTypes to a single canonical key
  var map = {
    'cancelled':                  'cancelled',
    'garage_appointment_cancelled':'cancelled',
    'appointment_set':            'appointment_set',
    'garage_appointment_set':     'appointment_set',
    'approved':                   'approved',
    'garage_approved':            'approved',
    'rejected':                   'rejected',
    'garage_rejected':            'rejected'
  };
  var canon = map[t] || t;
  return canon + '|' + String(eventId);
}
function _garageDedupSeen(key) {
  if (!key) return false;
  var now = Date.now();
  // GC expired
  var keys = Object.keys(_garageDedupMap);
  for (var i = 0; i < keys.length; i++) {
    if (now - _garageDedupMap[keys[i]] > _GARAGE_DEDUP_TTL_MS) delete _garageDedupMap[keys[i]];
  }
  if (_garageDedupMap[key] && (now - _garageDedupMap[key]) <= _GARAGE_DEDUP_TTL_MS) return true;
  _garageDedupMap[key] = now;
  return false;
}

/* Generic cross-channel dedup for ALL notification types that carry an
   eventId. FCM (SW push) and the Firebase listener can both fire for the
   same logical event; the first to arrive wins for TTL_MS. Keyed by
   eventId+alertType so distinct events on the same vehicle are unaffected. */
var _NOTIF_DEDUP_TTL_MS = 30000;
var _notifDedupTtlMap = {};
function _notifDedupTtlSeen(eventId, alertType) {
  if (!eventId) return false;
  var key = 'eid:' + String(eventId) + ':' + String(alertType || '');
  var now = Date.now();
  var keys = Object.keys(_notifDedupTtlMap);
  for (var i = 0; i < keys.length; i++) {
    if (now - _notifDedupTtlMap[keys[i]] > _NOTIF_DEDUP_TTL_MS) delete _notifDedupTtlMap[keys[i]];
  }
  if (_notifDedupTtlMap[key] && (now - _notifDedupTtlMap[key]) <= _NOTIF_DEDUP_TTL_MS) return true;
  _notifDedupTtlMap[key] = now;
  return false;
}

function saveNotifToHistory(payload) {
  try {
    var notif = payload.notification || {};
    var meta  = payload.data || {};
    // Prefer GAS-canonical ts embedded in push data — ensures ts-dedup works when
    // loadNotifHistoryFromGAS later pulls the same notification (same ts from GAS).
    // Fallback: relay ts set by SW at delivery time, then Date.now().
    var ts    = (meta.ts && typeof meta.ts === 'number' ? meta.ts : 0) || payload.ts || Date.now();

    // Respect "clear all" — drop notifications older than last clear
    var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
    if (ts <= clearedAt) return;

    var alertType = meta.alertType || '';
    // Unified cross-channel dedup: every notification with an eventId is
    // deduped by eventId+alertType for 30s, regardless of type. Prevents the
    // FCM-vs-Firebase race that produced duplicate cards/toasts.
    if (meta.eventId && _notifDedupTtlSeen(meta.eventId, alertType)) return;

    // Auto-clear garage pending state when approval/rejection arrives
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
    // מנהל קבע תור ישירות מהיומן — עדכן activeGarageAppointment ונקה approved/pending
    if (alertType === 'garage_appointment_set') {
      try {
        localStorage.removeItem('pendingGarageRequest');
        localStorage.removeItem('approvedGarageRequest');
        if (typeof _fbClearPendingGarage  === 'function') _fbClearPendingGarage();
        if (typeof _fbClearApprovedGarage === 'function') _fbClearApprovedGarage();
        var _apptData = {
          eventId:         meta.eventId         || '',
          requestNumber:   meta.requestNumber   || '',
          appointmentDate: meta.appointmentDate || '',
          appointmentTime: meta.appointmentTime || '09:00',
          managerNote:     meta.managerNote     || '',
          garageName:    (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
          garageAddress: (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
          garagePhone:   (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || '',
          updatedAt:     Date.now()
        };
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_apptData));
        if (typeof _fbSetActiveAppointment === 'function') _fbSetActiveAppointment(_apptData);
        if (typeof renderGarageApptWidget  === 'function') renderGarageApptWidget();
      } catch(_e) {}
    }

    // BUG-03: מנהל ביטל תור — נקה widget וstate
    if (alertType === 'garage_appointment_cancelled') {
      try {
        localStorage.removeItem('activeGarageAppointment');
        if (typeof _fbClearActiveAppointment === 'function') _fbClearActiveAppointment();
        if (typeof renderGarageApptWidget   === 'function') renderGarageApptWidget();
        var _helpView = document.getElementById('help-garage-view');
        if (_helpView) APP.helpGarage();
      } catch(_e2) {}
    }

    var list = getNotifHistory();
    // Dedup by ts
    if (list.some(function(n) { return n.ts === ts; })) return;
    // Dedup by eventId — prevents duplicate when same push arrives via two code paths
    if (meta.eventId && list.some(function(n) { return n.eventId === meta.eventId && n.alertType === alertType; })) return;
    // Dedup by content fingerprint — catches same logical notification arriving via
    // push path (ts=Date.now()) AND GAS pull path (ts=GAS canonical ts) with no eventId
    var _incomingKey = _notifDedupKey({
      eventId: meta.eventId || '', requestNumber: meta.requestNumber || '',
      alertType: alertType, title: notif.title || '', body: notif.body || '',
      vehicleId: meta.vehicleId || ''
    });
    if (list.some(function(n) { return _notifDedupKey(n) === _incomingKey; })) return;
    // Universal persistent gate — final cross-channel guard. Catches the recurring
    // garage_* duplicate where FCM and GAS copies differ by eventId/format. Runs
    // AFTER the STATE side-effects above so STATE stays synced even when the card
    // itself is a duplicate that must not be written again.
    if (_notifAlreadyInHistory(alertType, meta.eventId || '', notif.title || '', notif.body || '', {
      requestNumber: meta.requestNumber || '', vehicleId: meta.vehicleId || '',
      appointmentDate: meta.appointmentDate || ''
    })) return;
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
      ts:                  ts,
      appointmentDate:     meta.appointmentDate     || '',
      appointmentTime:     meta.appointmentTime     || '',
      fuelConsumption:     meta.fuelConsumption  != null ? meta.fuelConsumption  : '',
      costPerKm:           meta.costPerKm        != null ? meta.costPerKm        : '',
      fleetAverage:        meta.fleetAverage     != null ? meta.fleetAverage     : '',
      threshold:           meta.threshold        != null ? meta.threshold        : '',
      garageInfo:          (function(g){ return !g ? '' : (typeof g === 'string' ? g : (g.name || g.garageName || '')); })(meta.garageInfo),
      testDate:            meta.testDate            || '',
      daysLeft:            meta.daysLeft         != null ? meta.daysLeft         : '',
      kmLeft:              meta.kmLeft           != null ? meta.kmLeft           : '',
      estKm:               meta.estKm            != null ? meta.estKm            : '',
      nextKm:              meta.nextKm           != null ? meta.nextKm           : '',
      daysSinceUpdate:     meta.daysSinceUpdate  != null ? meta.daysSinceUpdate  : ''
    };
    list.unshift(newItem);
    if (list.length > 30) list = list.slice(0, 30);
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
    incrementUnreadBadge();
    if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory();
    /* _fbSaveNotif removed: GAS is the sole Firebase authority for notifications.
       Client-side write created a second Firebase entry (notifications/T_client)
       alongside GAS's entry (notifications/T_GAS), causing duplicate cards when
       title/body differed between GAS storage format and FCM delivery format. */
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
    var unread = list.filter(function(n) { return !n.read; }).length;
    localStorage.setItem('driver_notif_unread', String(unread));
    _applyBadgeCount(unread);
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
    var unread = getNotifHistory().filter(function(n) { return !n.read; }).length;
    localStorage.setItem('driver_notif_unread', String(unread));
    _applyBadgeCount(unread);
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
  firebaseUid:   null,   // מאוכלס אחרי _fbSignIn — משמש כ-key ב-/driverData/{uid}/
  _pickerVehicles: [],   // multi-vehicle list from auth
  _pickerCurrent: 0      // currently selected index in picker
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

function _showVehicleInactiveOverlay() {
  var existing = document.getElementById('vehicle-inactive-overlay');
  if (existing) return;
  var el = document.createElement('div');
  el.id = 'vehicle-inactive-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,10,.96);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;font-family:\'Noto Sans Hebrew\',sans-serif;direction:rtl;';
  el.innerHTML = '<div style="font-size:56px;margin-bottom:20px;">🔒</div>' +
    '<div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:12px;">הרכב אינו פעיל</div>' +
    '<div style="font-size:14px;color:#888;line-height:1.7;max-width:280px;margin-bottom:32px;">הרכב שלך הוגדר כלא פעיל במערכת.<br>לפרטים נוספים פנה למנהל הצי.</div>' +
    '<button onclick="location.reload()" style="background:#1c1c1e;color:#fff;border:1px solid #333;border-radius:14px;padding:14px 28px;font-size:15px;font-weight:700;cursor:pointer;font-family:\'Noto Sans Hebrew\',sans-serif;">רענן</button>';
  document.body.appendChild(el);
}

function _sessionExpired() {
  // Firebase signOut — מנתק listener + מנקה session
  try { if (_fbAuth) _fbAuth.signOut(); } catch(_e) {}
  STATE.firebaseUid = null;
  localStorage.removeItem(SESSION_KEY);
  STATE.idToken = null;
  STATE.vehicle = null;
  STATE._washLogLoaded = false; STATE.washLog = [];
  STATE.user = null;
  var _hfab2 = document.getElementById('help-fab'); if (_hfab2) _hfab2.style.display = 'none';

  // Prevent One Tap from auto-signing in the same user on next prompt.
  // Without this, clicking "login" after explicit logout logs in silently.
  try { window.google && google.accounts && google.accounts.id && google.accounts.id.disableAutoSelect(); } catch(_) {}

  // Native APK: just show the overlay — login button uses _loginFallbackRedirect.
  if (_isNativeApp()) {
    _showSessionExpiredOverlay();
    return;
  }

  // Try silent Google token refresh — if user's Google session is still active,
  // handleGoogleCredential will fire automatically and re-login without user interaction.
  if (window.google && google.accounts && google.accounts.id && GOOGLE_CLIENT_ID) {
    var _fallbackTimer = setTimeout(_showSessionExpiredOverlay, 4000);
    try {
      google.accounts.id.prompt(function(notification) {
        // prompt was suppressed or dismissed — give up and show overlay.
        // FedCM: isNotDisplayed()/isSkippedMoment()/isDismissedMoment() deprecated — may throw;
        // אם זרק, נשאיר את ה-4s timer לטפל בכך (אל תכפה overlay אם ה-One Tap אולי מוצג).
        var _gaveUp = false;
        try { _gaveUp = notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment(); }
        catch(_ne) { _gaveUp = false; }
        try { console.log('[auth] sessionExpired One Tap notDisplayedReason:', notification.getNotDisplayedReason()); } catch(_r1) {}
        try { console.log('[auth] sessionExpired One Tap skippedReason:', notification.getSkippedReason()); } catch(_r2) {}
        if (_gaveUp) {
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

  // גישה A: אם יש bio credential — נשתמש בו כ-fallback ולא נחסום על idToken שפג
  var _bioCred = (typeof _bioLoad === 'function') ? _bioLoad() : null;
  var _hasBio = !!(_bioCred && _bioCred.credentialId && _bioCred.email);
  if (STATE.idToken && STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken) && !_hasBio) {
    if (!opts.silent) { _sessionExpired(); throw new Error('session_expired'); }
    return { ok: false, error: 'session_expired' };
  }

  const params = Object.assign({ action, idToken: STATE.idToken }, extra);
  // גישה A: כשאין idToken תקין אך קיים bio credential — צרף credentialId+email ל-GAS
  var _tokBad = !STATE.idToken || (STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken));
  if (_tokBad && _hasBio) {
    params.credentialId = _bioCred.credentialId;
    params.email = _bioCred.email;
  }
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  let resp;
  try {
    resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
  } catch(netErr) {
    if (opts.silent) return { ok: false, error: 'network_error' };
    throw new Error('שגיאת חיבור: ' + (netErr && netErr.message ? netErr.message : netErr));
  }
  let text;
  try {
    text = await resp.text();
  } catch(e) {
    if (opts.silent) return { ok: false, error: 'response_read_error' };
    throw new Error('שגיאת קריאת תגובה');
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch(e) {
    // GAS החזיר HTML במקום JSON — שגיאת שרת
    var snippet = String(text || '').substring(0, 200).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (opts.silent) return { ok: false, error: 'server_html: ' + snippet };
    throw new Error('שגיאת שרת: ' + snippet);
  }
  if (!data.ok) {
    if (!opts.silent && data.error && (data.error.includes('idToken') || data.error === 'unauthorized')) {
      _sessionExpired();
      throw new Error('session_expired');
    }
    if (opts.silent) return data;
    var _gErr = new Error(data.error || 'שגיאת שרת');
    _gErr.error = data.error; // preserve error code (e.g. 'vehicle_inactive') for callers
    throw _gErr;
  }
  return data;
}

async function gasPostForm(action, params) {
  // שולח POST עם FormData — לפעולות עם payload גדול (תמונה base64)
  // גישה A: bio credential כ-fallback ל-idToken שפג
  var _bioCred2 = (typeof _bioLoad === 'function') ? _bioLoad() : null;
  var _hasBio2 = !!(_bioCred2 && _bioCred2.credentialId && _bioCred2.email);
  if (STATE.idToken && STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken) && !_hasBio2) {
    _sessionExpired(); throw new Error('session_expired');
  }
  var fd = new FormData();
  fd.append('action', action);
  if (STATE.idToken) fd.append('idToken', STATE.idToken);
  var _tokBad2 = !STATE.idToken || (STATE.idToken !== 'demo_token' && _isTokenExpired(STATE.idToken));
  if (_tokBad2 && _hasBio2) {
    fd.append('credentialId', _bioCred2.credentialId);
    fd.append('email', _bioCred2.email);
  }
  Object.keys(params).forEach(function(k) { fd.append(k, params[k]); });
  var resp;
  try {
    resp = await fetch(GAS_URL, { method: 'POST', body: fd, signal: AbortSignal.timeout(20000) });
  } catch(netErr) {
    throw new Error('שגיאת חיבור: ' + (netErr.message || netErr));
  }
  var text = await resp.text();
  var data;
  try { data = JSON.parse(text); }
  catch(e) {
    throw new Error('שגיאת שרת: ' + text.replace(/<[^>]+>/g,' ').trim().substring(0,150));
  }
  if (data && !data.ok) throw new Error(data.error || 'שגיאת שרת');
  return data;
}

/* ══ Demo / Mock mode (כשאין GAS_URL) ══ */
function mockResponse(action, params) {
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
  if (action === 'driver_register_fcm') return { ok: true };
  if (action === 'get_service_providers') {
    return { ok: true, providers: [{ id:'SP001', name:'פנצריה מורשית עלה', category:'puncture', address:'רחוב הרצל 14, בני ברק', phone:'03-1234567', contactName:'יוסי כהן', googlePlaceId:'ChIJtest123', notes:'' }] };
  }
  if (action === 'get_vehicle_insurance_details') {
    return {
      ok: true,
      comp: {
        company: 'מנורה מבטחים',
        policyNumber: '70-33-158824-25/5',
        startDate: '2025-09-01',
        endDate: '2026-08-31',
        minDriverAge: 24,
        minDrivingExperience: 12,
        deductible: 0,
        agentName: 'יוסי כהן',
        agentPhone: '050-1234567',
        insuredName: 'עמותת עלה',
        coverages: [],
        exclusions: [],
        summary: 'ביטוח חובה לכלי רכב תקף עד 31.08.2026. מכסה נזקי גוף לצד שלישי בתאונות דרכים.',
        fileLink: ''
      },
      full: {
        company: 'מגדל ביטוח',
        policyNumber: '12345-67890-01',
        startDate: '2025-09-01',
        endDate: '2026-08-31',
        minDriverAge: 24,
        minDrivingExperience: 12,
        deductible: 3500,
        agentName: 'משה לוי',
        agentPhone: '052-9876543',
        insuredName: 'עמותת עלה',
        coverages: [
          { name: 'גרירה', included: true, provider: 'שגריר', phone: '1700507507', limit: '100 ק"מ', deductible: '0', details: 'גרירה 24/7 עד 100 ק"מ' },
          { name: 'שמשות', included: true, provider: 'אילן קארגלס', phone: '036534444', limit: '', deductible: '0', details: 'החלפת שמשות ללא השתתפות עצמית' },
          { name: 'רכב חלופי', included: true, provider: '', phone: '', limit: '21 יום', deductible: '', details: 'רכב חלופי עד 21 יום' }
        ],
        exclusions: [],
        summary: 'ביטוח מקיף הכולל גרירה עד 100 ק"מ, שמשות ורכב חלופי. השתתפות עצמית בנזק עצמי ₪3,500.',
        fileLink: ''
      }
    };
  }
  if (action === 'driver_field_event') {
    return { ok: true, eventId: 'EVT-DEMO-' + Date.now() };
  }
  if (action === 'insurance_ai_explain') {
    var q = params && params.question ? params.question : '';
    return { ok: true, answer: 'על פי פרטי הביטוח שלך: ' + (q ? 'בנוגע ל"' + q + '" — ' : '') + 'הביטוח המקיף כולל גרירה עד 100 ק"מ, החלפת שמשות ורכב חלופי עד 21 יום. ההשתתפות העצמית בנזק עצמי היא ₪3,500.' };
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

/* ══ Vehicle Picker Helpers ══ */

function _vehKey(v) {
  if (!v) return '';
  return String(v.id || v.num || '').replace(/[^0-9A-Za-z_-]/g, '_');
}

function _formatLastLogin(isoStr) {
  if (!isoStr) return null;
  try {
    var d = new Date(isoStr);
    var now = new Date();
    var diffMs  = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    var diffH   = Math.floor(diffMs / 3600000);
    var diffD   = Math.floor(diffMs / 86400000);
    var hhmm    = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    if (diffMin < 2)   return 'כרגע';
    if (diffMin < 60)  return 'לפני ' + diffMin + ' דקות';
    if (diffD === 0)   return 'היום, ' + hhmm;
    if (diffD === 1)   return 'אתמול, ' + hhmm;
    if (diffD < 7)     return 'לפני ' + diffD + ' ימים';
    return 'לפני ' + Math.floor(diffD/7) + ' שבועות';
  } catch(_e) { return null; }
}

function _llCacheKey(emailKey, vehicleKey) {
  return '_ll_' + emailKey + '_' + vehicleKey;
}

function _fbWriteLastLogin(emailKey, vehicleKey) {
  var iso = new Date().toISOString();
  // write to localStorage cache immediately (cross-session, same device)
  try { localStorage.setItem(_llCacheKey(emailKey, vehicleKey), iso); } catch(_e) {}
  // write to Firebase (cross-device sync)
  if (!_fbDb || !emailKey || !vehicleKey) return;
  try {
    _fbDb.ref('driverLogins/' + emailKey + '/' + vehicleKey + '/lastLogin')
      .set(iso)
      .catch(function() {});
  } catch(_e) {}
}

function _fbReadLastLoginOnce(emailKey, vehicleKey, cb) {
  if (!emailKey || !vehicleKey) { cb(null); return; }
  // 1. return localStorage cache immediately (instant, no auth needed)
  try {
    var cached = localStorage.getItem(_llCacheKey(emailKey, vehicleKey));
    if (cached) { cb(cached); return; }
  } catch(_e) {}
  // 2. no cache → try Firebase (new device) — wait for auth
  if (!_fbDb) { cb(null); return; }
  function doRead() {
    _fbDb.ref('driverLogins/' + emailKey + '/' + vehicleKey + '/lastLogin')
      .once('value')
      .then(function(snap) {
        var val = snap.val();
        // populate cache for next time
        if (val) { try { localStorage.setItem(_llCacheKey(emailKey, vehicleKey), val); } catch(_e) {} }
        cb(val);
      })
      .catch(function() { cb(null); });
  }
  if (_fbAuth && _fbAuth.currentUser) { doRead(); return; }
  var done = false;
  var unsub = _fbAuth ? _fbAuth.onAuthStateChanged(function(u) {
    if (done) return;
    if (u) { done = true; if (unsub) unsub(); doRead(); }
  }) : null;
  setTimeout(function() {
    if (done) return; done = true; if (unsub) unsub(); doRead();
  }, 3000);
}

function _fbReadLastLogins(emailKey, vehicleKeys, cb) {
  if (!_fbDb || !emailKey || !vehicleKeys.length) { cb({}); return; }
  try {
    _fbDb.ref('driverLogins/' + emailKey).once('value')
      .then(function(snap) {
        var map = {};
        var data = snap.val() || {};
        vehicleKeys.forEach(function(k) {
          map[k] = (data[k] && data[k].lastLogin) ? data[k].lastLogin : null;
        });
        cb(map);
      })
      .catch(function() { cb({}); });
  } catch(_e) { cb({}); }
}

function renderPickerScreen(vehicles) {
  STATE._pickerVehicles = vehicles;
  STATE._pickerCurrent  = 0;

  var el = document.getElementById('screen-picker');
  if (!el) return;
  el.classList.remove('hidden');

  // Avatar initials
  var av = document.getElementById('pk-avatar');
  if (av && STATE.user) {
    var parts = (STATE.user.name || '').split(' ');
    av.textContent = ((parts[0]||'').charAt(0) + (parts[1]||'').charAt(0)).toUpperCase() || '?';
  }

  // Subtitle
  var subTxt = document.getElementById('pk-sub-text');
  if (subTxt) subTxt.textContent = 'מחזיק בפועל ב-' + vehicles.length + ' רכבים · גלול לבחירה';

  // Build cards HTML
  var emailKey = (STATE.user && STATE.user.email) ? STATE.user.email.replace(/[.#$[\]]/g,'_') : '';
  var vehicleKeys = vehicles.map(_vehKey);

  function buildCards(loginMap) {
    var cardsEl = document.getElementById('pk-cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = vehicles.map(function(v, i) {
      var vk       = vehicleKeys[i];
      var logoSlug = _getLogoSlug(v.make);
      var logoHtml = logoSlug
        ? '<img class="pk-brand-logo" src="https://cdn.simpleicons.org/' + logoSlug + '/ffffff" onerror="this.style.display=\'none\'">'
        : '';
      var photoUrl = driveToImgUrl(v.appPhotoLink || v.photoLink) || getCarImageUrl(v.make, v.model) || '';
      var photoHtml = photoUrl
        ? '<img src="' + photoUrl + '" onerror="this.parentNode.querySelector(\'.pk-photo-fallback\').style.display=\'flex\';this.style.display=\'none\'">'
        : '';
      var fallbackEmoji = _getVehicleEmoji(v.cat || v.make);
      var alertHtml = (parseInt(v.alerts)||0) > 0
        ? '<span class="pk-alert-badge"><span class="pk-alert-dot"></span>' + v.alerts + ' התראות</span>'
        : '';
      var lastLoginStr = loginMap[vk] ? _formatLastLogin(loginMap[vk]) : null;
      var loginRow = lastLoginStr
        ? '<div class="pk-login-row">🕐 כניסה אחרונה: ' + lastLoginStr + '</div>'
        : '';
      var accentColor = v.accentColor || '#1F8A3D';
      return '<div class="pk-card" id="pk-card-' + i + '" onclick="pkSelectCard(' + i + ')" data-idx="' + i + '">' +
        '<div class="pk-accent-line" style="background:' + accentColor + ';box-shadow:0 0 10px ' + accentColor + '"></div>' +
        '<div class="pk-photo">' +
          photoHtml +
          '<div class="pk-photo-fallback" style="display:' + (photoUrl?'none':'flex') + '">' + fallbackEmoji + '</div>' +
          '<div class="pk-photo-overlay"></div>' +
          '<div class="pk-active-badge" id="pk-badge-' + i + '">● פעיל</div>' +
        '</div>' +
        '<div class="pk-info">' +
          '<div class="pk-name-row">' + logoHtml + '<span class="pk-car-name">' + (v.make||'') + ' ' + (v.model||'') + '</span></div>' +
          '<div class="pk-car-meta">' + (v.year||'') + ' · ' + (v.dept||'') + '</div>' +
          '<div class="pk-holder-row">👤 מחזיק: ' + (v.holder||'—') + '</div>' +
          loginRow +
          '<div class="pk-badges-row"><span class="pk-plate">' + formatPlate(v.num||'') + '</span>' + alertHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    pkRender();
    // Entrance stagger
    setTimeout(function() {
      document.getElementById('pk-header') && document.getElementById('pk-header').classList.add('visible');
      document.getElementById('pk-sub')    && document.getElementById('pk-sub').classList.add('visible');
    }, 100);
    setTimeout(function() {
      var active = document.getElementById('pk-card-1') || document.getElementById('pk-card-0');
      if (active) active.classList.add('pk-entered');
      setTimeout(function() {
        vehicles.forEach(function(_,i2) {
          var c = document.getElementById('pk-card-' + i2);
          if (c) c.classList.add('pk-entered');
        });
        document.getElementById('pk-cta-wrap') && document.getElementById('pk-cta-wrap').classList.add('visible');
      }, 150);
    }, 300);
    // Aurora
    pkUpdateAurora();
    pkUpdateDots();
    pkUpdateCta();
    // Touch/drag
    pkInitSwipe();
  }

  _fbReadLastLogins(emailKey, vehicleKeys, buildCards);
}

function _getLogoSlug(make) {
  var map = {
    'טויוטה':'toyota','הונדה':'honda','פולקסווגן':'volkswagen','פורד':'ford',
    'יונדאי':'hyundai','קיה':'kia','מזדה':'mazda','מיצובישי':'mitsubishi',
    'סובארו':'subaru','ניסן':'nissan','בי.מ.וו':'bmw','מרצדס':'mercedes',
    'אאודי':'audi','סקודה':'skoda','פיאט':'fiat','רנו':'renault',
    'סיטרואן':'citroen','פז\'ו':'peugeot','אופל':'opel','סאנגיונג':'ssangyong'
  };
  if (!make) return null;
  var k = String(make).trim();
  if (map[k]) return map[k];
  var s = k.replace(/[\s.'׳]/g,'').toLowerCase();
  for (var key in map) { if (key.replace(/[\s.'׳]/g,'').toLowerCase() === s) return map[key]; }
  return null;
}

function _getVehicleEmoji(catOrMake) {
  if (!catOrMake) return '🚗';
  var s = String(catOrMake).toLowerCase();
  if (s.includes('van') || s.includes('נגרר') || s.includes('ואן')) return '🚐';
  if (s.includes('truck') || s.includes('פיקאפ') || s.includes('משאית')) return '🛻';
  if (s.includes('bus') || s.includes('אוטובוס')) return '🚌';
  return '🚗';
}

var _pkSwipeStartX = null;
var _pkSwipeMoved  = false;
function pkInitSwipe() {
  var stage = document.getElementById('pk-cards');
  if (!stage) return;
  stage.ontouchstart = function(e) { _pkSwipeStartX = e.touches[0].clientX; _pkSwipeMoved = false; };
  stage.ontouchmove  = function(e) { if (_pkSwipeStartX!==null && Math.abs(e.touches[0].clientX-_pkSwipeStartX)>8) _pkSwipeMoved=true; };
  stage.ontouchend   = function(e) {
    if (!_pkSwipeMoved || _pkSwipeStartX===null) return;
    var delta = _pkSwipeStartX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 55) pkSelectCard(STATE._pickerCurrent + (delta > 0 ? 1 : -1));
    _pkSwipeStartX = null; _pkSwipeMoved = false;
  };
}

function pkSelectCard(idx) {
  var n = STATE._pickerVehicles.length;
  if (idx < 0 || idx >= n) return;
  STATE._pickerCurrent = idx;
  pkRender();
  pkUpdateAurora();
  pkUpdateDots();
  pkUpdateCta();
}

function pkRender() {
  var n = STATE._pickerVehicles.length;
  var cur = STATE._pickerCurrent;
  for (var i = 0; i < n; i++) {
    var card = document.getElementById('pk-card-' + i);
    var badge = document.getElementById('pk-badge-' + i);
    if (!card) continue;
    var offset = i - cur;
    var v = STATE._pickerVehicles[i];
    var accent = v.accentColor || '#1F8A3D';
    var glow   = v.accentColor ? v.accentColor.replace('#','') : '1F8A3D';
    if (offset === 0) {
      card.style.transform   = 'translateX(0) rotateY(0deg) scale(1) translateZ(20px)';
      card.style.opacity     = '1';
      card.style.filter      = '';
      card.style.zIndex      = '10';
      card.style.boxShadow   = '0 0 0 1.5px ' + accent + ', 0 24px 60px rgba(0,0,0,0.7), 0 0 60px rgba(' + parseInt(glow.slice(0,2),16) + ',' + parseInt(glow.slice(2,4),16) + ',' + parseInt(glow.slice(4,6),16) + ',0.35)';
      card.style.borderColor = accent;
      if (badge) badge.style.display = 'block';
    } else if (offset === -1) {
      card.style.transform   = 'translateX(-260px) rotateY(40deg) scale(0.78) translateZ(-80px)';
      card.style.opacity     = '0.45';
      card.style.filter      = 'brightness(0.5)';
      card.style.zIndex      = '5';
      card.style.boxShadow   = '';
      card.style.borderColor = 'rgba(255,255,255,0.07)';
      if (badge) badge.style.display = 'none';
    } else if (offset === 1) {
      card.style.transform   = 'translateX(260px) rotateY(-40deg) scale(0.78) translateZ(-80px)';
      card.style.opacity     = '0.45';
      card.style.filter      = 'brightness(0.5)';
      card.style.zIndex      = '5';
      card.style.boxShadow   = '';
      card.style.borderColor = 'rgba(255,255,255,0.07)';
      if (badge) badge.style.display = 'none';
    } else {
      card.style.transform = 'translateX(' + (offset*300) + 'px) scale(0.5)';
      card.style.opacity   = '0';
      card.style.zIndex    = '1';
      if (badge) badge.style.display = 'none';
    }
  }
  // 3D tilt on active card
  var activeCard = document.getElementById('pk-card-' + cur);
  if (activeCard && !activeCard._tiltBound) {
    activeCard._tiltBound = true;
    activeCard.addEventListener('mousemove', function(e) {
      var r = activeCard.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width  - 0.5;
      var y = (e.clientY - r.top)  / r.height - 0.5;
      activeCard.style.transform = 'translateZ(20px) rotateX(' + (-y*10) + 'deg) rotateY(' + (x*10) + 'deg)';
    });
    activeCard.addEventListener('mouseleave', function() {
      activeCard.style.transform = '';
      setTimeout(pkRender, 50);
    });
  }
}

function pkUpdateAurora() {
  var v = STATE._pickerVehicles[STATE._pickerCurrent];
  if (!v) return;
  var col = v.accentColor || 'rgba(31,138,61,0.5)';
  var blobs = document.querySelectorAll('#screen-picker .pk-blob');
  if (blobs[0]) { blobs[0].style.background = col; blobs[0].style.opacity = '0.22'; }
  if (blobs[1]) { blobs[1].style.background = col; blobs[1].style.opacity = '0.15'; }
}

function pkUpdateDots() {
  var dotsEl = document.getElementById('pk-dots');
  if (!dotsEl) return;
  var n = STATE._pickerVehicles.length;
  var v = STATE._pickerVehicles[STATE._pickerCurrent];
  var accent = v ? (v.accentColor || '#1F8A3D') : '#1F8A3D';
  dotsEl.innerHTML = Array.from({length:n}, function(_,i) {
    var active = i === STATE._pickerCurrent;
    return '<div class="pk-dot' + (active?' active':'') + '" onclick="pkSelectCard(' + i + ')" style="' + (active ? 'background:'+accent : '') + '"></div>';
  }).join('');
}

function pkUpdateCta() {
  var btn = document.getElementById('pk-cta-btn');
  if (!btn) return;
  var v = STATE._pickerVehicles[STATE._pickerCurrent];
  if (v) btn.textContent = 'המשך עם ' + (v.make||'') + ' ' + (v.model||'') + ' ←';
}

function pkConfirmSelect() {
  var vehicles = STATE._pickerVehicles;
  var idx      = STATE._pickerCurrent;
  if (!vehicles || !vehicles[idx]) return;
  var chosen = vehicles[idx];
  // Hide picker, proceed
  var el = document.getElementById('screen-picker');
  if (el) el.classList.add('hidden');
  STATE.vehicle      = chosen;
  STATE._washLogLoaded = false; STATE.washLog = [];
  STATE.isActualHolder = chosen.isActualHolder || false;
  saveSession(STATE.idToken, chosen, STATE.user);
  // שמור pin session ובדוק אם PIN מוגדר
  _pinSessionSave(STATE.user.email, chosen, STATE.user, STATE.idToken);
  if (_bioAvailable() && !_bioLoad()) {
    setTimeout(function(){ _offerBio(STATE.user.email, STATE.user.name||STATE.user.email); }, 1500);
  } else if (!_pinLoad() && !_bioLoad()) {
    // אל תציע PIN אם bio רשום — המשתמש כבר יש לו כניסה מהירה
    setTimeout(function(){ _offerPinSetup(STATE.user.email, chosen, STATE.user); }, 1500);
  }
  var _grEk = (STATE.user && STATE.user.email) ? STATE.user.email.replace(/[.#$[\]]/g,'_') : '';
  var _grVk = _vehKey(chosen);
  showGreeting((chosen.holder) || STATE.user.name, _grEk, _grVk);
  loadFullData().then(function() {
    _grComplete(function() {
      hideGreeting();
      _fbWriteLastLogin(_grEk, _grVk);
      startApp();
    });
  }).catch(function(err) {
    hideGreeting();
    showLoginError(err && err.message ? err.message : 'שגיאת טעינה');
  });
}

/* ===== WebAuthn / Samsung Fingerprint ===== */

var BIO_KEY = 'aleh_bio_v2'; // {email, credentialId, rpId, deviceName, createdAt}

function _bioAvailable() {
  if (_isNativeApp()) {
    return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricAuthNative);
  }
  return !!(window.PublicKeyCredential &&
    navigator.credentials &&
    navigator.credentials.create &&
    navigator.credentials.get);
}

function _bioLoad() {
  try { return JSON.parse(localStorage.getItem(BIO_KEY)||'null'); } catch(e){ return null; }
}

function _bioSave(data) {
  try { localStorage.setItem(BIO_KEY, JSON.stringify(data)); } catch(e){} }

function _bioClear() {
  try { localStorage.removeItem(BIO_KEY); } catch(e){} }

function _b64url(bytes) {
  var bin=''; new Uint8Array(bytes).forEach(function(b){bin+=String.fromCharCode(b)});
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

function _fromB64url(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4) s+='=';
  var raw=atob(s), bytes=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return bytes;
}

// רישום טביעת אצבע
async function bioRegister(email, displayName) {
  if (!_bioAvailable()) throw new Error('מכשיר זה אינו תומך בטביעת אצבע');

  // Native APK: use BiometricAuthNative plugin (fingerprint-only, no PIN fallback)
  if (_isNativeApp()) {
    var plugin = window.Capacitor.Plugins.BiometricAuthNative;
    await plugin.authenticate({
      reason: 'רישום טביעת אצבע לכניסה מהירה',
      cancelTitle: 'ביטול',
      allowDeviceCredential: false
    });
    var ua = navigator.userAgent;
    var dev = (/Samsung|Galaxy/.test(ua)) ? 'Samsung' :
              (/Android/.test(ua) && ua.match(/;\s*([^;)]+)\sBuild/)) ?
                ua.match(/;\s*([^;)]+)\sBuild/)[1].trim() : 'Android';
    _bioSave({ email: email, deviceName: dev, createdAt: new Date().toISOString(), nativePlugin: true });
    try {
      if (_fbDb && email) {
        var _ek = email.replace(/[.#$\[\]]/g, '_');
        _fbDb.ref('driverCreds/' + _ek + '/native')
          .set({ email: email, createdAt: new Date().toISOString() })
          .catch(function(){});
      }
    } catch(_e) {}
    return 'native';
  }

  // WebAuthn path (browser / PWA)
  var rpId = location.hostname;
  var localChallenge = new Uint8Array(32);
  window.crypto.getRandomValues(localChallenge);
  var cred = await navigator.credentials.create({ publicKey: {
    challenge: localChallenge,
    rp: { name: 'עלה נסיעות', id: rpId },
    user: {
      id: new TextEncoder().encode(email),
      name: email,
      displayName: displayName || email
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 }
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'discouraged',
      requireResidentKey: false,
      userVerification: 'required'
    },
    hints: ['client-device'],
    timeout: 60000,
    attestation: 'none'
  }});
  if (!cred) throw new Error('הרישום בוטל');
  var credId = _b64url(cred.rawId);
  var ua2 = navigator.userAgent;
  var dev2 = /iPhone/.test(ua2) ? 'iPhone' :
             /iPad/.test(ua2) ? 'iPad' :
             (/Android/.test(ua2) && ua2.match(/;\s*([^;)]+)\sBuild/)) ?
               ua2.match(/;\s*([^;)]+)\sBuild/)[1].trim() : 'מכשיר';
  _bioSave({ email: email, credentialId: credId, rpId: rpId, deviceName: dev2, createdAt: new Date().toISOString() });
  try {
    if (_fbDb && email) {
      var _ek2 = email.replace(/[.#$\[\]]/g, '_');
      _fbDb.ref('driverCreds/' + _ek2 + '/' + credId)
        .set({ email: email, createdAt: new Date().toISOString() })
        .catch(function(){});
    }
  } catch(_e) {}
  return credId;
}

// אימות ביומטרי
async function bioAuthenticate(email, credentialId) {
  if (!_bioAvailable()) throw new Error('WebAuthn לא נתמך');

  // Native APK: use BiometricAuthNative plugin (fingerprint-only)
  if (_isNativeApp()) {
    var plugin = window.Capacitor.Plugins.BiometricAuthNative;
    await plugin.authenticate({
      reason: 'כניסה ביומטרית',
      cancelTitle: 'ביטול',
      allowDeviceCredential: false
    });
    var session = _pinSessionLoad();
    return {
      ok: true,
      biometric: true,
      vehicle: session ? session.vehicleData : null,
      userInfo: session ? session.userInfo : { email: email, name: email }
    };
  }

  // WebAuthn path (browser / PWA)
  var rpId = location.hostname;
  var localChallenge = new Uint8Array(32);
  window.crypto.getRandomValues(localChallenge);
  var assertion = await navigator.credentials.get({ publicKey: {
    challenge: localChallenge,
    rpId: rpId,
    allowCredentials: [{
      type: 'public-key',
      id: _fromB64url(credentialId),
      transports: ['internal']
    }],
    userVerification: 'required',
    timeout: 60000
  }});
  if (!assertion) throw new Error('האימות בוטל');
  var session2 = _pinSessionLoad();
  return {
    ok: true,
    biometric: true,
    vehicle: session2 ? session2.vehicleData : null,
    userInfo: session2 ? session2.userInfo : { email: email, name: email }
  };
}

// _showBioScreen / _doBioAuth — נמחקו (קוד מת, auto-triggered WebAuthn — ראה FIX-2026-07-01-logout-fake-screen)

function bioFallback() {
  _bioClear();
  var ov = document.getElementById('bio-screen');
  if (ov) ov.style.display='none';
  var sp = document.getElementById('splash-screen');
  if (sp) sp.style.display='flex';
}

/* ── מסך כניסה חדש: כפתור ביומטרי על ה-splash ──
   מציג את כפתור "כניסה ביומטרית" + מפריד "או" ומסמן את הפאנל כמצב bio.
   ה-WebAuthn מופעל אך ורק בלחיצה על הכפתור (ללא auto-trigger). */
function _showBioLoginButton(bioData) {
  var panel = document.getElementById('login-buttons-panel');
  var bioBtn = document.getElementById('bio-login-btn');
  var divider = document.getElementById('login-or-divider');
  if (!panel || !bioBtn) return;
  // גישה A: הכפתור הביומטרי מוצג תמיד כשקיים bioData — גם אם idToken פג.
  // האימות משתמש ב-credentialId מול GAS (driverCreds) במקום ב-JWT שפג.
  // (הוסרה חסימת v269 שהסתירה את הכפתור כשה-token פג.)
  var _expMsg = document.getElementById('bio-token-expired-msg');
  if (_expMsg) { _expMsg.classList.add('hidden'); _expMsg.style.display = 'none'; }
  panel.classList.remove('nobio');
  bioBtn.style.display = 'flex';
  if (divider) divider.style.display = 'flex';
  // שמור את נתוני ה-bio עבור _doBioAuth (ללא הפעלה אוטומטית)
  window._bioPendingData = bioData;
  if (!bioBtn._bioWired) {
    bioBtn._bioWired = true;
    // הכפתור בלתי נגיש לקליקים עד שאנימציית ה-btnIn מסתיימת (opacity:0 4.35s)
    // Knox / Samsung Pass יכולים לשגר touch על אלמנט שקוף — זה חוסם את זה.
    bioBtn.style.pointerEvents = 'none';
    bioBtn.addEventListener('animationend', function _armBio(ev) {
      if (ev.animationName !== 'btnIn') return;
      bioBtn.style.pointerEvents = 'auto';
      bioBtn.removeEventListener('animationend', _armBio);
    });
    // fallback: אם animationend לא יורה (reduced-motion / interrupt)
    setTimeout(function() { bioBtn.style.pointerEvents = 'auto'; }, 5200);

    bioBtn.addEventListener('click', function(e) {
      // רק gesture אמיתי של המשתמש — לא synthetic/replay
      if (!e.isTrusted) return;
      _bioLoginFromSplash();
    });
  }
}

/* גישה A: אימות מול GAS דרך credentialId (ללא idToken) אחרי שטביעת האצבע הצליחה.
   קורא ל-action='bio_auth', מקבל נתוני רכב, מפעיל את האפליקציה.
   מחזיר true בהצלחה, false בכישלון. מטפל בעצמו ב-toast, ב-startApp וב-_bioLoginBusy. */
async function _bioGasAuth(email, credentialId) {
  var bioBtn = document.getElementById('bio-login-btn');
  var errEl = document.getElementById('login-err');
  if (!email || !credentialId) {
    window._bioLoginBusy = false;
    setTimeout(function() { showToast('יש להיכנס פעם אחת עם Google לחידוש הנתונים'); }, 200);
    return false;
  }
  var data;
  var _bioRespText;
  var params = { action: 'bio_auth', email: email, credentialId: credentialId };
  var url = GAS_URL + '?' + new URLSearchParams(params).toString();
  // retry — GAS cold start can exceed a mobile browser's fetch timeout and throw
  var _bioRetries = 2;
  var _bioFetchOk = false;
  while (_bioRetries >= 0) {
    try {
      var resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(12000) });
      _bioRespText = await resp.text();
      _bioFetchOk = true;
      break;
    } catch(e) {
      try { console.error('[bio_auth] fetch error (retries left ' + _bioRetries + '):', e && e.message, e); } catch(_) {}
      if (_bioRetries <= 0) break;
      _bioRetries--;
      await new Promise(function(r){ setTimeout(r, 1500); });
    }
  }
  if (!_bioFetchOk) {
    window._bioLoginBusy = false;
    if (bioBtn) bioBtn.classList.remove('bio-scanning');
    setTimeout(function() { showToast('שגיאת חיבור — נסה שוב'); }, 200);
    return false;
  }
  try {
    data = JSON.parse(_bioRespText);
  } catch(e) {
    window._bioLoginBusy = false;
    if (bioBtn) bioBtn.classList.remove('bio-scanning');
    var _snip = String(_bioRespText || '').substring(0, 120).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    try { console.warn('[bio_auth] non-JSON response:', _snip); } catch(_) {}
    setTimeout(function() { showToast('שגיאת שרת — נסה שוב מאוחר יותר'); }, 200);
    return false;
  }
  if (!data || !data.ok || !data.vehicle) {
    window._bioLoginBusy = false;
    if (bioBtn) bioBtn.classList.remove('bio-scanning');
    try { console.error('[bio_auth] server rejected:', (data && data.error) || 'no data', '| raw:', String(_bioRespText || '').substring(0, 200)); } catch(_) {}
    // credential לא תואם ב-Firebase — צריך כניסת Google חד-פעמית
    setTimeout(function() { showToast('יש להיכנס פעם אחת עם Google לחידוש הנתונים'); }, 200);
    return false;
  }
  // הצלחה — הפעל את האפליקציה ללא idToken (STATE.idToken נשאר null)
  STATE.vehicle = data.vehicle;
  STATE.user = { email: email, name: (data.vehicle && data.vehicle.holder) || email };
  STATE.idToken = null;
  var sp = document.getElementById('splash-screen');
  var _bioEk = email.replace(/[.#$[\]]/g, '_');
  var _bioVk = _vehKey(data.vehicle);
  showGreeting((data.vehicle && data.vehicle.holder) || email, _bioEk, _bioVk);
  try {
    loadFullData().then(function() {
      window._bioLoginBusy = false;
      window._bioTokenRefreshTried = false;
      // שמור PIN_SESSION בלי idToken — הפינגר יעבוד שוב מ-credentialId בביקור הבא
      _pinSessionSave(email, data.vehicle, STATE.user, null);
      _grComplete(function() {
        hideGreeting();
        _fbWriteLastLogin(_bioEk, _bioVk);
        if (sp) sp.classList.add('hidden');
        _bioSessionStart();
        startApp();
      });
    }).catch(function() {
      window._bioLoginBusy = false;
      STATE.vehicle = null; STATE.user = null; STATE.idToken = null;
      setTimeout(function() { showToast('שגיאת כניסה — נסה שוב'); }, 200);
    });
  } catch(e2) {
    window._bioLoginBusy = false;
    return false;
  }
  return true;
}

/* מופעל רק בלחיצת המשתמש על כפתור הכניסה הביומטרית */
async function _bioLoginFromSplash() {
  if (window._bioLoginBusy) return;
  window._bioLoginBusy = true;
  // v267: clear leaked flags from any prior aborted timeout-reauth attempt
  if (!window._bioSkipAuthenticate) {
    window._bioPendingTokenRefresh = false;
    window._bioTimeoutReauthPending = false;
    window._bioTokenRefreshTried = false;
    try { clearTimeout(window._bioRefreshTimer); } catch(_) {}
  }
  var bioData = window._bioPendingData || _bioLoad();
  if (!bioData) { window._bioLoginBusy = false; return; }
  window._bioPendingData = bioData;
  var errEl = document.getElementById('login-err');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  var bioBtn = document.getElementById('bio-login-btn');
  if (bioBtn) bioBtn.classList.add('bio-scanning');
  try {
    // _bioSkipAuthenticate מוגדר ב-retry אחרי silent token refresh — לא לבקש טביעת אצבע שנייה
    if (window._bioSkipAuthenticate) {
      window._bioSkipAuthenticate = false;
      if (bioBtn) bioBtn.classList.remove('bio-scanning');
    } else {
      await bioAuthenticate(bioData.email, bioData.credentialId);
    }
    if (bioBtn) bioBtn.classList.remove('bio-scanning');
    var session = _pinSessionLoad();
    // גישה A: אחרי שטביעת האצבע הצליחה — אם אין idToken תקין, נסה credentialId מול GAS.
    // כך פינגר עובד לצמיתות (TTL 30 יום) בלי צורך ב-Google מחדש.
    var _tokenBad = !session || !session.idToken || _isTokenExpired(session.idToken);
    if (_tokenBad) {
      var _okBio = await _bioGasAuth(bioData.email, bioData.credentialId);
      // _bioGasAuth טיפל בכל: הפעלת האפליקציה, toast שגיאה, ו-_bioLoginBusy
      return;
    }
    STATE.vehicle = session.vehicleData;
    STATE.user = session.userInfo || { email: bioData.email, name: bioData.email };
    STATE.idToken = session.idToken || null;
    if (STATE.idToken && typeof _fbSignIn === 'function') {
      _fbSignIn(STATE.idToken).catch(function(){});
    }
    var sp = document.getElementById('splash-screen');
    var _bioEk = bioData.email ? bioData.email.replace(/[.#$[\]]/g,'_') : '';
    var _bioVk = _vehKey(session.vehicleData);
    showGreeting((session.vehicleData && session.vehicleData.holder) || (session.userInfo && session.userInfo.name), _bioEk, _bioVk);
    loadFullData().then(function() {
      window._bioLoginBusy = false;
      window._bioTokenRefreshTried = false; // אפס guard — כניסה הצליחה
      // שמור PIN_SESSION רק אחרי שהנתונים נטענו בהצלחה
      _pinSessionSave(bioData.email, session.vehicleData, session.userInfo, session.idToken);
      _grComplete(function() {
        hideGreeting();
        _fbWriteLastLogin(_bioEk, _bioVk);
        if (sp) sp.classList.add('hidden');
        _bioSessionStart();
        startApp();
      });
    }).catch(function(loadErr) {
      // loadFullData נכשל (token פג / רשת) — אסור להפעיל את האפליקציה עם נתוני קאש ישנים
      window._bioLoginBusy = false;
      STATE.vehicle = null; STATE.user = null; STATE.idToken = null;
      setTimeout(function() {
        showToast('שגיאת כניסה — יש להיכנס מחדש עם Google');
      }, 200);
    });
  } catch(err) {
    window._bioLoginBusy = false;
    if (bioBtn) bioBtn.classList.remove('bio-scanning');
    var msg = (err && err.message) || 'שגיאה';
    if (/cancel|NotAllowed|abort|dismiss/i.test(msg)) msg = 'האימות בוטל — לחץ לנסות שוב';
    if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
  }
}

/* אפקט ripple בלחיצה על כפתורי הכניסה */
function _wireLoginRipple() {
  var btns = document.querySelectorAll('#login-buttons-panel .bio-btn, #login-buttons-panel .signin-btn');
  btns.forEach(function(btn) {
    if (btn._rippleWired) return;
    btn._rippleWired = true;
    btn.addEventListener('pointerdown', function(e) {
      var r = document.createElement('span');
      r.className = 'ripple';
      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + 'px';
      r.style.left = (e.clientX - rect.left - size/2) + 'px';
      r.style.top  = (e.clientY - rect.top  - size/2) + 'px';
      btn.appendChild(r);
      setTimeout(function(){ r.remove(); }, 600);
    });
  });
}

// _bootFromSession — נמחק (קוד מת, caller יחיד היה _showBioScreen שנמחק)

function _offerBio(email, displayName) {
  var modal = document.getElementById('bio-offer-modal');
  if (!modal || !_bioAvailable()) return;
  modal.style.display='flex';
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      modal.classList.add('bio-modal-open');
    });
  });
  window._bioPendingEmail = email;
  window._bioPendingName = displayName;
}

async function bioOfferAccept() {
  var modal = document.getElementById('bio-offer-modal');
  if (modal) {
    modal.classList.remove('bio-modal-open');
    setTimeout(function(){ modal.style.display='none'; }, 450);
  }
  try {
    await bioRegister(window._bioPendingEmail||'', window._bioPendingName||'');
    showToast('טביעת אצבע הופעלה! בפעם הבאה תיכנס אוטומטית');
  } catch(e) {
    showToast('לא הצלחנו: '+(e.message||'שגיאה'));
  }
}

function bioOfferDecline() {
  var modal = document.getElementById('bio-offer-modal');
  if (modal) {
    modal.classList.remove('bio-modal-open');
    setTimeout(function(){ modal.style.display='none'; }, 450);
  }
}

/* ===== PIN Auth — Quick Login ===== */

var PIN_KEY = 'aleh_pin_v1'; // { hash, email, salt, createdAt }
var PIN_SESSION_KEY = 'aleh_pin_session_v1'; // { email, vehicleData, userInfo, ts }
var PIN_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 ימים

function _pinHash(pin, salt) {
  // SHA-256 של pin+salt (Web Crypto sync fallback via simple hash)
  var str = pin + ':' + salt + ':aleh2026';
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  // עוד rounds לחיזוק
  for (var r = 0; r < 1000; r++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(r % str.length);
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + str.length.toString(36);
}

function _pinLoad() {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || 'null'); } catch(e) { return null; }
}

function _pinSave(data) {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(data)); } catch(e) {}
}

function _pinClear() {
  try { localStorage.removeItem(PIN_KEY); localStorage.removeItem(PIN_SESSION_KEY); } catch(e) {}
}

function _bioSessionStart() {
  if (!_bioLoad()) return;
  try { localStorage.setItem(BIO_SESSION_KEY, JSON.stringify({startTs: Date.now()})); } catch(e) {}
}
function _bioSessionClear() {
  try { localStorage.removeItem(BIO_SESSION_KEY); } catch(e) {}
}
function _bioSessionExpired() {
  if (!_bioLoad()) return false;
  try {
    var raw = localStorage.getItem(BIO_SESSION_KEY);
    if (!raw) return false;
    var s = JSON.parse(raw);
    return Date.now() - (s.startTs || 0) > BIO_SESSION_TTL;
  } catch(e) { return false; }
}

function _pinSessionLoad() {
  try {
    var s = JSON.parse(localStorage.getItem(PIN_SESSION_KEY) || 'null');
    if (!s) return null;
    if (Date.now() - (s.ts || 0) > PIN_SESSION_TTL) { localStorage.removeItem(PIN_SESSION_KEY); return null; }
    return s;
  } catch(e) { return null; }
}

function _pinSessionSave(email, vehicleData, userInfo, idToken) {
  try {
    localStorage.setItem(PIN_SESSION_KEY, JSON.stringify({
      email: email, vehicleData: vehicleData, userInfo: userInfo,
      idToken: idToken || null, ts: Date.now()
    }));
  } catch(e) {}
}

function _pinAvailable() {
  return !!_pinLoad();
}

// הצג מסך PIN לאימות
function _showPinScreen(pinSession) {
  var overlay = document.getElementById('pin-screen');
  if (!overlay) {
    // DOM חסר — אל תאתחל אפליקציה ללא אימות, הצג splash
    var splash = document.getElementById('splash-screen');
    if (splash) { splash.classList.remove('hidden'); splash.style.removeProperty('display'); }
    return;
  }
  var splash = document.getElementById('splash-screen');
  if (splash) splash.style.display = 'none';
  overlay.style.display = 'flex';
  window._pendingPinSession = pinSession;
  window._enteredPin = '';
  _pinUpdateDots('');
  document.getElementById('pin-email-label').textContent = pinSession.email || '';
}

function _pinUpdateDots(pin) {
  var dots = document.querySelectorAll('.pin-dot');
  dots.forEach(function(d, i) {
    d.classList.toggle('filled', i < pin.length);
  });
}

function pinKeyPress(digit) {
  if (window._enteredPin === undefined) window._enteredPin = '';
  if (window._enteredPin.length >= 4) return;
  window._enteredPin += String(digit);
  _pinUpdateDots(window._enteredPin);
  if (window._enteredPin.length === 4) {
    setTimeout(_pinVerify, 120);
  }
}

function pinBackspace() {
  if (!window._enteredPin) return;
  window._enteredPin = window._enteredPin.slice(0, -1);
  _pinUpdateDots(window._enteredPin);
}

function _pinVerify() {
  var stored = _pinLoad();
  if (!stored) { _pinAuthFail('PIN לא מוגדר'); return; }
  var entered = window._enteredPin || '';
  var hashed = _pinHash(entered, stored.salt);
  if (hashed === stored.hash) {
    _pinAuthSuccess();
  } else {
    _pinAuthFail('PIN שגוי — נסה שוב');
    window._enteredPin = '';
    _pinUpdateDots('');
    // רעידה
    var dotsEl = document.getElementById('pin-dots');
    if (dotsEl) {
      dotsEl.classList.add('pin-shake');
      setTimeout(function(){ dotsEl.classList.remove('pin-shake'); }, 500);
    }
  }
}

function _pinAuthSuccess() {
  var overlay = document.getElementById('pin-screen');
  var dotsEl = document.getElementById('pin-dots');
  if (dotsEl) dotsEl.classList.add('pin-success');
  setTimeout(function() {
    if (overlay) overlay.style.display = 'none';
    _bootWithPinSession(window._pendingPinSession);
  }, 350);
}

function _pinAuthFail(msg) {
  var errEl = document.getElementById('pin-error');
  if (errEl) { errEl.textContent = msg; setTimeout(function(){ errEl.textContent = ''; }, 2000); }
}

function pinForgot() {
  _pinClear();
  var overlay = document.getElementById('pin-screen');
  if (overlay) overlay.style.display = 'none';
  var splash = document.getElementById('splash-screen');
  if (splash) splash.style.display = 'flex';
}

// boot עם pin session
function _bootWithPinSession(session) {
  if (!session) return;
  STATE.vehicle = session.vehicleData;
  STATE.user = { email: session.email, name: (session.userInfo && session.userInfo.name) || session.email, picture: (session.userInfo && session.userInfo.picture) || '' };
  STATE.idToken = null; // אין token — PIN session
  STATE._washLogLoaded = false; STATE.washLog = [];
  if (typeof _fbSignIn === 'function' && STATE.idToken) _fbSignIn(STATE.idToken).catch(function(){});
  if (typeof loadFullData === 'function') {
    loadFullData().then(startApp).catch(startApp);
  } else { startApp(); }
}

// הצג הצעת הגדרת PIN אחרי login מוצלח
function _offerPinSetup(email, vehicleData, userInfo) {
  var modal = document.getElementById('pin-offer-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  window._pendingPinEmail = email;
  window._pendingPinVehicle = vehicleData;
  window._pendingPinUser = userInfo;
}

function pinOfferAccept() {
  var modal = document.getElementById('pin-offer-modal');
  if (modal) modal.style.display = 'none';
  _showPinSetup();
}

function pinOfferDecline() {
  var modal = document.getElementById('pin-offer-modal');
  if (modal) modal.style.display = 'none';
}

// הגדרת PIN חדש
function _showPinSetup() {
  var overlay = document.getElementById('pin-setup-screen');
  if (!overlay) return;
  overlay.style.display = 'flex';
  window._setupPin = '';
  window._setupPinConfirm = '';
  window._setupStep = 1;
  document.getElementById('pin-setup-title').textContent = 'בחר קוד PIN';
  document.getElementById('pin-setup-subtitle').textContent = 'הזן 4 ספרות לכניסה מהירה';
  _pinSetupUpdateDots('');
}

function pinSetupKeyPress(digit) {
  if (window._setupStep === 1) {
    if (window._setupPin.length >= 4) return;
    window._setupPin += String(digit);
    _pinSetupUpdateDots(window._setupPin);
    if (window._setupPin.length === 4) {
      setTimeout(function() {
        window._setupStep = 2;
        window._setupPinConfirm = '';
        document.getElementById('pin-setup-title').textContent = 'אשר קוד PIN';
        document.getElementById('pin-setup-subtitle').textContent = 'הזן שוב את אותו הקוד';
        _pinSetupUpdateDots('');
      }, 200);
    }
  } else {
    if (window._setupPinConfirm.length >= 4) return;
    window._setupPinConfirm += String(digit);
    _pinSetupUpdateDots(window._setupPinConfirm);
    if (window._setupPinConfirm.length === 4) {
      setTimeout(_pinSetupFinish, 120);
    }
  }
}

function pinSetupBackspace() {
  if (window._setupStep === 1) {
    window._setupPin = window._setupPin.slice(0,-1);
    _pinSetupUpdateDots(window._setupPin);
  } else {
    window._setupPinConfirm = window._setupPinConfirm.slice(0,-1);
    _pinSetupUpdateDots(window._setupPinConfirm);
  }
}

function _pinSetupUpdateDots(pin) {
  var dots = document.querySelectorAll('.pin-setup-dot');
  dots.forEach(function(d, i) { d.classList.toggle('filled', i < pin.length); });
}

function _pinSetupFinish() {
  if (window._setupPin !== window._setupPinConfirm) {
    var errEl = document.getElementById('pin-setup-error');
    if (errEl) { errEl.textContent = 'הקודים לא תואמים — נסה שוב'; setTimeout(function(){ errEl.textContent = ''; }, 2000); }
    window._setupStep = 1;
    window._setupPin = '';
    window._setupPinConfirm = '';
    document.getElementById('pin-setup-title').textContent = 'בחר קוד PIN';
    document.getElementById('pin-setup-subtitle').textContent = 'הזן 4 ספרות לכניסה מהירה';
    _pinSetupUpdateDots('');
    var dotsEl = document.getElementById('pin-setup-dots');
    if (dotsEl) { dotsEl.classList.add('pin-shake'); setTimeout(function(){ dotsEl.classList.remove('pin-shake'); }, 500); }
    return;
  }
  var salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var hash = _pinHash(window._setupPin, salt);
  _pinSave({ hash: hash, salt: salt, email: window._pendingPinEmail, createdAt: new Date().toISOString() });
  _pinSessionSave(window._pendingPinEmail, window._pendingPinVehicle, window._pendingPinUser, STATE.idToken);
  var overlay = document.getElementById('pin-setup-screen');
  if (overlay) overlay.style.display = 'none';
  showToast('כניסה מהירה הופעלה! ');
}

function pinSetupCancel() {
  var overlay = document.getElementById('pin-setup-screen');
  if (overlay) overlay.style.display = 'none';
}

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
function _isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function _getNativePlugin(name) {
  // When loading from a remote server.url (GitHub Pages), plugin JS modules are
  // not bundled — Capacitor.Plugins.X is undefined. registerPlugin() creates
  // a native bridge proxy without requiring an import/bundle.
  var _cap = window.Capacitor;
  if (!_cap) return null;
  return (_cap.Plugins && _cap.Plugins[name]) || (_cap.registerPlugin && _cap.registerPlugin(name)) || null;
}

function _loginFallbackRedirect() {
  // Native APK: use @capgo/capacitor-social-login with Credential Manager API.
  // style:'bottom' = bottom sheet (same UX as PWA One Tap).
  // No custom scopes passed → defaults (email, profile, openid) apply without MainActivity changes.
  if (_isNativeApp()) {
    var SocialLogin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
    if (SocialLogin) {
      SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } })
        .then(function() {
          return SocialLogin.login({ provider: 'google', options: { style: 'bottom' } });
        })
        .then(function(res) {
          var idToken = res && res.result && res.result.idToken;
          if (!idToken) throw new Error('no idToken in SocialLogin result');
          window._userInitiatedLogin = true;
          handleGoogleCredential({ credential: idToken });
        })
        .catch(function(err) {
          console.error('SocialLogin native error:', err);
          hideLoader();
          // User cancelled or no credentials — stay on login screen
        });
      return;
    }
    // Plugin not registered — fall through to web redirect as last resort
  }
  _loginWebRedirect();
}

/* ── PWA popup OAuth ─────────────────────────────────────────────────────
   When One Tap is suppressed (exponential backoff / FedCM blocked / no Google
   session) a full-page redirect is bad PWA UX. Instead open the OAuth URL in a
   small popup window ('aleh_gauth'). The popup lands back on index.html with
   #id_token; the boot handler detects window.name==='aleh_gauth', hands the
   token back (postMessage + localStorage for browsers that drop opener) and
   closes itself. Popup blocked → _loginWebRedirect() as last resort.
   PWA only — native APK never calls this. */
var _authPopupListening = false;
function _authPopupListen() {
  if (_authPopupListening) return;
  _authPopupListening = true;
  window.addEventListener('message', function(ev) {
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.type !== 'aleh-oauth-token' || !d.idToken) return;
    window._userInitiatedLogin = true;
    handleGoogleCredential({ credential: d.idToken });
  });
  // Fallback channel: some browsers null window.opener in popups — the popup
  // then writes the token to localStorage; 'storage' fires in this window.
  window.addEventListener('storage', function(ev) {
    if (ev.key !== 'aleh_oauth_token' || !ev.newValue) return;
    try { localStorage.removeItem('aleh_oauth_token'); } catch(_) {}
    window._userInitiatedLogin = true;
    handleGoogleCredential({ credential: ev.newValue });
  });
}

function _loginPopupOAuth() {
  var clientId = encodeURIComponent(GOOGLE_CLIENT_ID);
  var scope = encodeURIComponent('openid email profile');
  var redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
  var url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + clientId
    + '&redirect_uri=' + redirectUri
    + '&response_type=token id_token'
    + '&scope=' + scope
    + '&nonce=' + Math.random().toString(36).slice(2)
    + '&prompt=select_account';
  _authPopupListen();
  var w = null;
  try { w = window.open(url, 'aleh_gauth', 'width=500,height=640,popup=1'); } catch(_) {}
  if (!w) {
    // Popup blocked — full redirect is the only remaining option.
    console.warn('[auth] popup blocked — falling back to full redirect');
    _loginWebRedirect();
  }
}

/* Web OAuth redirect — browser/PWA path, and native fallback when the
   GoogleAuth plugin is unavailable or fails. */
function _loginWebRedirect() {
  var clientId = encodeURIComponent(GOOGLE_CLIENT_ID);
  var scope = encodeURIComponent('openid email profile');

  // ── Native (Capacitor APK) ──────────────────────────────────────────────
  // Google blocks OAuth inside Android System WebView (disallowed_useragent),
  // so we open the external browser via window.open(url,'_system').
  //
  // ROOT CAUSE of "Access blocked: this app's request is invalid" (OAuth 400):
  // Android OAuth clients do NOT support the browser implicit flow
  // (response_type=token id_token). They authenticate only through the Google
  // Sign-In SDK (package name + SHA-1) and have no browser redirect_uri.
  // Sending an Android client ID to the /o/oauth2/v2/auth endpoint with
  // response_type=token id_token is therefore an invalid request.
  //
  // FIX: use the WEB client (implicit flow IS allowed for Web clients in a real
  // browser) and redirect back to the GitHub Pages URL. The external Chrome tab
  // lands on that page, its boot handler parses "#id_token=…" and — since it is
  // NOT running inside Capacitor — forwards the token via deep link:
  //   org.aleh.driverapp://auth-complete#id_token=…
  // Android's intent-filter brings MainActivity to the foreground, 'appUrlOpen'
  // fires with that URL, and _handleNativeOAuthUrl() completes the login.
  // NOTE: Chrome and the Capacitor WebView do NOT share localStorage even for
  // the same origin — a localStorage bridge can never work here.
  // redirect_uri must be registered as an Authorized redirect URI on the WEB
  // client in Google Cloud Console (it is already a JavaScript origin).
  if (_isNativeApp()) {
    // User-agent override in MainActivity removes "wv" so Google permits OAuth
    // directly inside the Capacitor WebView — no external browser needed.
    var nativeRedirect = 'https://uzim4414.github.io/aleh-driver/';
    var nNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var nUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + clientId
      + '&redirect_uri=' + encodeURIComponent(nativeRedirect)
      + '&response_type=token id_token'
      + '&scope=' + scope
      + '&nonce=' + nNonce
      + '&prompt=select_account';
    window.location.href = nUrl;
    return;
  }

  // ── Web (browser / PWA) ─────────────────────────────────────────────────
  // redirect_uri = הנתיב הנוכחי ללא query string — חייב להיות רשום ב-Google Cloud Console.
  // עבור האפליקציה: https://uzim4414.github.io/aleh-driver/index.html
  var redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
  var url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + clientId
    + '&redirect_uri=' + redirectUri
    + '&response_type=token id_token'
    + '&scope=' + scope
    + '&nonce=' + Math.random().toString(36).slice(2)
    + '&prompt=select_account';
  window.location.href = url;
}

/* Deep-link return handler (native APK). The system browser redirects to
   com.googleusercontent.apps.CLIENT_ID:/oauth2redirect#id_token=… ; Capacitor's
   App plugin surfaces it as an 'appUrlOpen' event. Extract id_token and continue. */
function _handleNativeOAuthUrl(urlStr) {
  try {
    if (!urlStr || urlStr.indexOf('id_token') === -1) return;
    var hash = urlStr.split('#')[1] || urlStr.split('?')[1] || '';
    var it = new URLSearchParams(hash).get('id_token');
    if (it) {
      window._userInitiatedLogin = true;
      handleGoogleCredential({ credential: it });
    }
  } catch (_) {}
}

/* Deep-link listener (native APK). After external-browser OAuth, the GitHub
   Pages boot handler (running in Chrome) forwards the token in the deep-link
   URL itself: org.aleh.driverapp://auth-complete#id_token=… — no localStorage
   bridge (Chrome and the Capacitor WebView have SEPARATE storage even for the
   same origin). _handleNativeOAuthUrl() extracts the token from the URL. */
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
  try {
    window.Capacitor.Plugins.App.addListener('appUrlOpen', function(data) {
      _handleNativeOAuthUrl(data && data.url);
    });
  } catch (_) {}
}

/* One Tap suppressed (g_state backoff / no Google session / FedCM off) — render
   the standard GSI button in place of the custom login button. Clicking it opens
   Google's own account-chooser popup (same-origin, no full-page external redirect).
   PWA only — native APK never reaches here. */

function initGoogleAuth() {
  if (!GOOGLE_CLIENT_ID) {
    // Demo mode — skip Google auth
    return;
  }
  // use_fedcm_for_prompt:false — FedCM גרם ל-One Tap לא להיות מוצג ב-PWA
  // (isNotDisplayed) ומיד ליפול ל-redirect/popup חיצוני. עם FedCM כבוי כרטיס
  // ה-One Tap הקלאסי חוזר להיות מוצג דרך הדפדפן. native (APK) לא מגיע לכאן —
  // login-btn מדלג ל-_loginFallbackRedirect לפני קריאת prompt().
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: false
  });
}

async function handleGoogleCredential(response) {
  /* Bio token refresh: One Tap fired a fresh idToken for an expired bio session.
     Bypass the _userInitiatedLogin guard — no full login flow, just save token + retry bio. */
  if (window._bioPendingTokenRefresh) {
    window._bioPendingTokenRefresh = false;
    try { clearTimeout(window._bioRefreshTimer); } catch(_) {}
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.cancel(); } catch(_) {}
    try {
      var _bSess = _pinSessionLoad();
      if (_bSess && _bSess.vehicleData) {
        _pinSessionSave(_bSess.email, _bSess.vehicleData, _bSess.userInfo, response.credential);
      }
    } catch(_) {}
    if (window._bioTimeoutReauthPending) {
      window._bioTimeoutReauthPending = false;
      window._bioSkipAuthenticate = false;
      window._bioLoginBusy = false;
      _bioSessionStart();
      _hideBioTimeoutModal();
      return;
    }
    window._bioSkipAuthenticate = true;  // אל תבקש טביעת אצבע שנייה
    window._bioLoginBusy = false;        // שחרר נעילה לפני retry
    _bioLoginFromSplash();
    return;
  }

  /* Block FedCM / One Tap auto-sign-in that fires without user gesture (e.g. immediately after logout).
     Only proceed when the user explicitly pressed a login button or was redirected via OAuth. */
  if (!window._userInitiatedLogin) {
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.cancel(); } catch(_) {}
    return;
  }
  window._userInitiatedLogin = false; // consume — require new explicit gesture for next login
  /* Dismiss One Tap overlay immediately so it doesn't block the app */
  try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.cancel(); } catch(_) {}
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
    console.log('[auth] result ok:', result.ok, 'vehicles:', result.vehicles && result.vehicles.length);
    _fbSignIn(STATE.idToken).catch(function() {}); // Firebase Auth — non-blocking
    hideLoader();
    // Multi-vehicle: show picker if more than one vehicle
    if (result.vehicles && result.vehicles.length > 1) {
      STATE._pickerVehicles = result.vehicles;
      STATE._pickerCurrent  = 0;
      renderPickerScreen(result.vehicles);
    } else {
      // Single vehicle — proceed as before
      STATE.vehicle      = result.vehicle;
      STATE._washLogLoaded = false; STATE.washLog = [];
      STATE.isActualHolder = result.isActualHolder || false;
      saveSession(STATE.idToken, STATE.vehicle, STATE.user);
      // שמור pin session ובדוק אם PIN מוגדר
      _pinSessionSave(STATE.user.email, STATE.vehicle, STATE.user, STATE.idToken);
      // גישה A: אם bio רשום אך credentialId עוד לא ב-Firebase — כתוב כעת (migration)
      try {
        var _existBio = _bioLoad();
        if (_existBio && _existBio.credentialId && _fbDb && STATE.user && STATE.user.email) {
          var _mEk = STATE.user.email.replace(/[.#$\[\]]/g, '_');
          _fbDb.ref('driverCreds/' + _mEk + '/' + _existBio.credentialId)
            .once('value').then(function(snap) {
              if (!snap.val()) {
                _fbDb.ref('driverCreds/' + _mEk + '/' + _existBio.credentialId)
                  .set({ email: STATE.user.email, createdAt: new Date().toISOString(), migrated: true })
                  .catch(function(){});
              }
            }).catch(function(){});
        }
      } catch(_me) {}
      if (_bioAvailable() && !_bioLoad()) {
        setTimeout(function(){ _offerBio(STATE.user.email, STATE.user.name||STATE.user.email); }, 1500);
      } else if (!_pinLoad() && !_bioLoad()) {
        setTimeout(function(){ _offerPinSetup(STATE.user.email, STATE.vehicle, STATE.user); }, 1500);
      }
      var greetName = result.isActualHolder
        ? (STATE.user.name || (result.vehicle && result.vehicle.holder))
        : ((result.vehicle && result.vehicle.holder) || STATE.user.name);
      var _gEk = STATE.user && STATE.user.email ? STATE.user.email.replace(/[.#$[\]]/g,'_') : '';
      var _gVk = _vehKey(STATE.vehicle);
      showGreeting(greetName, _gEk, _gVk);
      await loadFullData();
      _pinSessionSave(STATE.user.email || '', STATE.vehicle, STATE.user, STATE.idToken);
      _grComplete(function() {
        hideGreeting();
        _fbWriteLastLogin(_gEk, _gVk);
        _bioSessionStart();
        startApp();
      });
    }
  } catch(err) {
    console.error('[auth] error:', err.message);
    // Reset STATE — avoid stale idToken/vehicle/user leaking into next login attempt
    STATE.idToken = null; STATE.vehicle = null; STATE.user = null;
    if (err && (err.error === 'vehicle_inactive' || (err.message && err.message.indexOf('vehicle_inactive') >= 0))) {
      showLoginError('הרכב שלך אינו פעיל במערכת. פנה למנהל הצי.');
    } else {
      showLoginError(err && err.message ? err.message : 'שגיאת התחברות');
    }
  }
}

async function demoLogin() {
  showLoader();
  try {
    STATE.idToken = 'demo_token';
    const result = await gasPost('driver_auth');
    STATE.vehicle = result.vehicle;
    STATE._washLogLoaded = false; STATE.washLog = [];
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
    // Do NOT reset washLog here — only reset at login/vehicle-switch so badge survives refresh
    STATE.fuelData  = result.fuelData  || null;
    STATE.documents = (result.documents && result.documents.length)
      ? result.documents
      : buildDocumentsFromVehicle(result.vehicle);
    STATE.insurance = result.insurance || [];
    STATE.history   = result.history   || [];
    STATE.alerts    = buildAlerts(STATE.vehicle);
    // Eagerly load wash log from Firebase — must await so badge is populated before renderAll
    if (typeof APP !== 'undefined' && typeof APP._loadWashLog === 'function') {
      await APP._loadWashLog();
    }
  } catch(e) {
    console.warn('loadFullData error:', e.message);
    if (e && (e.error === 'vehicle_inactive' || (e.message && e.message.indexOf('vehicle_inactive') >= 0))) {
      _showVehicleInactiveOverlay();
    }
  }
  // טעינת נתונים טכניים ממשרד התחבורה — ברקע, לא חוסמת
  fetchGovData();
  if ('serviceWorker' in navigator && GAS_URL) registerPush();
  loadNotifHistoryFromGAS();
  // Re-evaluate gate card now that STATE.vehicle is populated. On a plain refresh the
  // gate listener already fired while STATE.vehicle was null (bailed at the guard), and
  // _initFbVehicleSync only re-triggers on a *changed* value — so a vehicle that was
  // already gateAccessEnabled=FALSE never gets its card hidden / stale node removed.
  if (typeof _initFbGateSync === 'function') { try { _initFbGateSync(); } catch(_gsE) {} }
  // Attach (or re-attach) the vehicleAssignment listener now that STATE.user.email
  // is populated. On cold start onAuthStateChanged calls _initFbSync → _initFbVehicleSync
  // while STATE.user is still null, so that first attach bails out. This re-call is what
  // actually wires up live gate-access flips (admin toggling gateAccessEnabled in Fleet).
  if (typeof _initFbVehicleSync === 'function') { try { _initFbVehicleSync(); } catch(_vsE) {} }
  _initFbGarageStatusSync();
  // Safety net: clear stale local widget if it no longer matches an active server request
  _reconcileGarageStatus();
  // Reliable fallback: poll GAS for active appointment (bypasses Firebase garageSync)
  _syncActiveAppointmentFromGAS();
  // Continuous safety net — catches admin-set appointments missed by Firebase listener
  _startActiveAppointmentPoll();
}

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
  try {
    var r = await gasPost('get_active_appointment', {}, { silent: true });
    if (!r || !r.ok) return;
    var appt = r.appointment;
    var existing = _loadActiveAppointment();
    if (appt && appt.appointmentDate) {
      var _aSet = {
        eventId:         appt.eventId         || '',
        requestNumber:   appt.requestNumber   || (function(eid) { try { var m = String(eid||'').match(/-(\d+)$/); return m ? String(parseInt(m[1], 10)) : ''; } catch(_) { return ''; } })(appt.eventId),
        appointmentDate: String(appt.appointmentDate || '').split('T')[0].split(' ')[0],
        appointmentTime: (function(t) { if (!t) return '09:00'; var m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : '09:00'; })(appt.appointmentTime),
        managerNote:     appt.managerNote     || '',
        garageName:    (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
        garageAddress: (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
        garagePhone:   (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || '',
        updatedAt:     Date.now()
      };
      // BUG-6 fix: compare by eventId+date only — don't overwrite locally-set
      // appointment just because time format differs ("09:00" vs "9:00" etc.)
      var changed = !existing
        || String(existing.eventId) !== String(_aSet.eventId)
        || existing.appointmentDate !== _aSet.appointmentDate;
      if (changed) {
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_aSet));
        // Clear pending/approved — admin-set appointment supersedes any in-flight request
        try { localStorage.removeItem('pendingGarageRequest'); } catch(_) {}
        try { localStorage.removeItem('approvedGarageRequest'); } catch(_) {}
        if (typeof _fbSetActiveAppointment === 'function') _fbSetActiveAppointment(_aSet);
        if (typeof _fbClearPendingGarage   === 'function') _fbClearPendingGarage();
        if (typeof _fbClearApprovedGarage  === 'function') _fbClearApprovedGarage();
        if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
      }
    } else if (!appt && existing) {
      // Admin cleared appointment — remove widget
      // Guard: if local data is very fresh (<10 min), GAS might still be propagating — don't clear
      var _localFreshness = Date.now() - (existing.updatedAt || 0);
      if (_localFreshness < 600000) {
        return;
      }
      localStorage.removeItem('activeGarageAppointment');
      if (typeof _fbClearActiveAppointment === 'function') _fbClearActiveAppointment();
      if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
    }
  } catch(_e) {}
}

/* Periodic poll — covers cases where Firebase listener missed the update
   (e.g. admin set appointment while driver app was open, but garageSync had
   stale `consumed:true` from a previous event on this device). */
var _APPT_POLL_INTERVAL = 120 * 1000; // 2min — reduced from 30s to stop jarring repaints
var _apptPollTimer = null;
function _startActiveAppointmentPoll() {
  if (_apptPollTimer) return;
  _apptPollTimer = setInterval(function() {
    if (document.visibilityState !== 'visible') return;
    if (!STATE.idToken || !STATE.vehicle) return;
    if (_isTokenExpired(STATE.idToken)) return;
    _syncActiveAppointmentFromGAS();
  }, _APPT_POLL_INTERVAL);
}

/* ── Listener: garageSync/{vehicleId} — כתיבה ישירה מ-GAS בעת אישור/דחייה ── */
function _initFbGarageStatusSync() {
  if (!_fbDb) return;
  var vehicleId = STATE.vehicle && (STATE.vehicle.id || STATE.vehicle.num);
  if (!vehicleId) return;
  var vehKey = String(vehicleId).replace(/[^0-9A-Za-z_-]/g, '_');
  /* BUG-05: detach previous listener before re-attaching */
  if (STATE._garageStatusRef) {
    try { STATE._garageStatusRef.off(); } catch(_) {}
  }
  STATE._garageStatusRef = _fbDb.ref('garageSync/' + vehKey);
  STATE._garageStatusRef.on('value', function(snap) {
    try {
      var data = snap.val();
      if (!data || !data.status || !data.eventId) return;

      // ── ביטול תור — נקה תמיד אם ה-eventId תואם, ללא תלות ב-consumed ──
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

      // ── מנהל קבע תור מהיומן ──
      // NOTE: process appointment_set even when consumed:true if our local copy
      // is missing or stale (eventId differs) — this covers the case where a
      // previous session marked consumed but the appointment is still active
      // and the current device hasn't reflected it yet.
      if (data.status === 'appointment_set' && data.appointmentDate) {
        // ── Staleness guard: if local appointment was set MORE RECENTLY than Firebase data, keep local ──
        var _localApptCheck = null;
        try { _localApptCheck = JSON.parse(localStorage.getItem('activeGarageAppointment') || 'null'); } catch(_) {}
        var _fbAge   = data.updatedAt    || 0;
        var _localAge = _localApptCheck && _localApptCheck.updatedAt ? _localApptCheck.updatedAt : 0;
        var _sameApptData = _localApptCheck
          && _localApptCheck.appointmentDate === data.appointmentDate
          && (_localApptCheck.appointmentTime || '') === (data.appointmentTime || '');
      if (_localAge > _fbAge && _localApptCheck.eventId === (data.eventId || '') && _sameApptData) {
          // Local is strictly newer AND same event AND same date/time — Firebase is stale, mark consumed and skip
          if (!data.consumed) snap.ref.update({ consumed: true, consumedAt: Date.now() });
          return;
        }
        if (data.consumed) {
          var _existAppt = _localApptCheck;
          var _haveSame = _existAppt
            && String(_existAppt.eventId) === String(data.eventId || '')
            && _existAppt.appointmentDate === data.appointmentDate
            && (_existAppt.appointmentTime || '') === (data.appointmentTime || '');
          if (_haveSame) { return; } // already reflected — nothing to do
          // else fall through and apply the appointment locally
        }
        var _aSet = {
          eventId:         data.eventId         || '',
          requestNumber:   data.requestNumber   || (function(eid) { try { var m = String(eid||'').match(/-(\d+)$/); return m ? String(parseInt(m[1], 10)) : ''; } catch(_) { return ''; } })(data.eventId),
          appointmentDate: String(data.appointmentDate || '').split('T')[0].split(' ')[0],
          appointmentTime: (function(t) { if (!t) return '09:00'; var m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : '09:00'; })(data.appointmentTime),
          managerNote:     data.managerNote     || '',
          garageName:    (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
          garageAddress: (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
          garagePhone:   (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || '',
          updatedAt:     data.updatedAt || Date.now()
        };
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_aSet));
        localStorage.removeItem('approvedGarageRequest');
        localStorage.removeItem('pendingGarageRequest');
        _fbSetActiveAppointment(_aSet);
        if (typeof _fbClearApprovedGarage === 'function') _fbClearApprovedGarage();
        if (typeof _fbClearPendingGarage === 'function') _fbClearPendingGarage();
        if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
        // Cross-channel dedup: skip notification if FCM already showed this event
        var _setDupKey = _normGarageEventKey('appointment_set', data.eventId);
        if (!_garageDedupSeen(_setDupKey)) {
          var _prevHadAppt = _localApptCheck && _localApptCheck.appointmentDate;
          var _dateChanged = _prevHadAppt &&
            (_localApptCheck.appointmentDate !== _aSet.appointmentDate ||
             (_localApptCheck.appointmentTime || '') !== _aSet.appointmentTime);
          var _isAdminChange = data.setBy !== 'driver';
          var _apptTitle = (_dateChanged && _isAdminChange) ? 'המנהל שינה את התור שלך' : 'תור נקבע במוסך';
          var _apptBody  = 'מנהל הצי קבע לך תור במוסך ל-' + _aSet.appointmentDate + ' בשעה ' + (_aSet.appointmentTime || '');
          // Single Writer Principle: FCM is the canonical owner of notification
          // history for this event. The Firebase listener syncs STATE only — it must
          // NOT create a second history card. The in-memory dedup maps
          // (_garageDedupMap / _notifDedupTtlMap) reset on app reload and are not
          // shared with the background SW that handled FCM, so they cannot be trusted
          // for cross-channel dedup. Check PERSISTENT history via the universal gate.
          var _alreadySaved = _notifAlreadyInHistory(
            'garage_appointment_set', _aSet.eventId, _apptTitle, _apptBody,
            { requestNumber: _aSet.requestNumber, vehicleId: (STATE.vehicle && STATE.vehicle.id) || '', appointmentDate: _aSet.appointmentDate }
          );
          // Only save+show when FCM did NOT already record this event.
          // If FCM handled it, do nothing — STATE sync was already done above.
          if (!_alreadySaved && typeof showInAppNotification === 'function') {
            showInAppNotification({
              notification: { title: _apptTitle, body: _apptBody },
              data: {
                alertType: 'garage_appointment_set',
                vehicleId: (STATE.vehicle && STATE.vehicle.id) || '',
                eventId: _aSet.eventId,
                requestNumber: _aSet.requestNumber,
                appointmentDate: _aSet.appointmentDate,
                appointmentTime: _aSet.appointmentTime,
                managerNote: _aSet.managerNote
              }
            });
          }
        }
        snap.ref.update({ consumed: true, consumedAt: Date.now() });
        return;
      }

      // ── אישור/דחייה של בקשה ממתינה ──
      // For approved/rejected, skip if already consumed — avoid replaying handled state
      if (data.consumed) return;
      var prevRaw  = localStorage.getItem('pendingGarageRequest');
      var _pending = null;
      var _localMatch = false;
      if (prevRaw) {
        try {
          _pending = JSON.parse(prevRaw);
          _localMatch = (String(_pending.eventId) === String(data.eventId));
        } catch(e) {}
      }
      // Mark consumed regardless — prevents infinite replay if FCM already handled this
      snap.ref.update({ consumed: true, consumedAt: Date.now() });
      if (data.status === 'approved') {
        if (_localMatch) {
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
        }
        if (typeof APP !== 'undefined' && STATE.currentScreen === 'vehicle') {
          if (APP.switchTab) APP.switchTab('garage');
        }
      } else if (data.status === 'rejected') {
        if (_localMatch) {
          localStorage.removeItem('pendingGarageRequest');
          _fbClearPendingGarage();
        }
        // Cross-channel dedup: skip toast if FCM already showed this event
        var _rjDupKey = _normGarageEventKey('rejected', data.eventId);
        if (typeof showToast === 'function' && !_garageDedupSeen(_rjDupKey)) {
          showToast('בקשת המוסך נדחתה' + (data.managerNote ? ': ' + data.managerNote : ''));
        }
        if (typeof APP !== 'undefined' && STATE.currentScreen === 'vehicle') {
          if (APP.switchTab) APP.switchTab('garage');
        }
      }
    } catch(e) { console.warn('[fbSync] garageStatusSync onValue:', e.message); }
  }, function(err) { console.warn('[fbSync] garageStatusSync listener:', err.message); });
  /* reference stored in STATE._garageStatusRef for cleanup */
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

    // Merge GAS data into localStorage — dedup by ts, eventId, and alertType+requestNumber
    var existing = [];
    try { existing = JSON.parse(localStorage.getItem('driver_notif_history') || '[]'); } catch(e) {}
    var existingTsSet  = new Set(existing.map(function(n) { return n.ts; }));
    var existingEvtSet = new Set(
      existing.filter(function(n) { return n.eventId && n.alertType; })
              .map(function(n) { return n.alertType + '|' + n.eventId; })
    );
    var existingReqSet = new Set(
      existing.filter(function(n) { return n.requestNumber && n.alertType; })
              .map(function(n) { return n.alertType + '|' + n.requestNumber; })
    );
    var merged = existing.slice();
    gasNotifs.forEach(function(n) {
      // Skip if already saved by push delivery (ts match)
      if (existingTsSet.has(n.ts)) return;
      // Skip if same event already saved via a different ts (eventId dedup)
      if (n.eventId && n.alertType && existingEvtSet.has(n.alertType + '|' + n.eventId)) return;
      // Skip if same requestNumber+alertType combo (catches garage approval duplicates)
      if (n.requestNumber && n.alertType && existingReqSet.has(n.alertType + '|' + n.requestNumber)) return;
      // New notification — copy all available fields
      var entry = {
        id: n.ts, ts: n.ts,
        title: n.title || '', body: n.body || '',
        alertType: n.alertType || 'plan',
        vehicleId: n.vehicleId || '',
        requestNumber: n.requestNumber || '',
        eventId: n.eventId || '',
        reasonLabel: n.reasonLabel || '',
        managerNote: n.managerNote || '',
        garageInfo: (function(g){ return !g ? '' : (typeof g === 'string' ? g : (g.name || g.garageName || '')); })(n.garageInfo),
        appointmentDate: n.appointmentDate || '',
        appointmentTime: n.appointmentTime || '',
        testDate: n.testDate || '',
        daysLeft: n.daysLeft != null ? n.daysLeft : '',
        kmLeft:   n.kmLeft   != null ? n.kmLeft   : '',
        nextKm:   n.nextKm   != null ? n.nextKm   : '',
        estKm:    n.estKm    != null ? n.estKm    : '',
        daysSinceUpdate: n.daysSinceUpdate != null ? n.daysSinceUpdate : '',
        fuelConsumption: n.fuelConsumption != null ? n.fuelConsumption : '',
        costPerKm:  n.costPerKm  != null ? n.costPerKm  : '',
        fleetAverage: n.fleetAverage != null ? n.fleetAverage : '',
        threshold:  n.threshold  != null ? n.threshold  : ''
      };
      merged.push(entry);
      existingTsSet.add(n.ts);
      if (n.eventId && n.alertType) existingEvtSet.add(n.alertType + '|' + n.eventId);
      if (n.requestNumber && n.alertType) existingReqSet.add(n.alertType + '|' + n.requestNumber);
    });
    merged.sort(function(a, b) { return b.ts - a.ts; });
    // Final safety net: collapse any cross-path duplicates the merge-loop dedup
    // (ts/eventId/requestNumber) missed — e.g. plan alerts with no eventId.
    merged = dedupNotifList(merged);
    if (merged.length > 30) merged = merged.slice(0, 30);
    localStorage.setItem('driver_notif_history', JSON.stringify(merged));

    /* Badge count from the deduplicated merged list, using clearedAt (same
       reference point as the Firebase listener) so the two sources agree. */
    var unread = merged.filter(function(n) { return n.ts > clearedAt; }).length;
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
  if (String(v.testPendingApproval) === 'true') {
    alerts.push({ type: 'warn', title: 'טסט ממתין לאישור', sub: 'נשלח ב-' + formatDate(v.testPendingDate || ''), days: 0, label: 'בהמתנה' });
  } else if (!v.testDone && v.testDue) {
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
    var mapEl = document.getElementById('th-leaflet-map');
    if (mapEl && mapEl.contains(e.target)) { _swipeOnItem = true; return; } // don't swipe when touching map
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    // Flag if touch started on a swipeable notification item — let item handler own it
    _swipeOnItem = !!(e.target && e.target.closest && e.target.closest('.nh-item, .nrd-wrap, .nrd-card'));
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


/* === Android Back Button: double-press to exit === */
var _lastBackPress = 0;
var _backToastEl = null;
function _ensureBackStyles() {
  if (document.getElementById('back-btn-styles')) return;
  var st = document.createElement('style');
  st.id = 'back-btn-styles';
  st.textContent = 
    '@keyframes backToastIn { from { opacity:0; transform:translate(-50%, 12px); } to { opacity:1; transform:translate(-50%, 0); } }' +
    '@keyframes backToastOut { from { opacity:1; transform:translate(-50%, 0); } to { opacity:0; transform:translate(-50%, 8px); } }' +
    '@keyframes exitModalFade { from { opacity:0; } to { opacity:1; } }' +
    '@keyframes exitModalSlide { from { opacity:0; transform: translateY(20px) scale(.96); } to { opacity:1; transform: translateY(0) scale(1); } }' +
    '.back-exit-backdrop { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.8); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:24px; animation: exitModalFade .2s ease-out; }' +
    '.back-exit-card { width:100%; max-width:320px; background:linear-gradient(135deg,#1e293b,#0f172a); border-radius:24px; border:1px solid rgba(239,68,68,.3); padding:28px 22px; box-shadow: 0 24px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(239,68,68,.15); direction:rtl; text-align:center; animation: exitModalSlide .3s cubic-bezier(.34,1.56,.64,1); }' +
    '.back-exit-icon { width:60px; height:60px; margin:0 auto 14px; background:rgba(239,68,68,.15); border:1px solid rgba(239,68,68,.3); border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:30px; }' +
    '.back-exit-title { font-size:18px; font-weight:800; color:#f1f5f9; margin:0 0 6px; }' +
    '.back-exit-sub { font-size:14px; color:#94a3b8; margin:0 0 20px; }' +
    '.back-exit-btn { display:block; width:100%; height:54px; border:none; border-radius:16px; font-family:inherit; font-size:15px; font-weight:700; cursor:pointer; }' +
    '.back-exit-btn.primary { background:linear-gradient(135deg,#dc2626,#ef4444); color:white; box-shadow: 0 8px 20px rgba(239,68,68,.4), inset 0 1px 0 rgba(255,255,255,.2); }' +
    '.back-exit-btn.primary:active { transform:scale(.98); }' +
    '.back-exit-btn.ghost { margin-top:10px; background:rgba(148,163,184,.1); color:#cbd5e1; border:1px solid rgba(148,163,184,.2); }' +
    '.back-toast-pill { position:fixed; bottom:100px; left:50%; transform:translateX(-50%); z-index:9999; background:rgba(30,41,59,.95); border:1px solid rgba(255,255,255,.15); border-radius:999px; padding:12px 22px; color:white; font-size:14px; font-weight:600; box-shadow: 0 12px 28px rgba(0,0,0,.45); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display:flex; align-items:center; gap:8px; direction:rtl; animation: backToastIn .2s ease-out; pointer-events:none; }' +
    '.back-toast-pill.out { animation: backToastOut .2s ease-in forwards; }';
  document.head.appendChild(st);
}
function _showBackToast() {
  _ensureBackStyles();
  if (_backToastEl && _backToastEl.parentNode) _backToastEl.parentNode.removeChild(_backToastEl);
  var el = document.createElement('div');
  el.className = 'back-toast-pill';
  el.innerHTML = '<span style="font-size:16px">\ud83d\udeaa</span><span>\u05dc\u05d7\u05e5 \u05e9\u05d5\u05d1 \u05dc\u05e6\u05d0\u05ea \u05de\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4</span>';
  document.body.appendChild(el);
  _backToastEl = el;
  setTimeout(function() {
    if (!el.parentNode) return;
    el.classList.add('out');
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }, 1800);
}
function _doExitApp() {
  try { window.history.go(-(history.length - 1)); } catch(_){}
  try { window.close(); } catch(_){}
  setTimeout(function() {
    try { document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#94a3b8;font-family:inherit;font-size:14px;direction:rtl">\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05e0\u05e1\u05d2\u05e8\u05d4. \u05e1\u05d2\u05d5\u05e8 \u05d0\u05ea \u05d4\u05d8\u05d0\u05d1.</div>'; } catch(_){}
    try { window.location.href = 'about:blank'; } catch(_){}
  }, 100);
}
function _showExitModal() {
  _ensureBackStyles();
  var existing = document.getElementById('back-exit-modal');
  if (existing) return;
  var wrap = document.createElement('div');
  wrap.id = 'back-exit-modal';
  wrap.className = 'back-exit-backdrop';
  wrap.innerHTML =
    '<div class="back-exit-card" role="dialog" aria-modal="true">' +
      '<div class="back-exit-icon">\ud83d\udeaa</div>' +
      '<h3 class="back-exit-title">\u05d9\u05e6\u05d9\u05d0\u05d4 \u05de\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4</h3>' +
      '<p class="back-exit-sub">\u05d4\u05d0\u05dd \u05d1\u05e8\u05e6\u05d5\u05e0\u05da \u05dc\u05e6\u05d0\u05ea?</p>' +
      '<button type="button" class="back-exit-btn primary" id="back-exit-yes">\u05d9\u05e6\u05d9\u05d0\u05d4</button>' +
      '<button type="button" class="back-exit-btn ghost" id="back-exit-no">\u05d4\u05d9\u05e9\u05d0\u05e8</button>' +
    '</div>';
  document.body.appendChild(wrap);
  function close(rePush) {
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    if (rePush) { try { history.pushState({ pwa: true }, ''); } catch(_){} }
  }
  wrap.addEventListener('click', function(e) { if (e.target === wrap) close(true); });
  var yes = document.getElementById('back-exit-yes');
  var no  = document.getElementById('back-exit-no');
  if (yes) yes.addEventListener('click', function() { close(false); _doExitApp(); });
  if (no)  no.addEventListener('click', function() { close(true); });
}
function _onBackPress() {
  var modal = document.getElementById('back-exit-modal');
  if (modal) { /* user pressed back while modal open: treat as cancel */ if (modal.parentNode) modal.parentNode.removeChild(modal); try { history.pushState({ pwa: true }, ''); } catch(_){} return; }
  if (typeof STATE !== 'undefined' && STATE && STATE.helpMenuOpen) {
    try { APP.closeHelpMenu(); } catch(_){}
    try { history.pushState({ pwa: true }, ''); } catch(_){}
    return;
  }
  /* Close any open overlay/modal */
  var openOverlay = document.querySelector('.modal.open, .overlay.open, .sheet.open, .help-overlay.open');
  if (openOverlay) {
    openOverlay.classList.remove('open');
    try { history.pushState({ pwa: true }, ''); } catch(_){}
    return;
  }
  var now = Date.now();
  if (now - _lastBackPress < 2000) {
    try { history.pushState({ pwa: true }, ''); } catch(_){}
    _showExitModal();
    _lastBackPress = 0;
  } else {
    _lastBackPress = now;
    _showBackToast();
    try { history.pushState({ pwa: true }, ''); } catch(_){}
  }
}
function _initBackButtonHandler() {
  try { history.pushState({ pwa: true }, ''); } catch(_){}
  window.addEventListener('popstate', _onBackPress);
}
/* === Draggable Help FAB === */
function _initHelpFabDrag() {
  var fab = document.getElementById('help-fab');
  if (!fab) return;
  var dragging = false, moved = false;
  var startX = 0, startY = 0, startLeft = 0, startTop = 0;
  var FAB_SIZE = 64;

  function restorePos() {
    try {
      var raw = localStorage.getItem('helpFabPos');
      if (raw) {
        var p = JSON.parse(raw);
        var y = Math.max(8, Math.min(window.innerHeight - FAB_SIZE - 8, p.y || 0));
        fab.style.top = y + 'px';
        fab.style.bottom = 'auto';
        if (p.side === 'left') { fab.style.left = '18px'; fab.style.right = 'auto'; }
        else { fab.style.right = '18px'; fab.style.left = 'auto'; }
      }
    } catch(e) {}
  }
  restorePos();

  function onDown(e) {
    if (e.type === 'touchstart') { try { e.preventDefault(); } catch(_){} }
    var pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX; startY = pt.clientY;
    var r = fab.getBoundingClientRect();
    startLeft = r.left; startTop = r.top;
    dragging = true; moved = false;
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchend', onUp);
    document.addEventListener('mouseup', onUp);
  }

  function onMove(e) {
    if (!dragging) return;
    var pt = e.touches ? e.touches[0] : e;
    var dx = pt.clientX - startX;
    var dy = pt.clientY - startY;
    if (!moved && (Math.abs(dx) > 15 || Math.abs(dy) > 15)) {
      moved = true;
      fab.classList.add('dragging');
      fab.style.transition = 'transform .15s ease';
    }
    if (moved) {
      if (e.cancelable) { try { e.preventDefault(); } catch(_){} }
      var nx = startLeft + dx;
      var ny = startTop + dy;
      nx = Math.max(0, Math.min(window.innerWidth - FAB_SIZE, nx));
      ny = Math.max(0, Math.min(window.innerHeight - FAB_SIZE, ny));
      fab.style.left = nx + 'px';
      fab.style.top = ny + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchend', onUp);
    document.removeEventListener('mouseup', onUp);
    if (!moved) {
      fab.classList.remove('dragging');
      try { APP.openHelpMenu(); } catch(_){}
      return;
    }
    var r = fab.getBoundingClientRect();
    var centerX = r.left + r.width / 2;
    var snapLeft = centerX < window.innerWidth / 2;
    var y = r.top;
    fab.style.transition = 'left .3s cubic-bezier(.34,1.56,.64,1), right .3s cubic-bezier(.34,1.56,.64,1), top .3s ease, transform .15s ease';
    fab.style.top = y + 'px';
    if (snapLeft) { fab.style.left = '18px'; fab.style.right = 'auto'; }
    else { fab.style.right = '18px'; fab.style.left = 'auto'; }
    try { localStorage.setItem('helpFabPos', JSON.stringify({ side: snapLeft ? 'left' : 'right', y: y })); } catch(_){}
    setTimeout(function() {
      fab.style.transition = 'transform .15s ease';
      fab.classList.remove('dragging');
    }, 360);
  }

  fab.addEventListener('touchstart', onDown, { passive: false });
  fab.addEventListener('mousedown', onDown);
  fab.addEventListener('click', function(e) { if (moved) { e.preventDefault(); e.stopPropagation(); } });
  window.addEventListener('resize', function() {
    var r = fab.getBoundingClientRect();
    if (r.top + FAB_SIZE > window.innerHeight) { fab.style.top = (window.innerHeight - FAB_SIZE - 8) + 'px'; }
  });
}

/* ══ Start App ══ */
function startApp() {
  hideLoader();
  var _appEl = document.getElementById('app');
  _appEl.classList.remove('hidden');
  _appEl.style.removeProperty('display'); // מסיר כל display:none שהוגדר inline (logout protection)
  var _hfab = document.getElementById('help-fab'); if (_hfab) _hfab.style.display = '';
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function(){}); } catch(_){}
  renderAll();
  initSwipe();
  try { _initHelpFabDrag(); } catch(e) { console.warn('fab drag init', e); }
  try { _initBackButtonHandler(); } catch(e) { console.warn('back btn init', e); }
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
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      // Show stunning full-screen landing, then navigate to the target screen
      showNotifLanding(payload, function() {
        navigateForAlertType(alertType, payload.data || {});
      });
    }
  } catch(e) {}

  _armBioTimeout();
}

var _bioTimeoutInterval = null;
var _bioVisHandler = null;
function _armBioTimeout() {
  if (window._bioTimeoutArmed) return;
  window._bioTimeoutArmed = true;
  function _checkBioTimeout() {
    if (!_bioLoad()) return;
    if (!_bioSessionExpired()) return;
    // popup already open?
    var modal = document.getElementById('bio-timeout-modal');
    if (!modal || !modal.classList.contains('hidden')) return;
    // app must be visible
    var appEl = document.getElementById('app');
    if (!appEl || appEl.classList.contains('hidden')) return;
    _showBioTimeoutModal();
  }
  _bioVisHandler = function() {
    if (document.visibilityState === 'visible') _checkBioTimeout();
  };
  document.addEventListener('visibilitychange', _bioVisHandler);
  _bioTimeoutInterval = setInterval(function() {
    if (document.visibilityState === 'visible') _checkBioTimeout();
  }, 60000);
}

function _showBioTimeoutModal() {
  var modal = document.getElementById('bio-timeout-modal');
  if (!modal) return;
  var errEl = document.getElementById('bio-timeout-error');
  var btn = document.getElementById('bio-timeout-btn');
  var btnText = document.getElementById('bio-timeout-btn-text');
  var spinner = document.getElementById('bio-timeout-spinner');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  if (btnText) btnText.textContent = 'אימות בטביעת אצבע';
  if (spinner) spinner.classList.add('hidden');
  if (btn) btn.disabled = false;
  modal.style.display = '';
  modal.classList.remove('hidden', 'km-modal-closing');
  requestAnimationFrame(function() { modal.classList.add('km-modal-open'); });
}
function _hideBioTimeoutModal() {
  var modal = document.getElementById('bio-timeout-modal');
  if (!modal) return;
  modal.classList.remove('km-modal-open');
  modal.classList.add('km-modal-closing');
  setTimeout(function() {
    modal.classList.remove('km-modal-closing');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }, 350);
}
async function _bioTimeoutReauth() {
  var btn = document.getElementById('bio-timeout-btn');
  var btnText = document.getElementById('bio-timeout-btn-text');
  var spinner = document.getElementById('bio-timeout-spinner');
  var errEl = document.getElementById('bio-timeout-error');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = '';
  if (spinner) spinner.classList.remove('hidden');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  try {
    var bioData = _bioLoad();
    if (!bioData) throw new Error('no_bio');
    var session = _pinSessionLoad();
    if (!session) throw new Error('no_session');
    // גישה A: אם idToken חסר/פג — השתמש ב-credentialId (ללא Google)
    var _tReauthBad = !session.idToken || _isTokenExpired(session.idToken);
    await bioAuthenticate(bioData.email, bioData.credentialId);
    // עדכן session מיידית — לפני כל async, כדי ש-visibilitychange לא יקפיץ modal שנית
    _bioSessionStart();
    if (_tReauthBad) {
      // fingerprint הצליח + token פג → credentialId path
      _hideBioTimeoutModal();
      var _gasOk = await _bioGasAuth(bioData.email, bioData.credentialId);
      if (!_gasOk) {
        // _bioGasAuth הציג toast — הצג שוב את ה-modal כדי לא להשאיר משתמש תקוע
        _showBioTimeoutModal();
      }
      return;
    }
    _bioSessionStart();
    _hideBioTimeoutModal();
  } catch(e) {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (btnText) btnText.textContent = 'אימות בטביעת אצבע';
    if (errEl) {
      var msg = (e && e.name === 'NotAllowedError') ? 'האימות בוטל — נסה/י שוב' : 'שגיאה באימות — נסה/י שוב';
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
  }
}

function logout() {
  showConfirmModal({
    icon: '👤',
    title: 'התנתקות מהחשבון',
    sub: 'האם תרצה להתנתק?',
    confirmText: 'התנתק',
    onConfirm: () => {
      // ══ שלב 1: אפס STATE מיד — חוסם כל async handler (Firebase, visibilitychange,
      //           push) שעלול לבדוק STATE.idToken ולהפעיל את האפליקציה מחדש
      STATE.idToken = null;
      STATE.vehicle = null;
      STATE.user    = null;
      STATE._washLogLoaded = false;
      STATE.washLog = [];
      window._userInitiatedLogin = false;
      window._bioLoginBusy       = false;

      // ══ שלב 2: נקה localStorage
      localStorage.removeItem(SESSION_KEY);
      try { localStorage.removeItem(PIN_KEY); } catch(_e) {}
      _bioSessionClear();
      if (_bioTimeoutInterval) { clearInterval(_bioTimeoutInterval); _bioTimeoutInterval = null; }
      if (_bioVisHandler) { document.removeEventListener('visibilitychange', _bioVisHandler); _bioVisHandler = null; }
      window._bioTimeoutArmed = false;
      // PIN_SESSION_KEY נשמר בכוונה — bio cache נשמר כך שטביעת האצבע תעבוד אחרי logout.
      // הגנה מפני Knox: e.isTrusted + pointer-events:none מספיקים; אין צורך לאפס idToken.

      // ══ שלב 3: Firebase sign-out (non-blocking)
      // לא קוראים disableAutoSelect() — זה מדכא את One Tap גם בכניסה הבאה.
      // ה-gate _userInitiatedLogin + auto_select:false מספיקים למניעת auto-login.
      try { if (window._fbAuth && typeof window._fbAuth.signOut === 'function') window._fbAuth.signOut(); } catch(_e) {}

      // ══ שלב 3.5: Native CredentialManager logout — מנקה החשבון השמור
      // כדי שהכניסה הבאה תדרוש בחירת חשבון ולא auto-login שקט.
      // בטוח ב-PWA — SocialLogin יהיה undefined בדפדפן.
      try {
        var _sl = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SocialLogin;
        if (_sl && typeof _sl.logout === 'function') { _sl.logout({ provider: 'google' }); }
      } catch (_e) {}

      // ══ שלב 4: הסתר #app והצג splash — לפני closeConfirmModal (מונע GPU flash)
      var _appEl = document.getElementById('app');
      var _splashEl = document.getElementById('splash-screen');
      if (_appEl) { _appEl.classList.add('hidden'); _appEl.style.display = 'none'; }
      if (_splashEl) { _splashEl.classList.remove('hidden'); _splashEl.style.removeProperty('display'); }

      // ══ שלב 5: נווט — beforeunload מבטל bfcache (Samsung Internet), ואז reload מלא
      window.addEventListener('beforeunload', function _bfDisable() {
        window.removeEventListener('beforeunload', _bfDisable);
      }, { once: true });
      window.location.replace(window.location.pathname + '?_lo=' + Date.now());
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
  // onConfirm קודם — מסתיר #app ומציג splash לפני שה-backdrop-filter מוסר.
  // אחרת: הסרת GPU layer של ה-modal חושפת את #app לframe אחד (flash של מסך הרכב).
  btn.onclick = () => { onConfirm(); closeConfirmModal(); };
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

  // washLog may arrive on the vehicle/data payload from GAS
  if (!STATE.washLog && Array.isArray(v.washLog)) STATE.washLog = v.washLog;
  if (typeof APP._updateWashBadge === 'function') APP._updateWashBadge();

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
  renderTestCard();

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

function renderTestCard() {
  var v = STATE.vehicle || {};
  var numEl  = document.getElementById('test-ring-num');
  var fillEl = document.getElementById('test-ring-fill');
  var wrapEl = document.getElementById('test-ring-wrap');
  var hintEl = document.getElementById('test-hint');
  if (!numEl) return;

  // טסט בוצע / אין תאריך
  if (v.testDone || !v.testDue) {
    numEl.textContent = '✓';
    if (fillEl) fillEl.style.strokeDashoffset = '0';
    if (wrapEl) wrapEl.style.setProperty('--test-status-color', 'var(--ok)');
    if (hintEl) hintEl.textContent = v.testDone ? 'הטסט בוצע ✓' : 'לחץ להכנה ›';
    return;
  }

  var days = Math.round((new Date(v.testDue) - new Date()) / 86400000);
  if (days < 0) days = 0;
  numEl.textContent = days;

  // צבע לפי דחיפות (7 ימים=אדום, 30=כתום, אחרת תקין)
  var color = days <= 7 ? 'var(--red)' : (days <= 30 ? 'var(--warn)' : 'var(--ok)');
  if (wrapEl) wrapEl.style.setProperty('--test-status-color', color);

  // מילוי טבעת — ככל שנשארו פחות ימים (חלון 60 יום), הטבעת מתמלאת יותר
  var C = 113.1;
  var frac = Math.max(0, Math.min(1, (60 - days) / 60));
  if (fillEl) fillEl.style.strokeDashoffset = String(C * (1 - frac));
  if (hintEl) hintEl.textContent = days + ' ימים לטסט ›';
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
  // Normalize time — GAS may return "1899-12-30 09:00:00" or ISO string; extract HH:MM
  var tStr   = (function(t) {
    if (!t) return '09:00';
    var m = String(t).match(/(\d{1,2}):(\d{2})/);
    return m ? (('0'+m[1]).slice(-2) + ':' + m[2]) : '09:00';
  })(appt.appointmentTime);
  // Normalize date — take only yyyy-MM-dd part
  var apptDateStr = String(appt.appointmentDate || '').split('T')[0].split(' ')[0];
  var apptMs = new Date(apptDateStr + 'T' + tStr + ':00').getTime();

  // Auto-expire: hide widget 24 hours after appointment has passed
  if (now > apptMs + 86400000) {
    mount.innerHTML = '';
    try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
    _fbClearActiveAppointment();
    return;
  }

  var diffMs = apptMs - now;
  // Use CALENDAR days (midnight-to-midnight) so "היום" = same date only,
  // not "within 24 hours". At 20:32, tomorrow 09:00 is <24h but calDays=1 → "מחר".
  var todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  var apptMidnight  = new Date(apptDateStr + 'T00:00:00');
  var calDays = Math.round((apptMidnight.getTime() - todayMidnight.getTime()) / 86400000);

  var tier, bg, accent, ringAnim, badgeLabel;
  if (diffMs < 0) {
    tier = 'missed';   bg = '#111';    accent = '#555';    ringAnim = 'none';                                badgeLabel = 'עבר המועד';
  } else if (calDays <= 0) {
    tier = 'today';    bg = '#1f0505'; accent = '#ef4444'; ringAnim = 'gwPulse 0.8s ease-in-out infinite';  badgeLabel = 'היום!';
  } else if (calDays === 1) {
    tier = 'urgent';   bg = '#1f0808'; accent = '#ef4444'; ringAnim = 'gwPulse 1.4s ease-in-out infinite';  badgeLabel = 'מחר';
  } else if (calDays <= 2) {
    tier = 'urgent';   bg = '#1f0808'; accent = '#ef4444'; ringAnim = 'gwPulse 1.4s ease-in-out infinite';  badgeLabel = 'עוד ' + calDays + ' ימים';
  } else if (calDays <= 7) {
    tier = 'soon';     bg = '#1f1700'; accent = '#f59e0b'; ringAnim = 'gwPulse 2.4s ease-in-out infinite';  badgeLabel = 'עוד ' + calDays + ' ימים';
  } else {
    tier = 'normal';   bg = '#0a1f0a'; accent = '#22c55e'; ringAnim = 'none';                               badgeLabel = 'עוד ' + calDays + ' ימים';
  }

  var dateFmt    = apptDateStr.split('-').reverse().join('/');
  var dayName    = _hebrewDayName(new Date(apptMs));
  var garageName = appt.garageName || 'המוסך';
  var _wReqN = appt.requestNumber || (function(eid){ try { var m = String(eid||'').match(/-(\d+)$/); return m ? String(parseInt(m[1],10)) : ''; } catch(_){ return ''; } })(appt.eventId);
  var reqNumChipHtml = _wReqN
    ? '<span style="display:inline-block;font-size:10px;font-weight:800;color:var(--gaw-accent);background:rgba(255,255,255,.08);border:1px solid var(--gaw-accent);border-radius:6px;padding:1px 7px;margin-left:6px" title="מספר בקשה">בקשה #' + _wReqN + '</span>'
    : '';

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
    '    <div class="gaw-garage">' + reqNumChipHtml + garageName + '</div>' +
    '    <div class="gaw-date">' + dayName + ' · ' + dateFmt + ' · ' + tStr + '</div>' +
    '  </div>' +
    '  <div class="gaw-badge">⏱ ' + badgeLabel + '</div>' +
    '  <div class="gaw-actions">' +
    '    <button class="gaw-btn" onclick="event.stopPropagation();_openGarageCalendarLink()">📅 יומן</button>' +
    '    <button class="gaw-btn" onclick="event.stopPropagation();_openGarageWaze()">🗺 ניווט</button>' +
    '    <button class="gaw-btn" onclick="event.stopPropagation();APP._garageEditAppointment(\'' + (appt.eventId||'') + '\')">✏ שנה</button>' +
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

/* ── Vehicle brand → Simple Icons slug map ── */
var GAR_BRAND_SLUG_MAP = {
  'טויוטה': 'toyota', 'הונדה': 'honda',
  'פולקסווגן': 'volkswagen', 'פולקסוואגן': 'volkswagen',
  'פורד': 'ford', 'יונדאי': 'hyundai', 'יונדאי מוטור': 'hyundai',
  'קיה': 'kia', 'מזדה': 'mazda', 'מאזדה': 'mazda',
  'מיצובישי': 'mitsubishi', 'סובארו': 'subaru', 'ניסן': 'nissan',
  'בי.מ.וו': 'bmw', 'במוו': 'bmw', 'ב.מ.וו': 'bmw',
  'מרצדס': 'mercedes', 'מרצדס בנץ': 'mercedes',
  'אאודי': 'audi', 'סקודה': 'skoda', 'שברולט': 'chevrolet',
  'אופל': 'opel', "פיג'ו": 'peugeot', 'פיגו': 'peugeot',
  'סיטרואן': 'citroen', 'רנו': 'renault', 'פיאט': 'fiat',
  'סוזוקי': 'suzuki', 'לקסוס': 'lexus', 'מיני': 'mini',
  'וולוו': 'volvo', 'פורשה': 'porsche', "ג'יפ": 'jeep', 'טסלה': 'tesla',
  'אינפיניטי': 'infiniti', "דאצ'יה": 'dacia', 'סיאט': 'seat'
};

function _garBrandLogoHtml(make) {
  var fallback =
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' +
    '</svg>';

  if (!make) return fallback;
  var key = String(make).trim();
  var slug = GAR_BRAND_SLUG_MAP[key];
  if (!slug) {
    var simplified = key.replace(/[\s.'׳]/g, '').toLowerCase();
    var k;
    for (k in GAR_BRAND_SLUG_MAP) {
      if (GAR_BRAND_SLUG_MAP.hasOwnProperty(k)) {
        if (k.replace(/[\s.'׳]/g, '').toLowerCase() === simplified) {
          slug = GAR_BRAND_SLUG_MAP[k]; break;
        }
      }
    }
  }
  if (!slug) return fallback;

  return '<img src="https://cdn.simpleicons.org/' + slug + '/ffffff" width="32" height="32" alt="' + _escHtml(key) + '" ' +
    'onerror="this.style.display=\'none\';this.insertAdjacentHTML(\'afterend\',' +
      '\'<svg width=&quot;32&quot; height=&quot;32&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;#fff&quot; stroke-width=&quot;2&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z&quot;/></svg>\')">';
}

function renderGarageTab() {
  var v = STATE.vehicle || {};
  var g = v.garage;
  if (!g || (!g.name && !g.address)) {
    return '<div class="gar-empty"><div class="gar-empty-ic"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>טרם שויך מוסך לרכב.<br>פנה למנהל הצי לקבלת פרטים.</div>';
  }

  var gName    = g.name || 'המוסך שלך';
  var gAddr    = g.address || '';
  var hasPlace = !!g.googlePlaceId;

  // Phone + contact visible ONLY after manager approval
  var _hasApproval = !!(
    localStorage.getItem('approvedGarageRequest') ||
    localStorage.getItem('activeGarageAppointment')
  );
  var gPhone   = _hasApproval ? (g.phone || '') : '';
  var gContact = _hasApproval ? (g.contactName || g.contact || '') : '';

  var wazeUrl      = gAddr ? 'https://waze.com/ul?q=' + encodeURIComponent(gAddr) + '&navigate=yes' : '';
  var mapsEmbedUrl = gAddr ? 'https://maps.google.com/maps?q=' + encodeURIComponent(gAddr) + '&output=embed&hl=he&z=15' : '';
  var phoneClean   = gPhone ? String(gPhone).replace(/[^0-9+]/g, '') : '';

  /* 1 — Warning banner (unchanged) */
  var warningBanner =
    '<div class="gar-warning-banner">' +
      '<div class="gar-warning-banner-icon">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
        '</svg>' +
      '</div>' +
      '<div class="gar-warning-banner-body">' +
        '<div class="gar-warning-banner-title">לפנייה למוסך נדרש אישור מנהל</div>' +
        '<div class="gar-warning-banner-sub">כל כניסה למוסך מחייבת אישור מנהל מראש</div>' +
      '</div>' +
    '</div>';

  /* 2 — Approval request button (unchanged) */
  var approvalBtn =
    '<button class="gar-approval-btn" onclick="APP.openHelpMenu();setTimeout(function(){APP.helpGarage();},350)">' +
      '<div class="gar-approval-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
          '<polyline points="16 17 21 12 16 7"/>' +
          '<line x1="21" y1="12" x2="9" y2="12"/>' +
        '</svg>' +
      '</div>' +
      '<div class="gar-approval-body">' +
        '<div class="gar-approval-title">בקשה לאישור כניסה למוסך</div>' +
        '<div class="gar-approval-sub">לחץ לשליחת בקשה למנהל הצי</div>' +
      '</div>' +
      '<div class="gar-approval-arrow">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</div>' +
    '</button>';

  /* 3 — Closed banner removed; status shown only in chip next to garage name */

  /* 4 — Info card: brand badge + name + status chip + detail rows + hours */
  var statusChipHtml = hasPlace
    ? '<span id="gar-status-chip" class="gar-status-chip loading">טוען...</span>'
    : '';

  var detailRows = '';
  if (gPhone) {
    detailRows +=
      '<div class="gar-detail-row">' +
        '<div class="gar-detail-icon">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' +
          '</svg>' +
        '</div>' +
        '<div class="gar-detail-body">' +
          '<div class="gar-detail-label">טלפון</div>' +
          '<div class="gar-detail-value" id="gar-phone-val">' + _escHtml(gPhone) + '</div>' +
        '</div>' +
        (phoneClean
          ? '<button class="gar-call-btn" onclick="window.open(\'tel:' + phoneClean + '\')" aria-label="חייג למוסך">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
            '</button>'
          : '') +
      '</div>';
  }
  if (gContact) {
    detailRows +=
      '<div class="gar-detail-row">' +
        '<div class="gar-detail-icon">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
            '<circle cx="12" cy="7" r="4"/>' +
          '</svg>' +
        '</div>' +
        '<div class="gar-detail-body">' +
          '<div class="gar-detail-label">איש קשר</div>' +
          '<div class="gar-detail-value">' + _escHtml(gContact) + '</div>' +
        '</div>' +
      '</div>';
  }

  var hoursToggleHtml = hasPlace
    ? '<details id="gar-hours-toggle" class="gar-hours-toggle">' +
        '<summary>' +
          '<span class="gar-hours-toggle-icon">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
          '</span>' +
          'שעות פעילות' +
          '<span class="gar-hours-chevron">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</span>' +
        '</summary>' +
        '<div id="gar-hours-body" class="gar-hours-body">' +
          '<div class="gar-hours-empty">טוען שעות פעילות...</div>' +
        '</div>' +
      '</details>'
    : '';

  var infoCard =
    '<div class="gar-info-card">' +
      '<div class="gar-info-header">' +
        '<div class="gar-brand-badge">' + _garBrandLogoHtml(v.make) + '</div>' +
        '<div class="gar-header-titles">' +
          '<div class="gar-header-name">' + _escHtml(gName) + '</div>' +
          '<div class="gar-header-sub">המוסך המשויך לרכב שלך</div>' +
        '</div>' +
        statusChipHtml +
      '</div>' +
      (detailRows ? '<div class="gar-detail-list">' + detailRows + '</div>' : '') +
      hoursToggleHtml +
    '</div>';

  /* 5 — Address + map card (unchanged) */
  var addrCard = '';
  if (gAddr) {
    addrCard =
      '<div class="gar-addr-card">' +
        '<div class="gar-addr-row">' +
          '<div class="gar-addr-icon">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F8A3D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' +
              '<circle cx="12" cy="10" r="3"/>' +
            '</svg>' +
          '</div>' +
          '<div class="gar-addr-body">' +
            '<div class="gar-addr-lbl">כתובת</div>' +
            '<div class="gar-addr-val">' + _escHtml(gAddr) + '</div>' +
          '</div>' +
        '</div>' +
        (mapsEmbedUrl ? '<iframe class="gar-map-frame" src="' + mapsEmbedUrl + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="מפה"></iframe>' : '') +
        (wazeUrl
          ? '<a class="gar-waze-btn" href="' + wazeUrl + '" target="_blank" rel="noopener">' +
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="3 11 22 2 13 21 11 13 3 11"/>' +
              '</svg>' +
              'נווט בוויז' +
            '</a>'
          : '') +
      '</div>';
  }

  if (hasPlace) setTimeout(function(){ _loadGarageDetails(); }, 80);

  return '<div class="gar-wrap">' + warningBanner + approvalBtn + infoCard + addrCard + '</div>';
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

/* ── Notification redesign helpers (nrd) ── */
var _NRD_ICONS = {
  calendar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.4" y="5" width="17.2" height="15.6" rx="4"/><path d="M3.6 9.6h16.8"/><path d="M8 2.6v4M16 2.6v4"/><circle cx="8.2" cy="13.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="13.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="15.8" cy="13.6" r="1.25" fill="currentColor" stroke="none"/></svg>',
  check:    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.6l4.4 4.4L19 7.2"/></svg>',
  chart:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 20.5v-7M12 20.5V6M18 20.5v-4.5"/></svg>',
  x:        '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  warning:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  chev:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  swipe:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  wrench:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  bolt:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  clock:    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  fileclip: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
  warntri:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  fuelpump: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 00-2-2H6a2 2 0 00-2 2v18"/><path d="M14 13h2a2 2 0 012 2v2a2 2 0 002 2 2 2 0 002-2V9.83a2 2 0 00-.59-1.42L18 5"/></svg>',
  money24:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  calx:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="16" x2="15" y2="16"/></svg>'
};

/* alertType -> redesign category */
var _NRD_CATEGORY = {
  plan:'reminder', km_update:'reminder', test_due:'reminder', test_urgent:'reminder', garage_appointment_set:'reminder',
  garage_approved:'approved', overdue:'approved', urgent:'approved', maintenance_overdue:'approved', maintenance_urgent:'approved', maintenance_plan:'approved',
  garage_rejected:'danger', garage_appointment_cancelled:'danger',
  fuel_high:'warning', fuel_km_high:'warning'
};
function _nrdCategoryFor(alertType) { return _NRD_CATEGORY[alertType] || 'info'; }

var _NRD_BADGE_CLASS = { reminder:'nrd-b-reminder', approved:'nrd-b-approved', danger:'nrd-b-danger', warning:'nrd-b-warning', info:'nrd-b-info' };
var _NRD_BADGE_ICON  = { reminder:'calendar', approved:'check', danger:'x', warning:'warning', info:'chart' };
/* Per-type overrides — match mockup exact badge color+icon per alert type */
var _NRD_BADGE_CLASS_BY_TYPE = {
  garage_appointment_cancelled:'nrd-b-danger',
  overdue:'nrd-b-approved', urgent:'nrd-b-approved',
  maintenance_overdue:'nrd-b-approved', maintenance_urgent:'nrd-b-approved',
  km_update:'nrd-b-info',
  test_urgent:'nrd-b-danger',
  fuel_high:'nrd-b-warning', fuel_km_high:'nrd-b-warning'
};
var _NRD_BADGE_ICON_BY_TYPE = {
  plan:'wrench', maintenance_plan:'wrench',
  overdue:'warntri', maintenance_overdue:'warntri',
  urgent:'bolt', maintenance_urgent:'bolt',
  km_update:'clock',
  test_due:'fileclip', test_urgent:'warntri',
  garage_appointment_cancelled:'calx',
  fuel_high:'fuelpump', fuel_km_high:'money24'
};
var _NRD_DOT_COLOR   = { reminder:'#4aa8ff', approved:'#22c55e', danger:'#ef4444', warning:'#f97316', info:'#bf5af2' };
var _nrdActiveTab = 'unread'; // 'unread' | 'read'
function _nrdSetTab(tab) {
  _nrdActiveTab = tab;
  renderNotifHistory();
}
function _nrdMarkAllRead() {
  try {
    var list = getNotifHistory();
    list.forEach(function(n) { n.read = true; });
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
  } catch(_) {}
  localStorage.setItem('driver_notif_unread', '0');
  renderNotifHistory();
  _applyBadgeCount(0);
}
function _nrdClearRead() {
  try {
    var list = getNotifHistory().filter(function(n) { return !n.read; });
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
  } catch(_) {}
  _nrdActiveTab = 'unread';
  renderNotifHistory();
}
var _NRD_PILL = {
  reminder:{ c:'nrd-pill-reminder', t:'תזכורת' },
  approved:{ c:'nrd-pill-approved', t:'אושר' },
  danger:  { c:'nrd-pill-danger',   t:'נדחה' },
  warning: { c:'nrd-pill-warning',  t:'אזהרה' },
  info:    { c:'nrd-pill-info',     t:'עדכון' }
};

/* Clean computed title per alertType — overrides raw GAS/FCM title */
var _NRD_TITLES = {
  garage_approved:              'בקשת מוסך אושרה',
  garage_rejected:              'בקשת מוסך נדחתה',
  garage_appointment_set:       'תור נקבע במוסך',
  garage_appointment_cancelled: 'תור במוסך בוטל',
  plan:                         'תזכורת טיפול',
  maintenance_plan:             'תזכורת תחזוקה',
  overdue:                      'טיפול באיחור',
  urgent:                       'טיפול דחוף',
  maintenance_overdue:          'תחזוקה באיחור',
  maintenance_urgent:           'תחזוקה דחופה',
  km_update:                    'עדכון ק"מ נדרש',
  test_due:                     'תזכורת טסט רכב',
  test_urgent:                  'טסט רכב דחוף',
  fuel_high:                    'צריכת דלק גבוהה',
  fuel_km_high:                 'עלות ק"מ גבוהה'
};

/* Status pill per alertType — replaces category-based pill */
var _NRD_STATUS_PILL = {
  garage_approved:              { c:'nrd-pill-approved', t:'אושר' },
  garage_rejected:              { c:'nrd-pill-danger',   t:'נדחה' },
  garage_appointment_set:       { c:'nrd-pill-reminder', t:'תזכורת' },
  garage_appointment_cancelled: { c:'nrd-pill-danger',   t:'בוטל' },
  plan:                         { c:'nrd-pill-reminder', t:'תזכורת' },
  maintenance_plan:             { c:'nrd-pill-reminder', t:'תזכורת' },
  overdue:                      { c:'nrd-pill-danger',   t:'דחוף' },
  urgent:                       { c:'nrd-pill-danger',   t:'דחוף' },
  maintenance_overdue:          { c:'nrd-pill-danger',   t:'דחוף' },
  maintenance_urgent:           { c:'nrd-pill-danger',   t:'דחוף' },
  km_update:                    { c:'nrd-pill-reminder', t:'תזכורת' },
  test_due:                     { c:'nrd-pill-reminder', t:'תזכורת' },
  test_urgent:                  { c:'nrd-pill-danger',   t:'דחוף' },
  fuel_high:                    { c:'nrd-pill-warning',  t:'אזהרה' },
  fuel_km_high:                 { c:'nrd-pill-warning',  t:'אזהרה' }
};

/* SVG icons for detail rows (16px) */
var _NRD_ROW_ICONS = {
  car:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  calendar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  clock:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  garage:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  note:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  gauge:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12l4.5-4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  info:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  tag:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  text:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>',
  hourglass:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h14M5 22h14M17 2v4l-5 6 5 6v4M7 2v4l5 6-5 6v4"/></svg>',
  fuel:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 11h12"/><path d="M15 6h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h0v7a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V14"/></svg>',
  money:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>'
};

function _nrdAlehPlateHtml(num) {
  return '<span class="aleh-plate" dir="ltr">' +
    '<span class="aleh-plate-il">IL</span>' +
    '<span class="aleh-plate-num">' + _escHtml(formatPlate(num)) + '</span>' +
  '</span>';
}

/* Bucket a ts into today / yesterday / earlier. */
function _nrdGroupOf(ts) {
  var d = new Date(ts);
  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var startYesterday = startToday - 86400000;
  if (ts >= startToday) return 'today';
  if (ts >= startYesterday) return 'yesterday';
  return 'earlier';
}

/* Build detail rows for one notification. */
function _nrdDetailRows(n) {
  var type = n.alertType || 'plan';
  var rows = [];
  /* Helper: push a row with [iconKey, label, valueHtml] */
  var R = function(icon, label, valueHtml) {
    rows.push([icon, label, valueHtml]);
  };
  /* Helper: push a plain text value row.
     For KM/ל׳/ימים units, uses nrd-val-km so unit appears LEFT of number. */
  var _KM_UNITS = ['ק"מ', 'ל׳', 'ל׳/100ק"מ', 'ימים'];
  var V = function(icon, label, val, unit) {
    if (val == null || val === '') return;
    var valStr = String(val);
    var valHtml;
    if (unit && _KM_UNITS.indexOf(unit) >= 0) {
      /* Determine color for negative KM (overdue) */
      var numColor = (parseFloat(valStr) < 0) ? 'color:#f87171;' : '';
      valHtml = '<span class="nrd-row-value"><span class="nrd-val-km"><span class="nrdv" style="' + numColor + '">' + _escHtml(valStr) + '</span><span class="nrdu">' + _escHtml(unit) + '</span></span></span>';
    } else {
      valHtml = '<span class="nrd-row-value">' + _escHtml(valStr) + (unit ? ' ' + _escHtml(unit) : '') + '</span>';
    }
    R(icon, label, valHtml);
  };
  /* Vehicle always shown when available (not as chip — chips are in meta row) */
  if (n.vehicleId) R('car', 'רכב', _nrdAlehPlateHtml(n.vehicleId));

  switch (type) {
    case 'garage_approved':
      /* garageInfo and managerNote now rendered by _nrdBodySections */
      break;
    case 'garage_rejected':
      /* originalDescription, reasonLabel, managerNote now in _nrdBodySections */
      break;
    case 'garage_appointment_set':
      V('calendar', 'תאריך', n.appointmentDate);
      V('clock',    'שעה',   n.appointmentTime);
      if (n.garageInfo) { var _gs = typeof n.garageInfo === 'string' ? n.garageInfo : (n.garageInfo.name || n.garageInfo.garageName || ''); if (_gs) V('garage', 'מוסך', _gs); }
      break;
    case 'garage_appointment_cancelled':
      V('calendar', 'תאריך', n.appointmentDate);
      V('clock',    'שעה',   n.appointmentTime);
      if (n.garageInfo) { var _gc = typeof n.garageInfo === 'string' ? n.garageInfo : (n.garageInfo.name || n.garageInfo.garageName || ''); if (_gc) V('garage', 'מוסך', _gc); }
      break;
    case 'overdue': case 'urgent': case 'plan':
    case 'maintenance_overdue': case 'maintenance_urgent': case 'maintenance_plan':
      V('gauge',    'נותר',        n.kmLeft,  'ק"מ');
      V('gauge',    'הבא לטיפול', n.nextKm,  'ק"מ');
      V('gauge',    'צפי',         n.estKm,   'ק"מ');
      /* managerNote now in _nrdBodySections */
      break;
    case 'km_update':
      V('hourglass', 'ימים מאז עדכון', n.daysSinceUpdate, 'ימים');
      break;
    case 'test_due': case 'test_urgent':
      V('calendar', 'תאריך טסט', n.testDate);
      break;
    case 'fuel_high':
      V('fuel',  'צריכה',     n.fuelConsumption, 'ל׳/100ק"מ');
      V('gauge', 'סף',        n.threshold,       'ל׳');
      V('gauge', 'ממוצע צי',  n.fleetAverage,    'ל׳');
      break;
    case 'fuel_km_high':
      if (n.costPerKm != null && n.costPerKm !== '') R('money', 'עלות לק"מ', '<span class="nrd-row-value"><span dir="ltr">₪' + _escHtml(String(n.costPerKm)) + '</span></span>');
      if (n.fleetAverage != null && n.fleetAverage !== '') R('money', 'ממוצע צי', '<span class="nrd-row-value"><span dir="ltr">₪' + _escHtml(String(n.fleetAverage)) + '</span></span>');
      break;
  }

  if (!rows.length && type !== 'garage_appointment_set') return '';

  /* Build icon-tile rows */
  var _rowsHtml = rows.length ? '<div class="nrd-rows">' + rows.map(function(r) {
    var iconHtml = (_NRD_ROW_ICONS[r[0]] || '') ?
      '<div class="nrd-row-icon">' + _NRD_ROW_ICONS[r[0]] + '</div>' :
      '<div class="nrd-row-icon"></div>';
    return '<div class="nrd-detail-row">' + iconHtml +
      '<span class="nrd-row-label">' + r[1] + '</span>' + r[2] + '</div>';
  }).join('') + '</div>' : '';
  if (type === 'garage_appointment_set') {
    _rowsHtml += '<div class="nrd-rec">' +
      '<div class="nrd-rec-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div>' +
      '<div class="nrd-rec-text">ככל שתגיע למוסך מוקדם יותר — תצא מוקדם יותר<br>שעת הגעה מומלצת: <strong>07:30 בבוקר</strong></div>' +
    '</div>';
  }
  return _rowsHtml;
}

/* Action buttons HTML for one card. */
function _nrdCardActions(n) {
  var type = n.alertType || 'plan';
  var enc = encodeURIComponent(JSON.stringify(n || {}));
  var call = 'navigateForAlertType(\'' + type + '\',JSON.parse(decodeURIComponent(\'' + enc + '\')));event.stopPropagation()';
  var primary = '', secondary = '';
  var btn = function(label, blue) {
    return '<button class="nrd-btn nrd-btn-primary' + (blue ? ' blue' : '') + '" onclick="' + call + '">' + _escHtml(label) + '</button>';
  };
  var ghost = function(label, onclick) {
    return '<button class="nrd-btn nrd-btn-ghost" onclick="' + onclick + '">' + _escHtml(label) + '</button>';
  };
  var wazeClick = 'if(typeof _openGarageWaze===\'function\')_openGarageWaze();event.stopPropagation()';
  switch (type) {
    case 'garage_appointment_set':
      primary = btn('הוסף ליומן', true);
      secondary = ghost('ניווט למוסך', wazeClick); break;
    case 'garage_approved':
      primary = btn('קבע תור', true);
      secondary = ghost('פרטי מוסך', 'APP.nav(\'vehicle\');setTimeout(function(){APP.switchTab(\'garage\');},350);event.stopPropagation()'); break;
    case 'garage_rejected':
      primary = btn('פתח בקשה חדשה'); break;
    case 'garage_appointment_cancelled':
      primary = btn('קבע תור חדש'); break;
    case 'overdue': case 'urgent': case 'maintenance_overdue': case 'maintenance_urgent':
      primary = btn('קבע תור לטיפול במוסך'); break;
    case 'plan': case 'maintenance_plan':
      primary = btn('קבע תור לטיפול במוסך', true); break;
    case 'km_update':
      primary = btn('עדכן ק"מ', true); break;
    case 'test_due':
      primary = btn('בקרוב — מכוני טסט', true); break;
    case 'test_urgent':
      primary = '<button class="nrd-btn" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;animation:nrd-alarm-pulse 1s ease-in-out infinite;font-size:15px;font-weight:800;" onclick="' + call + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:6px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>קבע טסט עכשיו — דחוף!</button>'; break;
    case 'fuel_high':
      primary = btn('דוח צריכה'); break;
    case 'fuel_km_high':
      primary = btn('דוח עלויות'); break;
    default:
      primary = btn('פרטים', true); break;
  }
  return primary + secondary;
}

/* SVG icons for structured body sections */
var _NRD_BODY_ICONS = {
  note:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>',
  reject:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  garage:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  nodrive: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
};

function _nrdBodySections(n) {
  var type = n.alertType || 'plan';
  var parts = [];

  /* ── fault description (garage types with original description) ── */
  if (n.originalDescription && (type === 'garage_rejected' || type === 'garage_approved')) {
    parts.push(
      '<div class="nrd-fault">' +
        '<div class="nrd-fault-label">תיאור התקלה</div>' +
        '<div class="nrd-fault-text">' + _escHtml(n.originalDescription) + '</div>' +
      '</div>'
    );
  }

  /* ── garage block (approved / appointment types) ── */
  if (n.garageInfo && (type === 'garage_approved' || type === 'garage_appointment_set' || type === 'garage_appointment_cancelled')) {
    var gName = typeof n.garageInfo === 'string' ? n.garageInfo : (n.garageInfo.name || n.garageInfo.garageName || '');
    if (gName) {
      parts.push(
        '<div class="nrd-garage-block">' +
          '<div class="nrd-garage-icon-wrap">' + _NRD_BODY_ICONS.garage + '</div>' +
          '<div>' +
            '<div class="nrd-garage-name">' + _escHtml(gName) + '</div>' +
            '<div class="nrd-garage-sub">מוסך מורשה</div>' +
          '</div>' +
        '</div>'
      );
    }
  }

  /* ── rejection reason ── */
  if (n.reasonLabel && type === 'garage_rejected') {
    parts.push(
      '<div class="nrd-rejection">' +
        '<div class="nrd-rejection-icon">' + _NRD_BODY_ICONS.reject + '</div>' +
        '<div>' +
          '<div class="nrd-rejection-label">סיבת דחייה</div>' +
          '<div class="nrd-rejection-text">' + _escHtml(n.reasonLabel) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── manager note ── */
  if (n.managerNote) {
    parts.push(
      '<div class="nrd-note">' +
        '<div class="nrd-note-icon">' + _NRD_BODY_ICONS.note + '</div>' +
        '<div>' +
          '<div class="nrd-note-label">הערת מנהל</div>' +
          '<div class="nrd-note-text">' + _escHtml(n.managerNote) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ── KM hero box (plan / overdue / urgent) ── */
  if (n.kmLeft != null && (type === 'plan' || type === 'overdue' || type === 'urgent' ||
      type === 'maintenance_plan' || type === 'maintenance_overdue' || type === 'maintenance_urgent')) {
    var kmNum = parseInt(n.kmLeft, 10) || 0;
    var isNegKm = kmNum < 0;
    parts.push(
      '<div class="nrd-km-box' + (isNegKm ? ' km-overdue' : '') + '">' +
        '<div class="nrd-km-num-wrap">' +
          '<span class="nrd-km-number">' + Math.abs(kmNum).toLocaleString('he-IL') + '</span>' +
          '<span class="nrd-km-unit">ק"מ</span>' +
        '</div>' +
        '<div class="nrd-km-label">' + (isNegKm ? 'באיחור מהטיפול האחרון' : 'נותר עד הטיפול הבא') + '</div>' +
      '</div>'
    );
  }

  /* ── test_due countdown ring ── */
  if ((type === 'test_due' || type === 'test_urgent') && n.daysLeft != null) {
    var days = parseInt(n.daysLeft, 10) || 0;
    var isUrgent = (type === 'test_urgent');
    var maxDays = 30;
    var pct = Math.max(0, Math.min(1, days / maxDays));
    var r = isUrgent ? 34 : 26;
    var circ = 2 * Math.PI * r;
    var offset = circ * (1 - pct);
    var ringColor = isUrgent ? '#ef4444' : '#4aa8ff';

    if (isUrgent) {
      /* ── alarm ring for test_urgent ── */
      parts.push(
        '<div class="nrd-urgent-alarm">' +
          '<div class="nrd-alarm-right">' +
            '<div class="nrd-alarm-warning">⚠ הרכב לא יוכל לנסוע</div>' +
            '<div class="nrd-alarm-msg">ב-' + _escHtml(String(n.testDate || '')) + ' פג תוקף הטסט — יש לחדש מיידית</div>' +
          '</div>' +
          '<div class="nrd-alarm-ring">' +
            '<svg width="68" height="68" viewBox="0 0 68 68">' +
              '<circle cx="34" cy="34" r="' + r + '" fill="none" stroke="rgba(239,68,68,0.15)" stroke-width="5"/>' +
              '<circle cx="34" cy="34" r="' + r + '" fill="none" stroke="' + ringColor + '" stroke-width="5"' +
              ' stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"' +
              ' stroke-linecap="round"><animate attributeName="stroke-dashoffset" from="' + circ.toFixed(1) + '" to="' + offset.toFixed(1) + '" dur="0.8s" fill="freeze"/><animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite"/></circle>' +
            '</svg>' +
            '<div class="nrd-alarm-ring-num"><div class="d">' + days + '</div><div class="u">ימים</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="nrd-no-drive-warn">' +
          '<div class="nrd-no-drive-icon">' + _NRD_BODY_ICONS.nodrive + '</div>' +
          '<div class="nrd-no-drive-text">לאחר <strong>' + _escHtml(String(n.testDate || '')) + '</strong> הרכב אינו רשאי לנסוע על פי חוק ללא טסט תקף</div>' +
        '</div>'
      );
    } else {
      /* ── countdown ring for test_due ── */
      parts.push(
        '<div class="nrd-countdown">' +
          '<div class="nrd-cd-right">' +
            '<div class="nrd-cd-label">נותר לטסט</div>' +
            '<div class="nrd-cd-date" dir="ltr">' + _escHtml(String(n.testDate || '')) + '</div>' +
          '</div>' +
          '<div class="nrd-cd-ring">' +
            '<svg width="64" height="64" viewBox="0 0 64 64">' +
              '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="rgba(74,168,255,0.12)" stroke-width="4"/>' +
              '<circle cx="32" cy="32" r="' + r + '" fill="none" stroke="#4aa8ff" stroke-width="4"' +
              ' stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"' +
              ' stroke-linecap="round" opacity="0.85"><animate attributeName="stroke-dashoffset" from="' + circ.toFixed(1) + '" to="' + offset.toFixed(1) + '" dur="1.2s" fill="freeze"/></circle>' +
            '</svg>' +
            '<div class="nrd-cd-ring-num"><span>' + days + '</span><span class="nrd-cd-ring-sub">ימים</span></div>' +
          '</div>' +
        '</div>'
      );
    }
  }

  /* ── km_update — why it matters ── */
  if (type === 'km_update') {
    parts.push(
      '<div class="nrd-km-why">' +
        '<div class="nrd-km-why-icon">' + _NRD_BODY_ICONS.info + '</div>' +
        '<div class="nrd-km-why-text">עדכון ק״מ מאפשר לנו לחשב עם דיוק מלא את מועד הטיפול הבא, להתריע בזמן על חריגות, ולשמור על הרכב שלך במצב אופטימלי</div>' +
      '</div>'
    );
  }

  if (!parts.length) return '';
  return '<div class="nrd-body-sections">' + parts.join('') + '</div>';
}

function renderNotifHistory() {
  var container = document.getElementById('alerts-content');
  if (!container) return;

  var history = getNotifHistory();

  var old = document.getElementById('nrd-section');
  if (old) old.parentNode.removeChild(old);

  var section = document.createElement('div');
  section.id = 'nrd-section';

  var unread = history.filter(function(n) { return !n.read; });
  var read   = history.filter(function(n) { return  n.read; });
  var isUnreadTab = (_nrdActiveTab === 'unread');
  var displayList = isUnreadTab ? unread : read;

  var headHtml =
    '<div class="nrd-head">' +
      '<div class="nrd-head-top">' +
        '<div class="nrd-head-left">' +
          '<div class="nrd-head-title">התראות</div>' +
          '<div class="nrd-head-sub">' +
            '<span class="nrd-unread-badge' + (unread.length === 0 ? ' nrd-ub-zero' : '') + '">' +
              '<span class="nrd-ub-dot"></span>' +
              '<span class="nrd-ub-text">' + (unread.length > 0 ? unread.length + ' חדשות' : 'הכל נקרא') + '</span>' +
            '</span>' +
          '</div>' +
        '</div>' +
        (isUnreadTab && unread.length > 0 ?
          '<button class="nrd-markall" onclick="_nrdMarkAllRead()">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
            'סמן הכל כנקרא</button>' :
          (!isUnreadTab && read.length > 0 ?
            '<button class="nrd-markall danger" onclick="_nrdClearRead()">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
              'נקה נקראו</button>' : '')) +
      '</div>' +
      '<div class="nrd-tab-switch">' +
        '<button class="nrd-tab-sw-btn' + (isUnreadTab ? ' active' : '') + '" data-tab="unread" onclick="_nrdSetTab(\'unread\')">' +
          'חדשות <span class="nrd-tsw-count">' + unread.length + '</span></button>' +
        '<button class="nrd-tab-sw-btn' + (!isUnreadTab ? ' active' : '') + '" data-tab="read" onclick="_nrdSetTab(\'read\')">' +
          'נקראו <span class="nrd-tsw-count">' + read.length + '</span></button>' +
      '</div>' +
    '</div>';

  if (!displayList.length) {
    var emptyTitle = isUnreadTab ? 'אין התראות חדשות' : 'אין התראות שנקראו';
    section.innerHTML = headHtml +
      '<div class="nrd-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '<div class="nrd-empty-title">' + emptyTitle + '</div>' +
        '<div class="nrd-empty-sub">נעדכן אותך כשיהיה משהו חשוב</div>' +
      '</div>';
    container.innerHTML = '';
    container.appendChild(section);
    return;
  }

  var counts = { all: displayList.length, reminder: 0, approved: 0, info: 0 };
  displayList.forEach(function(n) {
    var cat = _nrdCategoryFor(n.alertType || 'plan');
    var bucket = (cat === 'reminder') ? 'reminder' : (cat === 'approved') ? 'approved' : 'info';
    counts[bucket]++;
  });

  var segHtml =
    '<div class="nrd-seg" id="nrd-seg">' +
      '<div class="nrd-seg-ind" id="nrd-seg-ind"></div>' +
      '<button class="nrd-seg-tab on" data-f="all">הכל <span class="nrd-seg-count">' + counts.all + '</span></button>' +
      '<button class="nrd-seg-tab" data-f="reminder">תזכורות <span class="nrd-seg-count">' + counts.reminder + '</span></button>' +
      '<button class="nrd-seg-tab" data-f="approved">אושרו <span class="nrd-seg-count">' + counts.approved + '</span></button>' +
      '<button class="nrd-seg-tab" data-f="info">מידע <span class="nrd-seg-count">' + counts.info + '</span></button>' +
    '</div>';

  var GROUPS = [ { k:'today', label:'היום' }, { k:'yesterday', label:'אתמול' }, { k:'earlier', label:'מוקדם יותר' } ];
  var grouped = { today: [], yesterday: [], earlier: [] };
  displayList.forEach(function(n, i) { grouped[_nrdGroupOf(n.ts || n.id || Date.now())].push({ n: n, i: i }); });

  var listHtml = '';
  GROUPS.forEach(function(g) {
    var items = grouped[g.k];
    if (!items.length) return;
    listHtml += '<div class="nrd-grp">' + g.label + '</div>';
    items.forEach(function(o) { listHtml += _nrdCardHtml(o.n, o.i); });
  });

  section.innerHTML = headHtml + segHtml + '<div class="nrd-list" id="nrd-list">' + listHtml + '</div>';
  container.innerHTML = '';
  container.appendChild(section);

  _nrdInitSwipe(section);
  _nrdInitSegmented(section);
}

function _nrdCardHtml(n, idx) {
  var type = n.alertType || 'plan';
  var cat  = _nrdCategoryFor(type);
  var safeId = String(n.id || n.ts || idx);
  var badgeCls = _NRD_BADGE_CLASS_BY_TYPE[type] || _NRD_BADGE_CLASS[cat];
  var iconKey  = _NRD_BADGE_ICON_BY_TYPE[type]  || _NRD_BADGE_ICON[cat];
  var dot      = _NRD_DOT_COLOR[cat] || '#bf5af2';
  /* Use computed clean title; fall back to raw n.title only if type unknown */
  var displayTitle = _NRD_TITLES[type] || _escHtml(n.title || 'עלה — התראה');
  /* Per-type status pill (not category-level) */
  var statusPill = _NRD_STATUS_PILL[type] || (_NRD_PILL[cat] || _NRD_PILL.info);
  var body = n.body || '';
  var detailRows = _nrdDetailRows(n);
  /* bodySections is called inline in the template */
  var actions = _nrdCardActions(n);

  /* Meta row: request number chip + date chip (appointment) + status pill */
  var metaChips = '';
  if (n.requestNumber) {
    metaChips += '<span class="nrd-req-chip">#' + _escHtml(String(n.requestNumber)) + '</span>';
  }
  if ((type === 'garage_appointment_set' || type === 'garage_appointment_cancelled') && n.appointmentDate) {
    metaChips += '<span class="nrd-date-chip"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>' + _escHtml(String(n.appointmentDate)) + '</span>';
  }
  metaChips += '<span class="nrd-pill ' + statusPill.c + '"><span class="nrd-pdot"></span>' + statusPill.t + '</span>';

  return '<div class="nrd-wrap" data-cat="' + cat + '" style="animation-delay:' + (idx * 0.05) + 's">' +
    '<div class="nrd-swipe-bg-left"><span class="nrd-swipe-label">מחק ✕</span></div>' +
    '<div class="nrd-swipe-bg-right"><span class="nrd-swipe-label">✓ נקרא</span></div>' +
    '<div class="nrd-card' + (type === 'test_urgent' ? ' nrd-test-urgent-card' : '') + '" data-id="' + safeId + '" data-type="' + type + '" onclick="_nrdToggleCard(this,event)">' +
      (n.read ? '' : '<span class="nrd-unread-dot" style="background:' + dot + '"></span>') +
      '<div class="nrd-swipe-hint">' + _NRD_ICONS.swipe + '</div>' +
      '<div class="nrd-card-top">' +
        '<div class="nrd-badge ' + badgeCls + '">' + _NRD_ICONS[iconKey] + '</div>' +
        '<div class="nrd-badge-meta">' +
          '<div class="nrd-row1">' +
            '<div class="nrd-c-title">' + displayTitle + '</div>' +
            '<div class="nrd-c-time">' + _notifTimeLabel(n.ts || n.id || Date.now()) + '</div>' +
          '</div>' +
          '<div class="nrd-meta-row">' + metaChips + '</div>' +
          (body ? '<div class="nrd-row2"><div class="nrd-c-snip">' + _escHtml(body) + '</div></div>' : '') +
        '</div>' +
        '<span class="nrd-chev">' + _NRD_ICONS.chev + '</span>' +
      '</div>' +
      '<div class="nrd-body"><div class="nrd-body-inner">' +
        '<div class="nrd-divider"></div>' +
        _nrdBodySections(n) +
        detailRows +
        actions +
      '</div></div>' +
    '</div>' +
  '</div>';
}

function _nrdToggleCard(card, ev) {
  if (ev && ev.target.closest && ev.target.closest('.nrd-btn')) return;
  card.classList.toggle('open');
}

/* Swipe: LEFT = delete (red), RIGHT = mark read (green), threshold 90px. */
function _nrdInitSwipe(root) {
  root.querySelectorAll('.nrd-wrap').forEach(function(wrap) {
    var card = wrap.querySelector('.nrd-card');
    if (!card) return;
    var startX = 0, startY = 0, dx = 0, dragging = false, locked = false;
    card.addEventListener('pointerdown', function(e) {
      startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; locked = false;
      try { card.setPointerCapture(e.pointerId); } catch(_) {}
      card.classList.remove('snapping');
    });
    card.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      var cx = e.clientX - startX, cy = e.clientY - startY;
      if (!locked) {
        if (Math.abs(cy) > Math.abs(cx) + 5) { dragging = false; return; }
        if (Math.abs(cx) > 8) locked = true; else return;
      }
      dx = cx;
      card.style.transform = 'translateX(' + Math.max(-130, Math.min(130, dx)) + 'px)';
      var bgL = wrap.querySelector('.nrd-swipe-bg-left');
      var bgR = wrap.querySelector('.nrd-swipe-bg-right');
      if (dx < 0) { bgL.style.opacity = Math.min(1, Math.abs(dx) / 90); bgR.style.opacity = 0; }
      else        { bgR.style.opacity = Math.min(1, dx / 90); bgL.style.opacity = 0; }
    });
    function release() {
      if (!dragging) return; dragging = false;
      card.classList.add('snapping');
      var id = card.getAttribute('data-id');
      if (dx < -90) {
        card.style.transform = 'translateX(-110%)';
        setTimeout(function() {
          wrap.classList.add('removing');
          setTimeout(function() {
            wrap.remove();
            if (typeof APP !== 'undefined' && APP.deleteNotif) APP.deleteNotif(id);
          }, 320);
        }, 160);
      } else if (dx > 90) {
        card.style.transform = 'translateX(0)';
        var d = wrap.querySelector('.nrd-unread-dot');
        if (d) d.style.display = 'none';
        wrap.querySelector('.nrd-swipe-bg-right').style.opacity = 0;
        _nrdMarkRead(id);
      } else {
        card.style.transform = 'translateX(0)';
        wrap.querySelector('.nrd-swipe-bg-left').style.opacity = 0;
        wrap.querySelector('.nrd-swipe-bg-right').style.opacity = 0;
      }
    }
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);
  });
}

/* Mark one notification read in localStorage history (best-effort). */
function _nrdMarkRead(id) {
  try {
    var list = getNotifHistory();
    var changed = false;
    list.forEach(function(n) {
      if (String(n.id || n.ts) === String(id) && !n.read) { n.read = true; changed = true; }
    });
    if (changed) {
      localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
      var unread = list.filter(function(n) { return !n.read; }).length;
      localStorage.setItem('driver_notif_unread', String(unread));
      _applyBadgeCount(unread);
      setTimeout(function() { if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory(); }, 220);
    }
  } catch(_) {}
}

/* Segmented control: spring indicator + filter. */
function _nrdInitSegmented(root) {
  var seg = root.querySelector('#nrd-seg');
  var ind = root.querySelector('#nrd-seg-ind');
  if (!seg || !ind) return;
  var tabs = [].slice.call(seg.querySelectorAll('.nrd-seg-tab'));
  function moveInd(tab) {
    ind.style.width = tab.offsetWidth + 'px';
    var segRect = seg.getBoundingClientRect();
    var tRect = tab.getBoundingClientRect();
    ind.style.transform = 'translateX(' + (-(segRect.right - tRect.right)) + 'px)';
  }
  function applyFilter(f) {
    root.querySelectorAll('.nrd-wrap').forEach(function(el) {
      var cat = el.getAttribute('data-cat');
      var bucket = (cat === 'reminder') ? 'reminder' : (cat === 'approved') ? 'approved' : 'info';
      el.style.display = (f === 'all' || bucket === f) ? '' : 'none';
    });
    root.querySelectorAll('.nrd-grp').forEach(function(g) {
      var sib = g.nextElementSibling, any = false;
      while (sib && !sib.classList.contains('nrd-grp')) {
        if (sib.classList.contains('nrd-wrap') && sib.style.display !== 'none') { any = true; break; }
        sib = sib.nextElementSibling;
      }
      g.style.display = any ? '' : 'none';
    });
  }
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('on'); });
      tab.classList.add('on');
      moveInd(tab);
      applyFilter(tab.getAttribute('data-f'));
    });
  });
  requestAnimationFrame(function() { moveInd(tabs[0]); });
  setTimeout(function() { moveInd(tabs[0]); }, 60);
}

function renderAlerts() {
  const container = document.getElementById('alerts-content');
  const empty = document.getElementById('alerts-empty');
  var _ac = document.getElementById('alerts-count');
  if (_ac) _ac.textContent = STATE.alerts.length + ' התראות';

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

/* ══ Insurance Tab ══ */
function _insGetStatus(dateStr) {
  if (!dateStr) return 'expired';
  var d = new Date(dateStr);
  var now = new Date();
  if (d < now) return 'expired';
  var diffDays = Math.floor((d - now) / 86400000);
  if (diffDays <= 30) return 'expiring';
  return 'valid';
}

function _insStatusLabel(status) {
  if (status === 'expired')  return 'פג תוקף';
  if (status === 'expiring') return 'פג בקרוב';
  return 'בתוקף';
}

function _insCheckRenewed(key, currentExp) {
  var storageKey = '_prevIns_' + key;
  var prev = localStorage.getItem(storageKey) || '';
  var isRenewed = false;
  if (currentExp && prev && currentExp !== prev && new Date(currentExp) > new Date(prev)) {
    isRenewed = true;
    var tsKey = '_insRenewedTs_' + key;
    if (!localStorage.getItem(tsKey)) {
      localStorage.setItem(tsKey, Date.now().toString());
    }
  }
  if (currentExp) localStorage.setItem(storageKey, currentExp);
  var renewedTs = parseInt(localStorage.getItem('_insRenewedTs_' + key) || '0', 10);
  if (renewedTs && Date.now() - renewedTs < 86400000) return true;
  localStorage.removeItem('_insRenewedTs_' + key);
  return false;
}

function _insDetailRow(iconHref, iconColor, label, valueId, valueText, extraClass) {
  var cls = extraClass ? ' ' + extraClass : '';
  return '<div class="ins-detail-row">' +
    '<div class="ins-detail-icon"><svg width="18" height="18"><use href="' + iconHref + '" color="' + iconColor + '"/></svg></div>' +
    '<div class="ins-detail-body">' +
      '<div class="ins-detail-label">' + label + '</div>' +
      '<div class="ins-detail-value' + cls + '"' + (valueId ? ' id="' + valueId + '"' : '') + '>' + (valueText || '—') + '</div>' +
    '</div>' +
  '</div>';
}

function _insToggleSection(id) {
  var body = document.getElementById(id);
  var icon = document.getElementById(id + '-chevron');
  if (!body) return;
  var isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
  body.style.maxHeight = isOpen ? '0px' : '2000px';
  body.style.overflow = 'hidden';
  body.style.transition = 'max-height 0.35s ease';
  if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}
window._insToggleSection = _insToggleSection;

function _sanitizeForDriver(text) {
  if (!text) return '';
  return String(text)
    .replace(/₪[\d,\s]+/g, '')
    .replace(/[\d,]+\s*₪/g, '')
    .replace(/[\d,]+\s*שקל[ים]*/g, '')
    .replace(/פרמי[הת][^\.،؛\n]*/g, '')
    .replace(/עלות ביטוח[^\.،؛\n]*/g, '')
    .replace(/תעריף[^\.،؛\n]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _insDeductibleWarningHtml(amount) {
  return '<div class="ins-deduct-warn">' +
    '<div class="ins-deduct-warn-head">' +
      '<div class="ins-deduct-warn-icon">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/>' +
          '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
        '</svg>' +
      '</div>' +
      '<div class="ins-deduct-warn-title">⚠ השתתפות עצמית: ' + amount + '</div>' +
    '</div>' +
    '<div class="ins-deduct-warn-body">' +
      'כל נזק שייגרם לרכב יחייב תשלום עצמי של ' + amount + ' — ללא קשר לגובה הנזק. נהג בזהירות, שמור על רכב העמותה ועל כספי הציבור.' +
    '</div>' +
    '<div class="ins-deduct-warn-footer">ביטוח אינו פטור מאחריות</div>' +
  '</div>';
}

/* ── Insurance policy cache (localStorage, 24h TTL) ── */
var _INS_CACHE_KEY = 'ins:v2:policy';
var _INS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function _insCacheSet(comp, full) {
  try {
    localStorage.setItem(_INS_CACHE_KEY, JSON.stringify({
      comp: comp, full: full, ts: Date.now()
    }));
  } catch(e) {}
}

function _insCacheGet() {
  try {
    var raw = localStorage.getItem(_INS_CACHE_KEY);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (!obj || Date.now() - (obj.ts || 0) > _INS_CACHE_TTL) { localStorage.removeItem(_INS_CACHE_KEY); return null; }
    return obj;
  } catch(e) { return null; }
}

/* ── Tier 1 router — answer driver questions locally without calling AI ── */
function _insTier1Answer(question, comp, full) {
  if (!question) return null;
  var q = question.trim().toLowerCase();
  var s = comp || {};
  var f = full || {};

  function _yn(flag) { return flag ? 'כן, מכוסה' : 'לא מכוסה'; }
  function _agentSection(sec, label) {
    var lines = [];
    if (sec.agentName)  lines.push('שם הסוכן: ' + sec.agentName);
    if (sec.agentPhone) lines.push('טלפון: ' + sec.agentPhone);
    if (sec.agentEmail) lines.push('אימייל: ' + sec.agentEmail);
    return lines.length ? label + ':\n' + lines.join('\n') : '';
  }

  // ── Agent / contact ──
  if (/סוכן|סוכנ|agent|ביטוח.*מי|מי.*ביטוח|יצור קשר|ליצור קשר/.test(q)) {
    var parts = [];
    var compAgent = _agentSection(s, 'ביטוח חובה');
    var fullAgent = _agentSection(f, 'ביטוח מקיף');
    if (compAgent) parts.push(compAgent);
    if (fullAgent) parts.push(fullAgent);
    return parts.length ? parts.join('\n\n') : null;
  }

  // ── Towing ──
  if (/גרירה|גרר|תקוע|תקע/.test(q)) {
    // Check top-level v2.0 fields first, then fall back to coverages array
    var towProvider = f.towingProvider || s.towingProvider || '';
    var towPhone    = f.towingPhone    || s.towingPhone    || '';
    if (!towProvider && f.coverages) {
      var tc = f.coverages.find(function(c){ return c.name && c.name.indexOf('גרירה') >= 0; });
      if (tc) { towProvider = tc.provider || ''; towPhone = tc.phone || ''; }
    }
    if (!towProvider && s.coverages) {
      var tc2 = s.coverages.find(function(c){ return c.name && c.name.indexOf('גרירה') >= 0; });
      if (tc2) { towProvider = tc2.provider || ''; towPhone = tc2.phone || ''; }
    }
    var hasTow = f.hasTowing || s.hasTowing || !!towProvider;
    if (!hasTow) return null;
    var ans = 'גרירה מכוסה';
    if (towProvider) ans += ' — ספק: ' + towProvider;
    if (towPhone)    ans += ' | טלפון: ' + towPhone;
    return ans;
  }

  // ── Mirrors ──
  if (/מראה|מראות/.test(q)) {
    return _yn(f.hasMirrors || s.hasMirrors) + ' (מראות)';
  }

  // ── Glass / windshield ──
  if (/שמש|שמשה|זגוגי|windshield|שמשות/.test(q)) {
    var wdCov = null;
    if (f.coverages) wdCov = f.coverages.find(function(c){ return c.name && (c.name.indexOf('שמש') >= 0 || c.name.indexOf('זגוג') >= 0); });
    if (!wdCov && s.coverages) wdCov = s.coverages.find(function(c){ return c.name && (c.name.indexOf('שמש') >= 0 || c.name.indexOf('זגוג') >= 0); });
    if (!wdCov && !f.hasGlass && !s.hasGlass) return null;
    var wdProv = wdCov && wdCov.provider ? wdCov.provider : '';
    var wdPhone = wdCov && wdCov.phone ? wdCov.phone : '';
    return 'שמשות מכוסות' + (wdProv ? ' — ספק: ' + wdProv + (wdPhone ? ' (' + wdPhone + ')' : '') : '');
  }

  // ── Headlights ──
  if (/פנס|פנסים|תאורה/.test(q)) {
    var hlCov = null;
    if (f.coverages) hlCov = f.coverages.find(function(c){ return c.name && c.name.indexOf('פנס') >= 0; });
    if (!hlCov && !f.hasHeadlights && !s.hasHeadlights) return null;
    return 'פנסים מכוסים' + (hlCov && hlCov.provider ? ' — ספק: ' + hlCov.provider : '');
  }

  // ── Theft ──
  if (/גניב|גנוב|נגנב/.test(q)) {
    var theftCov = null;
    if (f.coverages) theftCov = f.coverages.find(function(c){ return c.name && c.name.indexOf('גניב') >= 0; });
    if (!theftCov && !f.hasTheft && !s.hasTheft) return null;
    return 'גניבה מכוסה';
  }

  // ── Replacement car ──
  if (/רכב חלופי|רכב חליפי|חלופי|תחליף/.test(q)) {
    var hasR = f.hasReplacementCar || s.hasReplacementCar;
    if (!hasR) return 'רכב חלופי לא מכוסה בפוליסה זו';
    var days = f.replacementCarDays || s.replacementCarDays;
    return 'רכב חלופי מכוסה' + (days ? ' — עד ' + days + ' ימים' : '');
  }

  // ── Territory ──
  if (/טריטוריה|אזור כיסוי|מחוץ|חו"ל|סיני|שטחים/.test(q)) {
    var terr = f.territory || s.territory;
    return terr ? 'אזור כיסוי: ' + terr : null;
  }

  // ── Claims phone ──
  if (/תאונה.*מי|מה.*תאונה|לדווח|לדיווח|תביעה.*טלפון/.test(q)) {
    var cp = f.claimsPhone || s.claimsPhone;
    return cp ? 'לדיווח תאונה: ' + cp : null;
  }

  // ── Driver requirements / age ──
  if (/גיל|ותק|דרישות נהג|מינימ/.test(q)) {
    var dr = f.driverRequirements || s.driverRequirements;
    var age = f.minDriverAge || s.minDriverAge;
    var exp = f.minDrivingExperience || s.minDrivingExperience;
    if (!dr && !age && !exp) return null;
    var rParts = [];
    if (age) rParts.push('גיל מינימלי: ' + age);
    if (exp) rParts.push('ותק נהיגה: ' + exp + ' חודשים');
    return (dr || rParts.join(', ')) || null;
  }

  // ── Deductible ──
  if (/השתתפות|השתתפ|deductible/.test(q)) {
    var ded = typeof f.deductible === 'number' ? f.deductible : null;
    if (ded === null) return null;
    return ded === 0 ? 'אין השתתפות עצמית' : 'השתתפות עצמית: ₪' + ded.toLocaleString('he-IL');
  }

  // ── Dates ──
  if (/תוקף|מתי פג|פקיעה|תאריך/.test(q)) {
    var endDate = f.endDate || s.endDate;
    return endDate ? 'תוקף הביטוח: עד ' + endDate : null;
  }

  return null; // no local answer — fall through to AI
}

/* ── Vehicle License helpers ── */
function _parseFlexibleDate(raw) {
  if (!raw) return null;
  var s = String(raw).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  return null;
}

function _formatDateHe(d) {
  if (!d) return '—';
  var day = d.getDate(), month = d.getMonth()+1, year = d.getFullYear();
  return (day < 10 ? '0'+day : day) + '/' + (month < 10 ? '0'+month : month) + '/' + year;
}

function renderLicenseSection() {
  var v = STATE.vehicle || {};
  var raw = v.licExp || '';
  var licLink = v.licLink || '';
  var plateNum = v.num || '';

  var expDate = _parseFlexibleDate(raw);
  var now = new Date();
  var status = 'unknown';
  var daysLeft = null;
  if (expDate) {
    daysLeft = Math.floor((expDate - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) status = 'expired';
    else if (daysLeft <= 60) status = 'expiring';
    else status = 'valid';
  }

  var expFormatted = expDate ? _formatDateHe(expDate) : '—';
  var statusLabels = { valid: 'בתוקף', expiring: 'פג בקרוב', expired: 'פג תוקף', unknown: 'לא ידוע' };
  var chipHtml = '<div class="ins-status ' + status + '"><div class="ins-status-dot"></div>' + (statusLabels[status] || status) + '</div>';

  var daysNote = '';
  if (status === 'expiring' && daysLeft !== null) daysNote = ' (' + daysLeft + ' יום)';
  if (status === 'expired' && daysLeft !== null) daysNote = ' (' + Math.abs(daysLeft) + ' ימים)';

  var detailsHtml =
    '<div class="ins-detail-list">' +
    (plateNum
      ? '<div class="ins-detail-row">' +
          '<div class="ins-detail-icon ins-row-icon"><svg width="18" height="18"><use href="#ic-car" color="#06b6d4"/></svg></div>' +
          '<div class="ins-detail-body"><div class="ins-detail-label">מספר רכב</div><div class="ins-detail-value">' + plateNum + '</div></div>' +
        '</div>'
      : '') +
    '<div class="ins-detail-row">' +
      '<div class="ins-detail-icon ins-row-icon"><svg width="18" height="18"><use href="#ic-cal" color="' + (status === 'valid' ? '#22c55e' : '#f87171') + '"/></svg></div>' +
      '<div class="ins-detail-body"><div class="ins-detail-label">תוקף הרישיון</div><div class="ins-detail-value' + (status !== 'valid' && status !== 'unknown' ? ' ' + status : '') + '">' + expFormatted + daysNote + '</div></div>' +
    '</div>' +
    '</div>';

  var ctaHtml = licLink
    ? '<div class="ins-cta-row">' +
        '<a href="' + licLink + '" target="_blank" class="ins-cta-btn lic-primary">' +
          '<span class="ins-cta-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>' +
          'הצג רישיון רכב' +
        '</a>' +
      '</div>'
    : '';

  return (
    '<div class="ins-section">' +
      '<div class="ins-section-header lic" onclick="_insToggleSection(\'ins-lic-body\')" style="cursor:pointer">' +
        '<div class="ins-shield-icon lic">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h6M7 16h4"/>' +
          '</svg>' +
        '</div>' +
        '<div class="ins-section-titles">' +
          '<div class="ins-section-title lic">רישיון רכב</div>' +
          '<div class="ins-section-subtitle">Vehicle Registration</div>' +
        '</div>' +
        chipHtml +
        '<span id="ins-lic-body-chevron" style="margin-right:auto;font-size:18px;transition:transform 0.3s;color:rgba(255,255,255,0.6)">▼</span>' +
      '</div>' +
      '<div id="ins-lic-body" style="max-height:2000px;overflow:hidden;transition:max-height 0.35s ease;">' +
        detailsHtml +
        ctaHtml +
      '</div>' +
    '</div>'
  );
}

function renderInsuranceTab() {
  var v = STATE.vehicle || {};
  var stateIns = (STATE.insurance && STATE.insurance.length) ? STATE.insurance[0] : null;
  var syncCompany = stateIns ? (stateIns.company || '') : '';
  var syncYear    = stateIns ? (stateIns.year    || '') : '';
  var syncSubtitle = syncCompany ? (syncCompany + (syncYear ? ' · ' + syncYear : '')) : '';
  var fallbackCompany = syncCompany || '—';

  var compExp  = v.insCompExp || '';
  var fullExp  = v.insFullExp || '';

  var compStatus  = _insGetStatus(compExp);
  var fullStatus  = _insGetStatus(fullExp);
  var compRenewed = _insCheckRenewed('comp', compExp);
  var fullRenewed = _insCheckRenewed('full', fullExp);

  var compExpFormatted = compExp ? formatDate(compExp) : '—';
  var fullExpFormatted = fullExp ? formatDate(fullExp) : '—';

  function statusChip(status, renewed) {
    var badge = renewed ? '<span class="ins-renewed-badge">✓ חודש!</span>' : '';
    return badge + '<div class="ins-status ' + status + '"><div class="ins-status-dot"></div>' + _insStatusLabel(status) + '</div>';
  }

  function detailRow(iconHref, iconColor, label, valueId, valueText, extraClass, animDelay) {
    var cls = extraClass ? ' ' + extraClass : '';
    var valHtml = valueId
      ? '<div class="ins-detail-value' + cls + '" id="' + valueId + '">' + (valueText || '—') + '</div>'
      : '<div class="ins-detail-value' + cls + '">' + (valueText || '—') + '</div>';
    var delayStyle = (typeof animDelay === 'number') ? ' style="animation-delay:' + animDelay + 's"' : '';
    return '<div class="ins-detail-row">' +
      '<div class="ins-detail-icon ins-row-icon"' + delayStyle + '><svg width="18" height="18"><use href="' + iconHref + '" color="' + iconColor + '"/></svg></div>' +
      '<div class="ins-detail-body"><div class="ins-detail-label">' + label + '</div>' + valHtml + '</div>' +
      '</div>';
  }

  var chevronHtml = '<span style="margin-right:auto;font-size:18px;transition:transform 0.3s;color:rgba(255,255,255,0.6)">▼</span>';
  function chevron(id) {
    return '<span id="' + id + '-chevron" style="margin-right:auto;font-size:18px;transition:transform 0.3s;color:rgba(255,255,255,0.6)">▼</span>';
  }

  /* ── ביטוח חובה ── */
  /* NOTE: חובה (liability) has NO deductible in Israel and NO min driver age — skip those rows entirely */
  var compSection =
    '<div class="ins-section">' +
      '<div class="ins-section-header comp" onclick="_insToggleSection(\'ins-comp-body\')" style="cursor:pointer">' +
        '<div class="ins-shield-icon comp"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
        '<div class="ins-section-titles"><div class="ins-section-title comp">ביטוח חובה</div><div class="ins-section-subtitle">' + (syncSubtitle || 'Third-Party Liability') + '</div></div>' +
        statusChip(compStatus, compRenewed) +
        chevron('ins-comp-body') +
      '</div>' +
      '<div id="ins-comp-body" style="max-height:2000px;overflow:hidden;transition:max-height 0.35s ease;">' +
        '<div class="ins-detail-list">' +
          detailRow('#ic-shield', '#0ea5e9', 'חברת ביטוח',         'ins-comp-company',  fallbackCompany, '', 0) +
          detailRow('#ic-hash',   '#64748b', 'מספר פוליסה',         'ins-comp-policy',   '<span class="ins-skeleton ins-skeleton-text"></span>', '', 0.3) +
          detailRow('#ic-cal',    compStatus === 'valid' ? '#22c55e' : '#f87171', 'תוקף הביטוח', null, compExpFormatted, compStatus !== 'valid' ? compStatus : '', 0.6) +
          detailRow('#ic-user',   '#64748b', 'שם סוכן',             'ins-comp-agent-name',  '<span class="ins-skeleton ins-skeleton-text"></span>', '', 0.9) +
          detailRow('#ic-user',   '#64748b', 'טלפון סוכן',           'ins-comp-agent-phone', '<span class="ins-skeleton ins-skeleton-text"></span>', '', 1.2) +
        '</div>' +
        '<div class="ins-cta-row" id="ins-comp-cta"></div>' +
      '</div>' +
    '</div>';

  /* ── ביטוח מקיף ── */
  var fullSection =
    '<div class="ins-section">' +
      '<div class="ins-section-header full" onclick="_insToggleSection(\'ins-full-body\')" style="cursor:pointer">' +
        '<div class="ins-shield-icon full"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg></div>' +
        '<div class="ins-section-titles"><div class="ins-section-title full">ביטוח מקיף</div><div class="ins-section-subtitle">' + (syncSubtitle || 'Comprehensive Coverage') + '</div></div>' +
        statusChip(fullStatus, fullRenewed) +
        chevron('ins-full-body') +
      '</div>' +
      '<div id="ins-full-body" style="max-height:2000px;overflow:hidden;transition:max-height 0.35s ease;">' +
        '<div class="ins-detail-list">' +
          detailRow('#ic-shield', '#f59e0b', 'חברת ביטוח',         'ins-full-company',  fallbackCompany, '', 0) +
          detailRow('#ic-hash',   '#64748b', 'מספר פוליסה',         'ins-full-policy',   '<span class="ins-skeleton ins-skeleton-text"></span>', '', 0.3) +
          detailRow('#ic-cal',    fullStatus === 'valid' ? '#22c55e' : '#f87171', 'תוקף הביטוח', null, fullExpFormatted, fullStatus !== 'valid' ? fullStatus : '', 0.6) +
          detailRow('#ic-user',   '#64748b', 'גיל מינימום לנהיגה',  'ins-full-minage',   '<span class="ins-skeleton ins-skeleton-text"></span>', '', 0.9) +
          detailRow('#ic-star',   '#64748b', 'השתתפות עצמית',       'ins-full-deduct',   '<span class="ins-skeleton ins-skeleton-text"></span>', '', 1.2) +
          detailRow('#ic-user',   '#64748b', 'שם סוכן',             'ins-full-agent-name',  '<span class="ins-skeleton ins-skeleton-text"></span>', '', 1.5) +
          detailRow('#ic-user',   '#64748b', 'טלפון סוכן',           'ins-full-agent-phone', '<span class="ins-skeleton ins-skeleton-text"></span>', '', 1.8) +
        '</div>' +
        '<div id="ins-deductible-warning" style="display:none"></div>' +
      '<div class="ins-services-divider"><span class="ins-services-label">שירותים כלולים בפוליסה</span></div>' +
      '<div class="ins-chips" id="ins-full-chips">' +
        '<div class="ins-chip full-chip" onclick="APP.openHelpMenu();setTimeout(function(){APP.helpTowing();},350)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>גרירה</div>' +
        '<div class="ins-chip full-chip" onclick="APP.openHelpMenu();setTimeout(function(){APP.helpWindshield();},350)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></svg>שמשות</div>' +
        '<div class="ins-chip full-chip" id="ins-rental-chip" style="display:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v9a2 2 0 0 1-2 2h-2"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>רכב חלופי</div>' +
      '</div>' +
      /* Towing card */
      '<div class="ins-service-card">' +
        '<div class="ins-service-card-header">' +
          '<div class="ins-service-card-icon towing"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>' +
          '<div><div class="ins-service-card-title">שירות גרירה</div><div class="ins-service-card-sub" id="ins-towing-detail">שירות גרירה 24/7</div></div>' +
        '</div>' +
        '<div class="ins-service-card-body">' +
          '<button class="ins-service-action-btn towing-btn" id="ins-towing-btn" onclick="APP.openHelpMenu();setTimeout(function(){APP.helpTowing();},350)">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
            'צור קשר עם שגריר' +
          '</button>' +
        '</div>' +
      '</div>' +
      /* Windshield card */
      '<div class="ins-service-card">' +
        '<div class="ins-service-card-header">' +
          '<div class="ins-service-card-icon glass"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></svg></div>' +
          '<div><div class="ins-service-card-title">שירות שמשות</div><div class="ins-service-card-sub" id="ins-wd-sub">שירות החלפת שמשות</div></div>' +
        '</div>' +
        '<div class="ins-service-card-body">' +
          '<button class="ins-service-action-btn glass-btn" onclick="APP.openHelpMenu();setTimeout(function(){APP.helpWindshield();},350)">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><rect x="9" y="14" width="6" height="7"/></svg>' +
            'פתח תביעת שמשה' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div id="ins-full-cta-placeholder"></div>' +
      '</div>' /* close #ins-full-body */ +
    '</div>';

  setTimeout(function() { _loadInsuranceDetails(); }, 80);

  var skeletonCss =
    '<style>' +
      '.ins-skeleton{display:inline-block;background:linear-gradient(90deg,rgba(148,163,184,0.12) 0%,rgba(148,163,184,0.28) 50%,rgba(148,163,184,0.12) 100%);background-size:200% 100%;border-radius:6px;animation:insSkelShimmer 1.2s ease-in-out infinite;vertical-align:middle}' +
      '.ins-skeleton-text{width:90px;height:14px}' +
      '@keyframes insSkelShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
    '</style>';

  var errorBanner = '<div id="ins-load-error" style="display:none;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#fca5a5;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:12px;direction:rtl;text-align:center;"></div>';

  var aiSection =
    '<div class="ins-ai-card" id="ins-ai-card" style="margin:0 0 14px;background:linear-gradient(135deg,rgba(124,58,237,0.15),rgba(109,40,217,0.08));border:1px solid rgba(124,58,237,0.25);border-radius:16px;padding:14px 16px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<div class="ins-ai-spark-icon" style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '</div>' +
        '<span style="font-size:13px;font-weight:800;color:#c4b5fd;letter-spacing:0.3px">שאל AI על הביטוח שלך</span>' +
      '</div>' +
      '<div id="ins-ai-text" style="font-size:13px;color:#cbd5e1;line-height:1.6;font-weight:500;margin-bottom:10px;display:none"></div>' +
      '<div class="ins-ai-questions">' +
        '<button class="ins-ai-q-chip" onclick="_insAskAI(\'מה כלול בביטוח שלי?\')">מה כלול בביטוח שלי?</button>' +
        '<button class="ins-ai-q-chip" onclick="_insAskAI(\'מה ההשתתפות העצמית?\')">מה ההשתתפות העצמית?</button>' +
        '<button class="ins-ai-q-chip" onclick="_insAskAI(\'האם יש גרירה?\')">האם יש גרירה?</button>' +
      '</div>' +
      '<div class="ins-ai-input-row">' +
        '<input id="ins-ai-input" type="text" placeholder="שאל שאלה על הביטוחים..." onkeydown="if(event.key===\'Enter\'){_insAskAI();}"/>' +
        '<button class="ins-ai-ask-btn" onclick="_insAskAI()">שאל</button>' +
      '</div>' +
      '<div id="ins-ai-response"></div>' +
    '</div>';

  return '<div class="ins-wrap">' + skeletonCss + errorBanner + renderLicenseSection() + compSection + fullSection + aiSection + '</div>';
}

function _insShowError(msg) {
  var el = document.getElementById('ins-load-error');
  if (!el) return;
  el.textContent = msg || 'לא ניתן לטעון נתוני ביטוח';
  el.style.display = 'block';
}

async function _loadGarageDetails() {
  try {
    var v = STATE.vehicle || {};
    var g = v.garage || {};
    if (!g.googlePlaceId) return;

    var res = null;
    try {
      res = await gasPost('get_place_status', { placeId: g.googlePlaceId }, { silent: true });
    } catch(e1) {
      console.warn('[_loadGarageDetails] network error:', e1 && e1.message);
      return;
    }
    if (!res || !res.ok) {
      console.warn('[_loadGarageDetails] API not ok:', res);
      return;
    }

    var isOpen   = (typeof res.isOpen === 'boolean') ? res.isOpen : null;
    /* openingHours comes from the stored garage record, not from get_place_status
       (which only returns isOpen/todayHours). Use STATE.vehicle.garage.openingHours. */
    var v2 = STATE.vehicle || {};
    var g2 = v2.garage || {};
    var hoursStr = g2.openingHours || '';

    /* Status chip */
    var chip = document.getElementById('gar-status-chip');
    if (chip) {
      if (isOpen === true) {
        chip.className = 'gar-status-chip open';
        chip.innerHTML = '<span class="gar-status-dot"></span>פתוח כעת';
      } else if (isOpen === false) {
        chip.className = 'gar-status-chip closed';
        chip.innerHTML = '<span class="gar-status-dot"></span>סגור כעת';
      } else {
        chip.style.display = 'none';
      }
    }

    /* Hours body */
    var hoursBody   = document.getElementById('gar-hours-body');
    var hoursToggle = document.getElementById('gar-hours-toggle');
    if (hoursBody) {
      if (hoursStr && hoursStr.trim()) {
        var dayNames  = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        var todayName = dayNames[new Date().getDay()];
        var lines     = hoursStr.split('\n').filter(function(l){ return l && l.trim(); });
        var todayHtml = '';
        var rowsHtml  = '';
        lines.forEach(function(line) {
          var clean   = String(line).replace(/</g,'&lt;').replace(/>/g,'&gt;');
          var isToday = clean.indexOf(todayName) !== -1;
          var rowHtml = '<div class="gar-hours-row' + (isToday ? ' today' : '') + '">' + clean + '</div>';
          if (isToday) todayHtml = rowHtml;
          rowsHtml += rowHtml;
        });
        /* Hoist today to top */
        if (todayHtml) rowsHtml = todayHtml + rowsHtml.replace(todayHtml, '');
        hoursBody.innerHTML = rowsHtml;
        /* Auto-open toggle so driver always sees hours */
        if (hoursToggle) hoursToggle.setAttribute('open', '');
      } else {
        if (hoursToggle) hoursToggle.style.display = 'none';
      }
    }
  } catch(e) {
    console.error('[_loadGarageDetails] exception:', e && e.message);
  }
}

async function _loadInsuranceDetails() {
  try {
    var res = await gasPost('get_vehicle_insurance_details', {}, { silent: true });
    if (!res || !res.ok) {
      var errMsg = res && res.error ? res.error : 'שגיאת שרת';
      console.error('[_loadInsuranceDetails] API error:', errMsg, res);
      _insShowError('שגיאה בטעינת נתוני ביטוח: ' + errMsg);
      return;
    }
    try {
      console.log('[_loadInsuranceDetails] res:', JSON.stringify(res).substring(0, 600));
      if (res._debug) console.table(res._debug);
    } catch(_) {}

    var comp = res.comp || null;
    var full = res.full || null;

    if (!comp && !full) {
      // Only show error banner if STATE also has no sync data — otherwise sync data is already visible
      var hasSyncData = (STATE.vehicle && (STATE.vehicle.insCompExp || STATE.vehicle.insFullExp)) ||
                        (STATE.insurance && STATE.insurance.length);
      if (!hasSyncData) {
        _insShowError('לא נמצאו נתוני ביטוח לרכב זה');
      } else {
        console.warn('[_loadInsuranceDetails] API returned null sections — showing sync STATE data only. Check GAS logs for _debug.');
      }
      return;
    }

    comp = comp || {};
    full = full || {};

    // Cache for Tier 1 router
    _insCacheSet(comp, full);

    function _setText(id, text) {
      var el = document.getElementById(id);
      if (el && text !== null && typeof text !== 'undefined' && String(text) !== '') el.textContent = String(text);
    }
    function _setHtml(id, html) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }
    /* Hide a detail row whose async value came back empty — removes lingering skeletons */
    function _hideEmptyRow(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var row = el.closest ? el.closest('.ins-detail-row') : null;
      if (row) row.style.display = 'none';
    }

    /* ── ביטוח חובה ── */
    if (comp.company)      _setText('ins-comp-company', comp.company);
    if (comp.policyNumber) _setText('ins-comp-policy',  comp.policyNumber);
    else                   _hideEmptyRow('ins-comp-policy');
    if (comp.agentName)    _setText('ins-comp-agent-name',  comp.agentName);
    else                   _hideEmptyRow('ins-comp-agent-name');
    if (comp.agentPhone)   _setText('ins-comp-agent-phone', comp.agentPhone);
    else                   _hideEmptyRow('ins-comp-agent-phone');

    /* CTA for חובה: view policy + call company */
    var compCtaEl = document.getElementById('ins-comp-cta');
    if (compCtaEl) {
      var compFileLink = comp.fileLink || (STATE.vehicle && STATE.vehicle.insCompLink) || '';
      var compCtaHtml = '';
      if (compFileLink) {
        compCtaHtml += '<a class="ins-cta-btn ghost" href="' + compFileLink + '" target="_blank" rel="noopener">' +
            '<span class="ins-cta-icon">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
            '</span>' +
            'הצג פוליסה</a>';
      }
      if (comp.agentPhone) {
        var compPhoneClean = String(comp.agentPhone).replace(/[^0-9+]/g,'');
        compCtaHtml += '<button class="ins-cta-btn primary" onclick="window.open(\'tel:' + compPhoneClean + '\')">' +
            '<span class="ins-cta-icon">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>' +
            '</span>' +
            'פניה לחברה</button>';
      }
      compCtaEl.innerHTML = compCtaHtml;
    }

    /* ── ביטוח מקיף ── */
    if (full.company)      _setText('ins-full-company', full.company);
    if (full.policyNumber) _setText('ins-full-policy',  full.policyNumber);
    else                   _hideEmptyRow('ins-full-policy');
    if (full.minDriverAge) _setText('ins-full-minage',  full.minDriverAge + ' שנים');
    else                   _hideEmptyRow('ins-full-minage');
    if (typeof full.deductible === 'number') _setText('ins-full-deduct', full.deductible === 0 ? 'ללא השתתפות' : '₪' + full.deductible.toLocaleString('he'));
    else                   _hideEmptyRow('ins-full-deduct');
    if (full.agentName)    _setText('ins-full-agent-name',  full.agentName);
    else                   _hideEmptyRow('ins-full-agent-name');
    if (full.agentPhone)   _setText('ins-full-agent-phone', full.agentPhone);
    else                   _hideEmptyRow('ins-full-agent-phone');

    /* Deductible warning (FIX 3): show only when deductible > 0 */
    var deductNum = parseFloat(full.deductible);
    if (full.deductible && !isNaN(deductNum) && deductNum > 0) {
      var warnEl = document.getElementById('ins-deductible-warning');
      var deductFmt = '₪' + parseInt(deductNum, 10).toLocaleString('he-IL');
      if (warnEl) {
        warnEl.innerHTML = _insDeductibleWarningHtml(deductFmt);
        warnEl.style.display = 'block';
      }
    }

    /* Coverages */
    var coverages = full.coverages || [];
    var towing    = coverages.find(function(c){ return c.name && c.name.indexOf('גרירה') >= 0; });
    var windshield= coverages.find(function(c){ return c.name && (c.name.indexOf('שמש') >= 0 || c.name.indexOf('זכוכ') >= 0); });
    var rental    = coverages.find(function(c){ return c.name && (c.name.indexOf('חלופי') >= 0 || c.name.indexOf('שכירות') >= 0); });

    if (towing) {
      var towProvider = towing.provider || 'שגריר';
      var towDetail   = towProvider + (towing.limit ? ' | ' + towing.limit : '') + ' | 24/7';
      _setText('ins-towing-detail', towDetail);
      var towBtn = document.getElementById('ins-towing-btn');
      if (towBtn) towBtn.childNodes[towBtn.childNodes.length - 1].textContent = 'צור קשר עם ' + towProvider;
    }

    if (windshield) {
      var wdProvider = windshield.provider || 'אילן קארגלס';
      _setText('ins-wd-sub', 'ספק: ' + wdProvider + (windshield.limit ? ' | ' + windshield.limit : ''));
    }

    if (rental) {
      var rentalChip = document.getElementById('ins-rental-chip');
      if (rentalChip) rentalChip.style.display = 'flex';
    }

    /* מקיף: no CTA button — policy doc contains pricing, not shown to driver */

    /* AI insight (FIX 4: strip pricing from driver-facing text) */
    var insight = _sanitizeForDriver(full.summary || comp.summary || '');
    if (insight) {
      var aiText = document.getElementById('ins-ai-text');
      if (aiText) {
        aiText.textContent = insight;
        aiText.style.display = 'block';
      }
    }

  } catch(e) {
    console.error('[_loadInsuranceDetails] exception:', e.message, e);
    _insShowError('לא ניתן לטעון נתוני ביטוח (' + (e.message || 'שגיאת רשת') + ')');
  }
}

/* ── AI insurance Q&A — Tier 1 (local) → Tier 2 (AI) ── */
function _insAskAI(question) {
  var input = document.getElementById('ins-ai-input');
  var responseEl = document.getElementById('ins-ai-response');
  var q = question;
  if (!q && input) q = input.value;
  q = (q || '').trim();
  if (!q) return;
  if (input && !question) input.value = '';
  if (responseEl) {
    responseEl.className = '';
    responseEl.textContent = '⏳ מחשב...';
  }

  // Tier 1: try local cache first (instant, free)
  var cached = _insCacheGet();
  if (cached) {
    var localAnswer = _insTier1Answer(q, cached.comp, cached.full);
    if (localAnswer) {
      if (responseEl) {
        responseEl.textContent = localAnswer;
        responseEl.className = 'fade-in';
      }
      return;
    }
  }

  // Tier 2: AI fallback
  gasPost('insurance_ai_explain', { question: q }).then(function(res) {
    if (!responseEl) return;
    if (res && res.ok && res.answer) {
      responseEl.textContent = _sanitizeForDriver(res.answer);
      responseEl.className = 'fade-in';
    } else {
      responseEl.textContent = 'לא ניתן לקבל תובנות כרגע';
      responseEl.className = 'fade-in';
    }
  }).catch(function() {
    if (responseEl) {
      responseEl.textContent = 'לא ניתן לקבל תובנות כרגע';
      responseEl.className = 'fade-in';
    }
  });
}
window._insAskAI = _insAskAI;

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
    // docs tab removed — redirect to insurance (licenses & insurance)
    STATE.currentTab = 'insurance';
    renderVehicleScreen('insurance');
    return;

  } else if (tab === 'insurance') {
    content.innerHTML = renderInsuranceTab();

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
      _nrdActiveTab = 'unread';
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
    var _veh = document.getElementById('km-modal-vehicle');
    if (_veh) _veh.textContent = v.id ? ('רכב: ' + v.id) : 'עדכון קילומטרז';
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

APP.markAllRead = _nrdMarkAllRead;
APP.clearRead   = _nrdClearRead;

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
    var full = (res && res.full) ? res.full : null;
    if (full) {
      insCompany = full.company || '';
      insPolicy  = full.policyNumber || '';
    }
    /* חפש כיסוי שמשות ב-coverages של המקיף */
    var wdCov = null;
    if (full && full.coverages && full.coverages.length) {
      for (var wi = 0; wi < full.coverages.length; wi++) {
        var wc = full.coverages[wi];
        if (wc && wc.name && (wc.name.indexOf('שמש') >= 0 || wc.name.indexOf('זכוכ') >= 0)) {
          wdCov = wc; break;
        }
      }
    }
    if (wdCov) {
      wdProvider = wdCov.provider || 'אילן קארגלס';
      wdPhone    = wdCov.phone    || '03-6534444';
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
    var full = (res && res.full) ? res.full : null;
    var garage = (res && res.garage) ? res.garage : ((STATE.vehicle && STATE.vehicle.garage) ? STATE.vehicle.garage : null);

    /* Build a shim "ins" object so the rest of the rendering code keeps working */
    var ins = null;
    if (full) {
      var towingCov = null;
      if (full.coverages && full.coverages.length) {
        for (var ci = 0; ci < full.coverages.length; ci++) {
          var cv = full.coverages[ci];
          if (cv && cv.name && (cv.name.indexOf('גרירה') >= 0 || cv.name.indexOf('שירותי דרך') >= 0)) {
            towingCov = cv; break;
          }
        }
      }
      var rentalCov = null;
      if (full.coverages && full.coverages.length) {
        for (var ri = 0; ri < full.coverages.length; ri++) {
          var rv = full.coverages[ri];
          if (rv && rv.name && (rv.name.indexOf('חלופי') >= 0 || rv.name.indexOf('שכירות') >= 0)) {
            rentalCov = rv; break;
          }
        }
      }
      ins = {
        hasComprehensive: true,
        company: full.company || '',
        policyNumber: full.policyNumber || '',
        emergencyPhone: (towingCov && towingCov.phone) ? towingCov.phone : '',
        towingProvider: (towingCov && towingCov.provider) ? towingCov.provider : '',
        towingLimit:    (towingCov && towingCov.limit)    ? towingCov.limit    : '',
        includesRentalCar: !!rentalCov,
        expiryDate: full.endDate || ''
      };
    }

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
            (ins.towingLimit ? '<div class="tw-provider-phone">🛣️ עד ' + ins.towingLimit + '</div>' : '') +
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

  // אם יש תור פעיל — הצג מסך תור נקבע (עדיפות על approved)
  var activeAppt = _loadActiveAppointment && _loadActiveAppointment();
  if (activeAppt && activeAppt.appointmentDate) {
    // ודא שהתור לא פג תוקף (24 שעות אחרי)
    var apptMs = new Date(activeAppt.appointmentDate + 'T' + (activeAppt.appointmentTime || '09:00') + ':00').getTime();
    if (Date.now() <= apptMs + 86400000) {
      APP._garageShowActiveAppointment(activeAppt);
      return;
    }
    // תור פג — נקה
    try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
    if (typeof _fbClearActiveAppointment === 'function') _fbClearActiveAppointment();
  }

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
        var _pendingData = { eventId: eventId, requestNumber: result.requestNumber || '', reason: ctx.reasonId, reasonLabel: ctx.reasonLabel, description: ctx.description || '', submittedAt: Date.now() };
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

// מציג מסך תור פעיל (appointment_set) בתפריט עזרה > מוסך
APP._garageShowActiveAppointment = function(appt) {
  APP._garageView = 'active_appointment';
  var tStr    = (function(t) {
    if (!t) return '09:00';
    var m = String(t).match(/(\d{1,2}):(\d{2})/);
    return m ? (('0'+m[1]).slice(-2) + ':' + m[2]) : '09:00';
  })(appt.appointmentTime);
  var _apptDate = String(appt.appointmentDate || '').split('T')[0].split(' ')[0];
  var dateFmt = _apptDate.split('-').reverse().join('/');
  try {
    var _apptMs = new Date(appt.appointmentDate + 'T' + tStr + ':00').getTime();
    var _dayName = _hebrewDayName ? _hebrewDayName(new Date(_apptMs)) : '';
    dateFmt = _dayName ? _dayName + ' · ' + dateFmt : dateFmt;
  } catch(_e) {}
  var garageName    = appt.garageName    || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name) || 'המוסך';
  var garageAddress = appt.garageAddress || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '';
  var garagePhone   = appt.garagePhone   || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone) || '';
  var managerNote   = appt.managerNote   || '';
  var eventId       = appt.eventId       || '';

  _showHelpCard(
    '<div class="help-card" style="padding:0;overflow:hidden">' +
    '<div style="background:linear-gradient(135deg,#064e3b,#065f46,#047857);padding:26px 20px 20px;text-align:center;position:relative">' +
      '<button class="help-back-btn" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:6px 14px;margin:0" onclick="APP._helpBackToMenu()">&#x25C4; חזרה</button>' +
      '<div style="font-size:36px;margin-bottom:8px">&#x1F4C5;</div>' +
      '<div style="font-size:17px;font-weight:900;color:#fff;margin-bottom:3px">תור נקבע!</div>' +
      '<div style="font-size:13px;color:rgba(255,255,255,.8)">' + dateFmt + ' · ' + tStr + '</div>' +
    '</div>' +
    '<div style="padding:20px">' +
      '<div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:14px;padding:14px 16px;margin-bottom:14px">' +
        '<div style="font-size:12px;font-weight:700;color:#34d399;margin-bottom:10px">&#x2705; פרטי התור</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
          '<span style="font-size:11px;color:#64748b">מוסך</span>' +
          '<span style="font-size:13px;font-weight:700;color:#f1f5f9">' + _escHtml(garageName) + '</span>' +
        '</div>' +
        (garageAddress ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
          '<span style="font-size:11px;color:#64748b">כתובת</span>' +
          '<span style="font-size:12px;color:#f1f5f9">' + _escHtml(garageAddress) + '</span>' +
        '</div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0' + (managerNote ? ';border-bottom:1px solid rgba(255,255,255,.06)' : '') + '">' +
          '<span style="font-size:11px;color:#64748b">תאריך ושעה</span>' +
          '<span style="font-size:13px;font-weight:700;color:#34d399">' + dateFmt + ' ' + tStr + '</span>' +
        '</div>' +
        (managerNote ? '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:5px 0;gap:10px">' +
          '<span style="font-size:11px;color:#64748b;flex-shrink:0;padding-top:2px">הערה</span>' +
          '<span style="font-size:12px;color:#f1f5f9;text-align:start;line-height:1.4">' + _escHtml(managerNote) + '</span>' +
        '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:12px">' +
        (garagePhone ? '<button onclick="window.open(\'tel:' + garagePhone + '\')" style="flex:1;padding:11px 0;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:10px;color:#34d399;font-size:13px;font-weight:700;cursor:pointer">&#x1F4DE; התקשר</button>' : '') +
        '<button onclick="_openGarageWaze && _openGarageWaze()" style="flex:1;padding:11px 0;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.3);border-radius:10px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer">&#x1F5FA; ניווט</button>' +
      '</div>' +
      (eventId ? '<button onclick="APP._garageEditAppointment(\'' + eventId + '\')" style="width:100%;margin-bottom:8px;padding:10px 0;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);border-radius:10px;color:#60a5fa;font-size:13px;font-weight:600;cursor:pointer">✏ ערוך תור</button>' : '') +
      (eventId ? '<button onclick="APP._garageCancelAppointment(\'' + eventId + '\')" style="width:100%;padding:10px 0;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:10px;color:#f87171;font-size:13px;font-weight:600;cursor:pointer">&#x2715; בטל תור</button>' : '') +
    '</div>' +
    '</div>'
  );
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
/* Popup shown when user taps an old notification whose garage request or
   appointment was already cancelled (localStorage state is cleared).
   opts: { title, body, btnLabel, onNewRequest } */
function _nrdShowCancelledPopup(meta, opts) {
  var prev = document.getElementById('nrd-cancelled-popup');
  if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

  opts = opts || {};
  var title     = opts.title     || 'הבקשה בוטלה';
  var body      = opts.body      || 'הבקשה שאליה מתייחסת התראה זו בוטלה.\nלא ניתן לפעול עליה יותר.';
  var btnLabel  = opts.btnLabel  || 'פתח בקשה חדשה';
  var reqNum    = (meta && meta.requestNumber) ? String(meta.requestNumber) : '';

  var ov = document.createElement('div');
  ov.id = 'nrd-cancelled-popup';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;animation:nrd-toast-in .28s cubic-bezier(0.22,1,0.36,1);';

  var card = document.createElement('div');
  card.style.cssText = 'background:#111111;border:1px solid rgba(255,255,255,0.09);border-radius:22px;padding:28px 20px 20px;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.75);position:relative;direction:rtl;';

  /* X close button — top-left (physically left, per user spec) */
  var xBtn = document.createElement('button');
  xBtn.setAttribute('aria-label', 'סגור');
  xBtn.style.cssText = 'position:absolute;top:14px;left:14px;background:rgba(255,255,255,0.06);border:none;color:#666;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  xBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  card.appendChild(xBtn);

  /* Danger badge */
  var badge = document.createElement('div');
  badge.style.cssText = 'width:60px;height:60px;border-radius:16px;background:linear-gradient(145deg,#ff6b60,#ef4444);display:flex;align-items:center;justify-content:center;margin:8px auto 18px;box-shadow:0 8px 24px rgba(239,68,68,0.35);';
  badge.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  card.appendChild(badge);

  /* Title */
  var titleEl = document.createElement('div');
  titleEl.style.cssText = 'text-align:center;font-size:19px;font-weight:800;color:#fff;margin-bottom:8px;letter-spacing:-0.3px;';
  titleEl.textContent = title;
  card.appendChild(titleEl);

  /* Request number pill */
  if (reqNum) {
    var pill = document.createElement('div');
    pill.style.cssText = 'text-align:center;margin-bottom:10px;';
    var pillInner = document.createElement('span');
    pillInner.style.cssText = 'background:rgba(239,68,68,0.12);color:#f87171;font-size:12px;font-weight:700;padding:4px 14px;border-radius:999px;display:inline-block;';
    pillInner.textContent = 'בקשה #' + _escHtml(reqNum);
    pill.appendChild(pillInner);
    card.appendChild(pill);
  }

  /* Body text */
  var bodyEl = document.createElement('div');
  bodyEl.style.cssText = 'text-align:center;font-size:13.5px;color:#888;line-height:1.6;margin-bottom:22px;white-space:pre-line;';
  bodyEl.textContent = body;
  card.appendChild(bodyEl);

  /* Divider */
  var divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.07);margin-bottom:16px;';
  card.appendChild(divider);

  /* Primary button */
  var primaryBtn = document.createElement('button');
  primaryBtn.style.cssText = 'width:100%;height:50px;background:#34d96f;color:#04210f;border:none;border-radius:999px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;';
  primaryBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>' + _escHtml(btnLabel);
  card.appendChild(primaryBtn);

  /* Ghost close button */
  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'width:100%;height:44px;background:none;color:#666;border:none;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;';
  closeBtn.textContent = 'סגור';
  card.appendChild(closeBtn);

  ov.appendChild(card);
  document.body.appendChild(ov);

  function _dismiss() { if (ov.parentNode) ov.parentNode.removeChild(ov); }

  xBtn.addEventListener('click', _dismiss);
  closeBtn.addEventListener('click', _dismiss);
  ov.addEventListener('click', function(e) { if (e.target === ov) _dismiss(); });

  primaryBtn.addEventListener('click', function() {
    _dismiss();
    if (typeof opts.onNewRequest === 'function') opts.onNewRequest();
  });
}

APP._garageShowApprovedFromStorage = function(meta) {
  var approved = APP._garageGetApproved();
  /* Fallback removed: writing stale meta back to storage resurrected cancelled
     requests. If localStorage is empty the approved state is gone — show helpGarage. */
  if (!approved) {
    _nrdShowCancelledPopup(meta, {
      title:    'הבקשה בוטלה',
      body:     'הבקשה שאליה מתייחסת התראה זו בוטלה.\nניתן לפתוח בקשה חדשה דרך ממשק עזרה.',
      btnLabel: 'פתח בקשה חדשה',
      onNewRequest: function() {
        if (typeof APP === 'undefined') return;
        /* Help overlay may already be open (navigateForAlertType opened it before
           showing the popup). Calling openHelpMenu() again would re-initialize the
           menu and retrigger the popup cycle. Only open if not already open. */
        var _alreadyOpen = (typeof STATE !== 'undefined' && STATE.helpMenuOpen);
        if (!_alreadyOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
        var _delay = _alreadyOpen ? 0 : 350;
        setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, _delay);
      }
    });
    return;
  }
  var info          = APP._garageBuildInfoFromState();
  var eventId       = approved.eventId       || '';
  var reason        = approved.reasonLabel   || '';
  var requestNumber = approved.requestNumber || '';
  var approvedAt    = approved.approvedAt    || 0;
  APP._garageShowApproved(info, eventId, reason, requestNumber, approvedAt);

  // רענון מהשרת — מזהה אם כבר נקבע תור על ידי המנהל
  if (eventId && typeof gasPost === 'function') {
    gasPost('get_garage_status', { eventId: eventId }, { silent: true }).then(function(r) {
      if (!r || !r.ok) return;
      var status = String(r.status || '').toLowerCase();
      if (status === 'appointment_set' && r.appointmentDate) {
        // מנהל כבר קבע תור — עדכן localStorage והצג מסך תור פעיל
        var _aSet = {
          eventId:         eventId,
          appointmentDate: String(r.appointmentDate || '').split('T')[0].split(' ')[0],
          appointmentTime: (function(t) { if (!t) return '09:00'; var m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (('0'+m[1]).slice(-2)+':'+m[2]) : '09:00'; })(r.appointmentTime),
          managerNote:     r.managerNote     || '',
          garageName:    (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
          garageAddress: (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
          garagePhone:   (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || '',
          updatedAt:     Date.now()
        };
        localStorage.setItem('activeGarageAppointment', JSON.stringify(_aSet));
        localStorage.removeItem('approvedGarageRequest');
        localStorage.removeItem('pendingGarageRequest');
        if (typeof _fbSetActiveAppointment === 'function') _fbSetActiveAppointment(_aSet);
        if (typeof _fbClearApprovedGarage  === 'function') _fbClearApprovedGarage();
        if (typeof _fbClearPendingGarage   === 'function') _fbClearPendingGarage();
        if (typeof renderGarageApptWidget  === 'function') renderGarageApptWidget();
        APP._garageShowActiveAppointment(_aSet);
      } else if (status === 'approved' && r.garageInfo) {
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
  if (pending.requestNumber !== undefined && pending.requestNumber !== null && pending.requestNumber !== '') {
    reqNum = String(pending.requestNumber);
  } else if (pending.eventId) {
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

APP._garageEditAppointment = function(eventId) {
  var appt = JSON.parse(localStorage.getItem('activeGarageAppointment') || '{}');
  var curDate = appt.appointmentDate || '';
  var curTime = appt.appointmentTime || '';
  var today = new Date().toISOString().slice(0,10);
  var garageName = appt.garageName || '';
  var curDateFmt = curDate ? curDate.split('-').reverse().join('/') : '--';
  var curTimeFmt = curTime || '--:--';
  var existing = document.getElementById('_gedit_overlay');
  if (existing) existing.remove();
  if (!document.getElementById('_gedit_kf')) {
    var _kf = document.createElement('style');
    _kf.id = '_gedit_kf';
    _kf.textContent = '@keyframes _geditSlideUp{from{transform:translateY(100%);opacity:.4}to{transform:translateY(0);opacity:1}}@keyframes _geditFade{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(_kf);
  }
  var ol = document.createElement('div');
  ol.id = '_gedit_overlay';
  ol.setAttribute('style', 'position:fixed;inset:0;z-index:9995;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;direction:rtl;animation:_geditFade .2s ease');
  var _eReqN = (appt && appt.requestNumber) ? String(appt.requestNumber) : (function(){ var _m = String(eventId||'').match(/-(\d+)$/); return _m ? String(parseInt(_m[1],10)) : ''; })();
  var reqChip = _eReqN ? '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;color:#fbbf24;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);border-radius:999px;padding:3px 10px;letter-spacing:.3px">&#x1F527; #' + _eReqN + '</span>' : '';
  var garageRow = garageName ? '<div style="display:flex;align-items:center;gap:8px;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px;margin-bottom:14px"><span style="font-size:16px">&#x1F527;</span><div style="flex:1;min-width:0"><div style="font-size:10px;color:#64748b;font-weight:600;letter-spacing:.4px">מוסך</div><div style="font-size:13px;color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + garageName.replace(/</g,"&lt;") + '</div></div></div>' : '';
  ol.innerHTML =
    '<div style="background:linear-gradient(180deg,#1e293b 0%,#172033 100%);width:100%;max-width:480px;border-radius:24px 24px 0 0;padding:0;box-shadow:0 -20px 60px rgba(0,0,0,.6);animation:_geditSlideUp .28s cubic-bezier(.2,.9,.3,1.2);max-height:92vh;overflow-y:auto;border-top:1px solid rgba(148,163,184,.15)">' +
    '<div style="background:linear-gradient(135deg,#3b82f6 0%,#6366f1 60%,#8b5cf6 100%);padding:20px 18px 18px;border-radius:24px 24px 0 0;position:relative;overflow:hidden">' +
      '<div style="position:absolute;top:-30px;left:-30px;width:120px;height:120px;background:radial-gradient(circle,rgba(255,255,255,.15) 0%,transparent 70%);border-radius:50%"></div>' +
      '<div style="position:absolute;bottom:-40px;right:-40px;width:140px;height:140px;background:radial-gradient(circle,rgba(255,255,255,.08) 0%,transparent 70%);border-radius:50%"></div>' +
      '<button onclick="document.getElementById(\'_gedit_overlay\').remove()" style="position:absolute;top:14px;left:14px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:32px;height:32px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-weight:700;z-index:2" aria-label="סגור">&#x2715;</button>' +
      '<div style="display:flex;align-items:center;gap:12px;position:relative;z-index:1">' +
        '<div style="width:46px;height:46px;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.3);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;backdrop-filter:blur(8px)">&#x1F4C5;</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.2px;line-height:1.2">עריכת תור מוסך</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.85);margin-top:4px;display:flex;align-items:center;gap:6px">' + (reqChip || '<span style="opacity:.85">שינוי תאריך / שעה</span>') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="padding:18px 18px 24px">' +
      garageRow +
      '<div style="display:flex;gap:10px;margin-bottom:18px">' +
        '<div style="flex:1;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px"><div style="font-size:10px;color:#64748b;font-weight:600;letter-spacing:.4px;margin-bottom:2px">תאריך נוכחי</div><div style="font-size:14px;color:#cbd5e1;font-weight:700">' + curDateFmt + '</div></div>' +
        '<div style="flex:1;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px"><div style="font-size:10px;color:#64748b;font-weight:600;letter-spacing:.4px;margin-bottom:2px">שעה נוכחית</div><div style="font-size:14px;color:#cbd5e1;font-weight:700">' + curTimeFmt + '</div></div>' +
      '</div>' +
      '<label style="display:block;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.4px;margin-bottom:6px;text-transform:uppercase">&#x1F4C6; תאריך חדש</label>' +
      '<input type="date" id="_gedit-date" min="' + today + '" value="' + curDate + '" style="width:100%;box-sizing:border-box;padding:14px 14px;border-radius:14px;border:1.5px solid rgba(59,130,246,.25);background:#0f172a;color:#f8fafc;font-size:16px;font-weight:600;margin-bottom:14px;outline:none;transition:all .15s ease;font-family:inherit" onfocus="this.style.borderColor=\'#3b82f6\';this.style.boxShadow=\'0 0 0 4px rgba(59,130,246,.15)\'" onblur="this.style.borderColor=\'rgba(59,130,246,.25)\';this.style.boxShadow=\'none\'">' +
      '<label style="display:block;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.4px;margin-bottom:6px;text-transform:uppercase">&#x23F0; שעה חדשה</label>' +
      '<input type="time" id="_gedit-time" value="' + curTime + '" style="width:100%;box-sizing:border-box;padding:14px 14px;border-radius:14px;border:1.5px solid rgba(59,130,246,.25);background:#0f172a;color:#f8fafc;font-size:16px;font-weight:600;margin-bottom:22px;outline:none;transition:all .15s ease;font-family:inherit" onfocus="this.style.borderColor=\'#3b82f6\';this.style.boxShadow=\'0 0 0 4px rgba(59,130,246,.15)\'" onblur="this.style.borderColor=\'rgba(59,130,246,.25)\';this.style.boxShadow=\'none\'">' +
      '<button id="_gedit-save" onclick="APP._garageConfirmEditAppointment(\'' + eventId + '\')" style="width:100%;padding:16px;background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);border:none;border-radius:14px;color:#fff;font-size:15px;font-weight:800;letter-spacing:.3px;cursor:pointer;box-shadow:0 8px 20px rgba(59,130,246,.35),inset 0 1px 0 rgba(255,255,255,.2);transition:transform .1s ease" onmousedown="this.style.transform=\'scale(.98)\'" onmouseup="this.style.transform=\'scale(1)\'" ontouchstart="this.style.transform=\'scale(.98)\'" ontouchend="this.style.transform=\'scale(1)\'">&#x1F4BE; שמור שינוי</button>' +
      '<button onclick="document.getElementById(\'_gedit_overlay\').remove()" style="width:100%;margin-top:10px;padding:13px;background:transparent;border:1px solid rgba(148,163,184,.25);border-radius:14px;color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s ease" onmouseover="this.style.background=\'rgba(148,163,184,.08)\'" onmouseout="this.style.background=\'transparent\'">ביטול</button>' +
    '</div>' +
    '</div>';
  ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
  document.body.appendChild(ol);
};

APP._garageConfirmEditAppointment = async function(eventId) {
  var dateVal = (document.getElementById('_gedit-date') || {}).value || '';
  var timeVal = (document.getElementById('_gedit-time') || {}).value || '';
  if (!dateVal || !timeVal) {
    showToast('יש לבחור תאריך ושעה', 'error'); return;
  }
  if (!eventId) { showToast('מזהה אירוע חסר', 'error'); return; }
  var btn = document.getElementById('_gedit-save');
  var origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '\u23F3 שומר...'; btn.style.opacity = '.75'; }
  try {
    var res = await gasPost('garage_set_appointment', { eventId: eventId, appointmentDate: dateVal, appointmentTime: timeVal }, { silent: true });
    if (res && res.error === 'session_expired') { _sessionExpired(); return; }
    if (!res || !res.ok) throw new Error((res && res.error) || 'error');
    var appt = JSON.parse(localStorage.getItem('activeGarageAppointment') || '{}');
    appt.appointmentDate = dateVal;
    appt.appointmentTime = timeVal;
    appt.updatedAt = Date.now();
    localStorage.setItem('activeGarageAppointment', JSON.stringify(appt));
    try { if (typeof _fbSetActiveAppointment === 'function') _fbSetActiveAppointment(appt); } catch(_fbE) {}
    var _eol = document.getElementById('_gedit_overlay');
    if (_eol) _eol.remove();
    var _dFmt = dateVal.split('-').reverse().join('/');
    showToast('\u2705 התור עודכן ל-' + _dFmt + ' בשעה ' + timeVal);
    if (typeof renderGarageApptWidget === 'function') renderGarageApptWidget();
    if (APP._garageView === 'active_appointment' && typeof APP._garageShowActiveAppointment === 'function') {
      APP._garageShowActiveAppointment((typeof _loadActiveAppointment === 'function' ? _loadActiveAppointment() : null) || appt);
    }
  } catch(e) {
    showToast('שגיאה בעדכון: ' + (e && e.message ? e.message : e), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = origText || '\uD83D\uDCBE שמור שינוי'; btn.style.opacity = '1'; }
  }
};

APP._garageDoCancelAppointment = async function(eventId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳ מבטל...'; }
  var _ol = document.getElementById('_gcancel_overlay');
  if (_ol) _ol.remove();
  try {
    if (eventId) {
      var _r = await gasPost('cancel_appointment', { eventId: eventId }, { silent: true });
      if (_r && _r.error === 'session_expired') {
        if (btn) { btn.disabled = false; btn.textContent = 'כן, בטל תור'; }
        _sessionExpired();
        return;
      }
      if (!_r || !_r.ok) throw new Error((_r && _r.error) || 'cancel_failed');
    }
    try { localStorage.removeItem('activeGarageAppointment'); } catch(_) {}
    _fbClearActiveAppointment();
    APP._garageClearApproved();
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
  if (!requestNumber && eventId) {
    try { var _m = String(eventId).match(/-(\d+)$/); if (_m) requestNumber = String(parseInt(_m[1], 10)); } catch(_) {}
  }
  if (requestNumber) metaRows += '<div style="color:#94a3b8;margin-bottom:3px">מספר תקלה: <b style="color:#f1f5f9">#' + requestNumber + '</b></div>';
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
        requestNumber:   (result.requestNumber ? String(result.requestNumber) : (function(){ try { var _apg = JSON.parse(localStorage.getItem('approvedGarageRequest')||'null'); if (_apg && _apg.requestNumber) return String(_apg.requestNumber); } catch(_){} var _m = String(eventId||'').match(/-(\d+)$/); return _m ? String(parseInt(_m[1],10)) : ''; })()),
        appointmentDate: dateVal,
        appointmentTime: timeVal,
        garageName:    _garageCtx.garageName    || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.name)    || '',
        garageAddress: _garageCtx.garageAddress || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.address) || '',
        garagePhone:   _garageCtx.garagePhone   || (STATE.vehicle && STATE.vehicle.garage && STATE.vehicle.garage.phone)   || '',
        updatedAt:     Date.now()
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
  garage_approved:              'approved',
  garage_appointment_set:       'plan',
  garage_appointment_cancelled: 'info'
};

var TOAST_DURATION = {
  critical: 10000,
  urgent:   8000,
  plan:     6000,
  info:     6000,
  approved: 0
};

var SEVERITY_ICONS = {
  critical: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#ef4444"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  urgent:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#f59e0b"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  plan:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#3b82f6"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  info:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#8b5cf6"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>',
  approved: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:#22c55e"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>'
};

var _activeToast = null;

// Emoji icons for the full-screen notification landing overlay
var SEVERITY_LANDING_EMOJI = {
  critical: '🔴', urgent: '🟠', plan: '🔵',
  info: '💜', approved: '✅'
};

// Full-screen "notification landing" shown when the app cold-starts from an OS notification tap
function showNotifLanding(payload, onDone) {
  var notif = payload.notification || {};
  var meta = payload.data || {};
  var alertType = meta.alertType || 'plan';
  var severity = SEVERITY_MAP[alertType] || 'plan';

  var BG_COLORS = {
    critical: 'rgba(239,68,68,0.2)',
    urgent:   'rgba(245,158,11,0.2)',
    plan:     'rgba(59,130,246,0.2)',
    info:     'rgba(139,92,246,0.2)',
    approved: 'rgba(34,197,94,0.2)'
  };

  var landing = document.getElementById('notif-landing');
  if (!landing) { if (onDone) onDone(); return; }

  landing.innerHTML =
    '<div class="nl-icon" style="background:' + (BG_COLORS[severity] || BG_COLORS.plan) + '">' +
      (SEVERITY_LANDING_EMOJI[severity] || '🔔') +
    '</div>' +
    '<div class="nl-title">' + _escHtml(notif.title || 'התראה חדשה') + '</div>' +
    '<div class="nl-body">' + _escHtml(notif.body || '') + '</div>' +
    '<button class="nl-cta" onclick="_notifLandingContinue()">פתח ←</button>';

  landing.style.display = 'flex';
  landing.style.animation = 'notif-landing-in 0.6s cubic-bezier(0.22,1,0.36,1) both';

  var _done = false;
  window._notifLandingContinue = function() {
    if (_done) return;
    _done = true;
    landing.style.animation = 'notif-landing-out 0.4s ease both';
    setTimeout(function() {
      landing.style.display = 'none';
      if (onDone) onDone();
    }, 380);
  };

  // Auto-advance after 4 seconds
  setTimeout(function() {
    if (landing.style.display !== 'none') window._notifLandingContinue();
  }, 4000);
}

function _buildToastChips(alertType, meta) {
  var chips = [];
  var c = function(label, val, unit) {
    if (val === '' || val == null) return;
    chips.push('<div class="nt-chip"><span class="nt-chip-label">' + _escHtml(label) + '</span><span class="nt-chip-val">' + _escHtml(String(val)) + (unit ? ' ' + unit : '') + '</span></div>');
  };
  switch (alertType) {
    case 'overdue': case 'urgent':
      c('נותר', meta.kmLeft, 'ק"מ'); c('מד נוכחי', meta.estKm); c('הבא לטיפול', meta.nextKm); break;
    case 'plan':
      c('נותר', meta.kmLeft, 'ק"מ'); c('הבא ב', meta.nextKm); break;
    case 'km_update':
      c('לפני', meta.daysSinceUpdate, 'ימים'); c('מד אחרון', meta.lastKm); break;
    case 'test_due': case 'test_urgent':
      c('תאריך טסט', meta.testDate); c('נותרו', meta.daysLeft, 'ימים'); break;
    case 'garage_approved':
      if (meta.requestNumber) c('מספר תקלה', '#' + meta.requestNumber);
      if (meta.garageInfo) c('מוסך', meta.garageInfo); break;
    case 'garage_rejected':
      if (meta.requestNumber) c('מספר תקלה', '#' + meta.requestNumber);
      if (meta.reasonLabel) c('סיבה', meta.reasonLabel); break;
    case 'garage_appointment_set':
      if (meta.requestNumber) c('מספר תקלה', '#' + meta.requestNumber);
      c('תאריך', meta.appointmentDate); c('שעה', meta.appointmentTime); if (meta.garageInfo) c('מוסך', meta.garageInfo); break;
    case 'garage_appointment_cancelled':
      if (meta.requestNumber) c('מספר תקלה', '#' + meta.requestNumber);
      c('תאריך שבוטל', meta.appointmentDate); if (meta.appointmentTime) c('שעה', meta.appointmentTime); break;
    case 'fuel_high':
      if (meta.fuelConsumption != null) c('צריכה', meta.fuelConsumption, 'ל׳/100ק"מ');
      if (meta.threshold != null) c('סף', meta.threshold, 'ל׳');
      if (meta.fleetAverage != null) c('ממוצע', meta.fleetAverage, 'ל׳'); break;
    case 'fuel_km_high':
      if (meta.costPerKm != null) c('עלות לק"מ', '₪' + meta.costPerKm);
      if (meta.fleetAverage != null) c('ממוצע ציי', '₪' + meta.fleetAverage); break;
  }
  return chips.length ? '<div class="nt-chips">' + chips.join('') + '</div>' : '';
}

function _buildToastActions(alertType, meta) {
  var primary = null, secondary = null;
  switch (alertType) {
    case 'overdue': case 'urgent':
      primary = { label: 'בקש מוסך', fn: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'plan':
      primary = { label: 'צפה בפרטים', fn: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'km_update':
      primary = { label: 'עדכן עכשיו', fn: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'test_due':
      primary = { label: 'הגדר תזכורת', fn: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'test_urgent':
      primary = { label: 'בצע טסט', fn: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'garage_approved':
      primary = { label: 'קבע מועד', fn: function() { navigateForAlertType('garage_approved', meta); } };
      secondary = { label: 'מאוחר יותר' }; break;
    case 'garage_rejected':
      primary = { label: 'שלח בקשה חדשה', fn: function() { navigateForAlertType('garage_rejected', meta); } }; break;
    case 'garage_appointment_set':
      primary = { label: 'הוסף ליומן', fn: function() {
        var d = meta.appointmentDate || ''; var t = meta.appointmentTime || '00:00';
        if (d) {
          var parts = d.split('/');
          if (parts.length === 3) {
            var iso = parts[2] + '-' + parts[1] + '-' + parts[0] + 'T' + t + ':00';
            var start = new Date(iso); var end = new Date(start.getTime() + 90 * 60000);
            if (!isNaN(start.getTime())) {
              var fmt = function(dt) { return dt.toISOString().replace(/[-:]/g,'').replace('.000',''); };
              window.open('https://calendar.google.com/calendar/r/eventedit?text=' + encodeURIComponent('תור מוסך') + '&dates=' + fmt(start) + '/' + fmt(end), '_blank');
            }
          }
        }
      }};
      secondary = { label: 'בסדר' }; break;
    case 'garage_appointment_cancelled':
      primary = { label: 'קבע מועד חדש', fn: function() { navigateForAlertType('garage_appointment_cancelled', meta); } };
      secondary = { label: 'לא כרגע' }; break;
    case 'fuel_high': case 'fuel_km_high':
      primary = { label: 'דוח צריכה', fn: function() { navigateForAlertType(alertType, meta); } }; break;
  }
  if (!primary) primary = { label: 'פרטים', fn: function() { navigateForAlertType(alertType, meta); } };
  return { primary: primary, secondary: secondary };
}

/* Auto-dismiss durations by redesign category (ms). */
var _NRD_TOAST_DURATION = { danger: 8000, approved: 8000, reminder: 6000, warning: 6000, info: 4000 };

function showInAppNotification(payload) {
  var notif     = payload.notification || {};
  var meta      = payload.data || {};
  var alertType = meta.alertType || 'plan';
  var cat       = _nrdCategoryFor(alertType);

  saveNotifToHistory(payload);

  var n = {
    id: meta.ts || payload.ts || Date.now(),
    ts: meta.ts || payload.ts || Date.now(),
    title: notif.title || 'עלה — התראה',
    body: notif.body || '',
    alertType: alertType,
    vehicleId: meta.vehicleId || '',
    requestNumber: meta.requestNumber || '',
    reasonLabel: meta.reasonLabel || '',
    originalDescription: meta.originalDescription || '',
    managerNote: meta.managerNote || '',
    appointmentDate: meta.appointmentDate || '',
    appointmentTime: meta.appointmentTime || '',
    garageInfo: (function(g){ return !g ? '' : (typeof g === 'string' ? g : (g.name || g.garageName || '')); })(meta.garageInfo),
    testDate: meta.testDate || '',
    daysLeft: meta.daysLeft != null ? meta.daysLeft : '',
    kmLeft: meta.kmLeft != null ? meta.kmLeft : '',
    estKm: meta.estKm != null ? meta.estKm : '',
    nextKm: meta.nextKm != null ? meta.nextKm : '',
    daysSinceUpdate: meta.daysSinceUpdate != null ? meta.daysSinceUpdate : '',
    fuelConsumption: meta.fuelConsumption != null ? meta.fuelConsumption : '',
    costPerKm: meta.costPerKm != null ? meta.costPerKm : '',
    fleetAverage: meta.fleetAverage != null ? meta.fleetAverage : '',
    threshold: meta.threshold != null ? meta.threshold : ''
  };

  if (_activeToast && _activeToast.parentNode) {
    var _old = _activeToast;
    _old.classList.add('leaving');
    setTimeout(function() { if (_old.parentNode) _old.parentNode.removeChild(_old); }, 320);
  }

  var badgeCls = _NRD_BADGE_CLASS_BY_TYPE[alertType] || _NRD_BADGE_CLASS[cat];
  var iconKey  = _NRD_BADGE_ICON_BY_TYPE[alertType]  || _NRD_BADGE_ICON[cat];
  var duration = _NRD_TOAST_DURATION[cat] != null ? _NRD_TOAST_DURATION[cat] : 6000;
  var actHtml  = _nrdToastActions(n);

  var el = document.createElement('div');
  el.className = 'nrd-toast';
  el.setAttribute('role', 'alert');
  el.innerHTML =
    '<div class="nrd-toast-head">' +
      '<div class="nrd-toast-badge ' + badgeCls + '">' + _NRD_ICONS[iconKey] + '</div>' +
      '<div class="nrd-toast-meta">' +
        '<div class="nrd-toast-title">' + _escHtml(n.title) + '</div>' +
        (n.body ? '<div class="nrd-toast-body">' + _escHtml(n.body) + '</div>' : '') +
      '</div>' +
      '<div class="nrd-toast-side">' +
        '<button class="nrd-toast-close" aria-label="סגור"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<div class="nrd-toast-time">כעת</div>' +
      '</div>' +
    '</div>' +
    actHtml;

  document.body.appendChild(el);
  _activeToast = el;
  if (typeof _playNotifSound === 'function') _playNotifSound(alertType);

  var primaryBtn = el.querySelector('.nrd-toast-btn-primary');
  if (primaryBtn) primaryBtn.addEventListener('click', function(e) {
    e.stopPropagation(); dismissToast(el); navigateForAlertType(alertType, meta);
  });
  var ghostBtn = el.querySelector('.nrd-toast-btn-ghost');
  if (ghostBtn) ghostBtn.addEventListener('click', function(e) {
    e.stopPropagation(); dismissToast(el);
    /* Ghost button is type-specific, not a plain dismiss. */
    switch (alertType) {
      case 'garage_appointment_set':
        /* "ניווט למוסך" — open Waze navigation to the garage. */
        if (typeof _openGarageWaze === 'function') _openGarageWaze();
        break;
      case 'garage_approved':
        /* "פרטי מוסך" — open the approved-garage details screen. */
        if (typeof APP !== 'undefined') {
          if (!STATE.helpMenuOpen && typeof APP.openHelpMenu === 'function') APP.openHelpMenu();
          setTimeout(function() { if (typeof APP.helpGarage === 'function') APP.helpGarage(); }, 350);
        }
        break;
      default:
        /* No ghost action defined — dismiss only. */
        break;
    }
  });

  var closeBtn = el.querySelector('.nrd-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', function(e) { e.stopPropagation(); dismissToast(el); });

  el.addEventListener('click', function(e) {
    if (e.target.closest && (e.target.closest('.nrd-toast-btn') || e.target.closest('.nrd-toast-close'))) return;
    dismissToast(el);
    _nrdShowCardOverlay(n);
  });

  var _sy = null;
  el.addEventListener('touchstart', function(e) { _sy = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', function(e) {
    if (_sy === null) return;
    var dy = e.changedTouches[0].clientY - _sy;
    if (dy < -40) dismissToast(el);
    _sy = null;
  }, { passive: true });

  if (duration > 0) el._dismissTimer = setTimeout(function() { dismissToast(el); }, duration);
}

/* Toast action buttons */
function _nrdToastActions(n) {
  var type = n.alertType || 'plan';
  var label, blue = false, ghost = '';
  switch (type) {
    case 'garage_appointment_set': label = 'הוסף ליומן'; blue = true; ghost = 'ניווט למוסך'; break;
    case 'garage_approved': label = 'קבע תור'; blue = true; ghost = 'פרטי מוסך'; break;
    case 'garage_rejected': label = 'פתח בקשה חדשה'; break;
    case 'garage_appointment_cancelled': label = 'קבע תור חדש'; break;
    case 'overdue': case 'urgent': case 'maintenance_overdue': case 'maintenance_urgent': label = 'קבע תור לטיפול במוסך'; break;
    case 'plan': case 'maintenance_plan': label = 'קבע תור לטיפול במוסך'; blue = true; break;
    case 'km_update': label = 'עדכן ק"מ'; blue = true; break;
    case 'test_due': case 'test_urgent': label = 'בקרוב — מכוני טסט'; blue = true; break;
    case 'fuel_high': label = 'דוח צריכה'; break;
    case 'fuel_km_high': label = 'דוח עלויות'; break;
    default: label = 'פרטים'; blue = true; break;
  }
  var html = '<div class="nrd-toast-actions">' +
    '<button class="nrd-toast-btn nrd-toast-btn-primary' + (blue ? ' blue' : '') + '">' + _escHtml(label) + '</button>';
  if (ghost) html += '<button class="nrd-toast-btn nrd-toast-btn-ghost">' + _escHtml(ghost) + '</button>';
  html += '</div>';
  return html;
}

/* Full-card overlay shown when the toast body is tapped. */
function _nrdShowCardOverlay(n) {
  var prev = document.getElementById('nrd-card-overlay');
  if (prev) prev.parentNode.removeChild(prev);
  var ov = document.createElement('div');
  ov.id = 'nrd-card-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;animation:nrd-toast-in .25s ease;';
  var inner = document.createElement('div');
  inner.style.cssText = 'width:100%;max-width:420px;';
  inner.innerHTML = _nrdCardHtml(n, 0);
  ov.appendChild(inner);
  ov.addEventListener('click', function(e) { if (e.target === ov) ov.parentNode.removeChild(ov); });
  document.body.appendChild(ov);
  var card = inner.querySelector('.nrd-card');
  if (card) card.classList.add('open');
  inner.querySelectorAll('.nrd-btn').forEach(function(b) {
    b.addEventListener('click', function() { setTimeout(function() { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 50); });
  });
}

function dismissToast(el) {
  if (!el || !el.parentNode) return;
  clearTimeout(el._dismissTimer);
  el.classList.add('nt-leaving');
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
      // guard: אסור לנווט אם אין session — הנוטיפיקציה יכולה להגיע אחרי logout
      if (STATE.idToken && STATE.vehicle) {
        navigateForAlertType(
          (msg.payload.data && msg.payload.data.alertType) || 'plan',
          msg.payload.data || {}
        );
      }
    } else if (msg.type === 'notification-click' && msg.data) {
      if (STATE.idToken && STATE.vehicle) {
        navigateForAlertType(msg.data.alertType || 'plan', msg.data);
      }
    } else if (msg.type === 'pending-notifs' && msg.notifs && msg.notifs.length) {
      msg.notifs.forEach(function(p) { saveNotifToHistory(p); });
      showInAppNotification(msg.notifs[0]);
    }
  });

  // Request buffered notifications from SW (app just opened)
  navigator.serviceWorker.ready.then(function(reg) {
    if (reg.active) reg.active.postMessage({ type: 'get-pending-notifs' });
  }).catch(function() {});

  // Handle cold-start from OS notification tap (?_notif=...)
  try {
    var _notifRaw = new URLSearchParams(location.search).get('_notif');
    if (_notifRaw) {
      var _notifData = JSON.parse(decodeURIComponent(_notifRaw));
      if (!_notifData.ts) _notifData.ts = (_notifData.data && _notifData.data.originalTs) || Date.now();
      history.replaceState({}, '', location.pathname + location.hash);
      saveNotifToHistory(_notifData);
      setTimeout(function() { showInAppNotification(_notifData); }, 800);
    }
  } catch(_) {}

  // Restore unread badge on load
  try {
    var _savedUnread = parseInt(localStorage.getItem('driver_notif_unread') || '0', 10) || 0;
    if (_savedUnread > 0) _applyBadgeCount(_savedUnread);
  } catch(_) {}
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

var _grPctTimer = null;
var _grDone = false;
var _GR_CIRC = 408;

function _grSetRing(pct) {
  var ring = document.querySelector('#greeting .gr-ring-prog');
  if (ring) ring.style.strokeDashoffset = String(_GR_CIRC * (1 - pct / 100));
}

function _grAnimatePct() {
  clearInterval(_grPctTimer);
  _grDone = false;
  var el  = document.getElementById('gr-pct');
  var lbl = document.querySelector('#greeting .gr-ring-lbl');
  var gr  = document.getElementById('greeting');
  if (!el) return;
  el.textContent = '0%';
  var start = performance.now(), delay = 700, dur = 2100;
  var CAP = 90, CRAWL_MAX = 97;
  var crawling = false;
  _grPctTimer = setInterval(function() {
    if (_grDone) return;
    var t = performance.now() - start - delay;
    if (t < 0) return;
    var p = Math.min(1, t / dur);
    var eased = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2,2)/2;
    var pct;
    if (p < 1) {
      pct = eased * CAP;
    } else {
      if (!crawling) {
        crawling = true;
        if (gr)  gr.classList.add('greeting-waiting');
        if (lbl) lbl.textContent = 'מתחבר…';
      }
      var over = (performance.now() - (start + delay + dur)) / 1000;
      pct = CAP + (CRAWL_MAX - CAP) * (1 - Math.exp(-over / 2.2));
    }
    el.textContent = Math.round(pct) + '%';
    _grSetRing(pct);
  }, 30);
}

function _grComplete(cb) {
  _grDone = true;
  clearInterval(_grPctTimer);
  var el  = document.getElementById('gr-pct');
  var lbl = document.querySelector('#greeting .gr-ring-lbl');
  var gr  = document.getElementById('greeting');
  if (gr)  { gr.classList.remove('greeting-waiting'); gr.classList.add('greeting-complete'); }
  if (el)  el.textContent = '100%';
  if (lbl) lbl.textContent = 'מוכן';
  _grSetRing(100);
  setTimeout(function() { if (cb) cb(); }, 350);
}

function _grFillLastLogin(iso, llWrap) {
  if (!iso || !llWrap) return false;
  var d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  document.getElementById('gr-ll-date').textContent =
    String(d.getDate()).padStart(2,'0') + '/' +
    String(d.getMonth()+1).padStart(2,'0') + '/' +
    d.getFullYear();
  document.getElementById('gr-ll-time').textContent =
    String(d.getHours()).padStart(2,'0') + ':' +
    String(d.getMinutes()).padStart(2,'0');
  llWrap.style.display = '';
  return true;
}

function showGreeting(holderName, emailKey, vehicleKey) {
  hideLoader();

  document.getElementById('gr-time').textContent = getGreeting();
  document.getElementById('gr-name').textContent = holderName || '';

  // last-login: read localStorage synchronously — zero delay, shown together with greeting
  var llWrap = document.getElementById('gr-lastlogin');
  if (llWrap) llWrap.style.display = 'none';
  var cachedIso = null;
  try { cachedIso = (emailKey && vehicleKey) ? localStorage.getItem(_llCacheKey(emailKey, vehicleKey)) : null; } catch(_e) {}
  if (!_grFillLastLogin(cachedIso, llWrap)) {
    // no cache (new device) — try Firebase async after auth
    _fbReadLastLoginOnce(emailKey, vehicleKey, function(iso) { _grFillLastLogin(iso, llWrap); });
  }

  _grAnimatePct();
  const el = document.getElementById('greeting');
  el.classList.remove('hidden');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { el.classList.add('gr-show'); });
  });
}

function hideGreeting() {
  clearInterval(_grPctTimer);
  _grDone = true;
  const el = document.getElementById('greeting');
  el.style.transition = 'opacity .4s ease';
  el.style.opacity = '0';
  setTimeout(function() {
    el.classList.add('hidden');
    el.classList.remove('gr-show', 'greeting-waiting', 'greeting-complete');
    var lbl  = el.querySelector('.gr-ring-lbl');  if (lbl)  lbl.textContent = 'טוען';
    var ring = el.querySelector('.gr-ring-prog'); if (ring) ring.style.strokeDashoffset = '';
    el.style.opacity = '';
    el.style.transition = '';
  }, 420);
}

/* ══ Boot ══ */
/* ── Version display — fetches latest commit from GitHub ── */
var __latestVerLabel = '';
(function() {
  var el = document.getElementById('splash-ver-text');
  if (!el) return;
  var LS_KEY = '_aleh_ver_label';
  // Show cached label immediately (instant, no flicker)
  try {
    var cached = localStorage.getItem(LS_KEY);
    if (cached) { el.textContent = cached; __latestVerLabel = 'commit ' + cached; }
  } catch(e) {}
  // Fetch fresh from local version.json (always available, no rate limits)
  fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.sha) return;
      var raw = data.date || '';
      var dt = raw ? new Date(raw) : null;
      var fmt = dt && !isNaN(dt) ? (
        ('0'+dt.getDate()).slice(-2) + '/' +
        ('0'+(dt.getMonth()+1)).slice(-2) + ' ' +
        ('0'+dt.getHours()).slice(-2) + ':' +
        ('0'+dt.getMinutes()).slice(-2)
      ) : '';
      var swV = data.swVersion ? ' [' + data.swVersion + ']' : '';
      var label = data.sha + (fmt ? ' · ' + fmt : '') + swV;
      __latestVerLabel = 'commit ' + label;
      el.textContent = label;
      try { localStorage.setItem(LS_KEY, label); } catch(e){}
    })
    .catch(function() {
      // version.json not found — try GitHub API as last resort
      fetch('https://api.github.com/repos/uzim4414/aleh-driver/commits/main', {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (!data || !data.sha) return;
        var sha = data.sha.slice(0,7);
        var raw = (data.commit&&data.commit.author&&data.commit.author.date)||'';
        var dt = raw ? new Date(raw) : null;
        var fmt = dt ? (('0'+dt.getDate()).slice(-2)+'/'+('0'+(dt.getMonth()+1)).slice(-2)+' '+('0'+dt.getHours()).slice(-2)+':'+('0'+dt.getMinutes()).slice(-2)) : '';
        var label = sha + (fmt ? ' · ' + fmt : '');
        __latestVerLabel = 'commit ' + label;
        el.textContent = label;
        try { localStorage.setItem(LS_KEY, label); } catch(e){}
      }).catch(function(){});
    });
})();

/* ── Update banner: stunning slide-up + animated progress, auto-reload ── */
function showUpdateBanner() {
  var banner = document.getElementById('splash-update-banner');
  if (!banner || banner.dataset.shown === '1') return;
  banner.dataset.shown = '1';
  var bar   = document.getElementById('sub-progress-bar');
  var label = document.getElementById('sub-ver-label');
  if (label) label.innerHTML = (__latestVerLabel || 'מתקין עדכון') + '<span class="blink">▋</span>';
  banner.classList.remove('hidden');
  /* kick the progress bar after the slide-up settles */
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { if (bar) bar.style.width = '100%'; });
  });
  setTimeout(function() {
    try { window.location.reload(); } catch (e) {}
  }, 2700);
}
function showUpToDate() {
  var banner = document.getElementById('splash-update-banner');
  var title  = document.getElementById('sub-title');
  if (!banner) return;
  banner.dataset.shown = '1';
  banner.classList.add('ver-ok');
  if (title) title.textContent = '✓ גירסה עדכנית';
  var wrap = document.getElementById('sub-progress-wrap');
  var label = document.getElementById('sub-ver-label');
  if (wrap) wrap.style.display = 'none';
  if (label) label.textContent = '';
  banner.classList.remove('hidden');
  setTimeout(function() {
    banner.classList.add('fade-out');
    setTimeout(function() { banner.classList.add('hidden'); }, 500);
  }, 1400);
}

// Ask the active service worker for its CACHE_NAME (the build version).
// Returns a Promise that resolves to the version string, or '' if unavailable.
function _getAppVersion() {
  return new Promise(function(resolve) {
    if (!('serviceWorker' in navigator)) { resolve(''); return; }
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      var reg = regs && regs[0];
      var sw = reg && (reg.active || navigator.serviceWorker.controller);
      if (!sw) { resolve(''); return; }
      var ch = new MessageChannel();
      var done = false;
      ch.port1.onmessage = function(ev) { if (!done) { done = true; resolve(ev.data || ''); } };
      try { sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]); }
      catch (_) { resolve(''); return; }
      setTimeout(function() { if (!done) { done = true; resolve(''); } }, 2000);
    }).catch(function() { resolve(''); });
  });
}

// ══════════════════════════════════════════════════════════════════
// bfcache guard — Samsung Internet / Chrome משחזרים את הדף מה-cache
// בזיכרון אחרי location.reload(). DOMContentLoaded לא רץ כלל, ה-DOM
// מוצג כמו לפני logout (main app עם נתוני רכב). pageshow עם e.persisted
// הוא האירוע היחיד שמופעל במקרה זה.
// אם אין session תקף → reload אמיתי שמריץ מחדש את ה-boot.
// ══════════════════════════════════════════════════════════════════
window.addEventListener('pageshow', function(e) {
  if (!e.persisted) return;
  // Samsung Internet bfcache: תמיד reload מלא ללא יוצא מהכלל.
  // ללא guards — כל URL (כולל ?_lo=, ?_bfc=, נקי) מקבל reload.
  // לולאה? אינה אפשרית: reload(true) מייצר ניווט חדש → pageshow(e.persisted=false) → return.
  // Guards על ?_lo=/?_bfc= אסורים — גרמו ל-regression (v243/v244/v245).
  window.location.reload(true);
});

document.addEventListener('DOMContentLoaded', async function() {

  // Handle OAuth implicit-flow redirect callback (fallback for browsers where GSI One Tap fails)
  if (location.hash && location.hash.indexOf('id_token') !== -1) {
    try {
      var _hp = new URLSearchParams(location.hash.substring(1));
      var _it = _hp.get('id_token');
      var _isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if (_it && _isNative) {
        // Native APK: token came back in the WebView hash (web-redirect fallback
        // path). Complete login in-place and clean the URL so the PWA does not
        // re-render the login screen and force a second account selection (problem 2).
        history.replaceState(null, '', location.pathname);
        window._userInitiatedLogin = true;
        handleGoogleCredential({ credential: _it });
        return;
      }
      if (_it && window.name === 'aleh_gauth' && !_isNative) {
        // OAuth popup opened by _loginPopupOAuth(): hand the token back to the
        // main PWA window and close. postMessage when opener survived; localStorage
        // 'storage' event as fallback when the browser nulled opener.
        history.replaceState({}, '', location.pathname);
        var _handed = false;
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'aleh-oauth-token', idToken: _it }, window.location.origin);
            _handed = true;
          }
        } catch(_) {}
        if (!_handed) {
          try { localStorage.setItem('aleh_oauth_token', _it); } catch(_) {}
        }
        try { window.close(); } catch(_) {}
        // If the token was NOT handed off and the browser refused to close —
        // continue login here so the user is never stuck on a blank window.
        // (When handed off, the main window logs in; don't double-login here.)
        if (!_handed) {
          setTimeout(function() {
            // If the main window consumed the localStorage token (removed the key),
            // it already logged in — don't double-login in the popup.
            var _consumed = false;
            try { _consumed = localStorage.getItem('aleh_oauth_token') === null; } catch(_) {}
            if (_consumed) { try { window.close(); } catch(_) {} return; }
            try { localStorage.removeItem('aleh_oauth_token'); } catch(_) {}
            window._userInitiatedLogin = true;
            handleGoogleCredential({ credential: _it });
          }, 800);
        }
        return;
      }
      if (_it) {
        history.replaceState({}, '', location.pathname);
        // Native-APK return (URL-based token handoff — NO localStorage bridge:
        // Chrome and the Capacitor WebView have SEPARATE storage even for the
        // same origin). If this page is running OUTSIDE Capacitor it may be the
        // external Chrome tab opened by the APK via window.open(_system) —
        // forward the token in the deep-link URL itself. Android's intent-filter
        // (org.aleh.driverapp://auth-complete) brings MainActivity to the
        // foreground; 'appUrlOpen' fires and _handleNativeOAuthUrl() extracts
        // the token. In a plain desktop/PWA browser the unknown scheme is a
        // no-op and login simply continues below as usual.
        if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
          try {
            window.location.replace('org.aleh.driverapp://auth-complete#id_token=' + encodeURIComponent(_it));
          } catch(_) {}
        }
        window._userInitiatedLogin = true; // OAuth redirect is always user-initiated
        handleGoogleCredential({ credential: _it });
        return;
      }
    } catch(_) {}
  }

  if ('serviceWorker' in navigator) {
    /* updateViaCache:'none' — never serve sw.js from the HTTP cache; always hit network.
       This is the fix for Desktop Chrome not picking up new SW versions. */
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function(reg) {
      /* בדוק עדכון בכל טעינה */
      reg.update();
      reg.addEventListener('updatefound', function() {
        const sw = reg.installing;
        if (!navigator.serviceWorker.controller) return; /* התקנה ראשונה — לא reload */
        showUpdateBanner(); /* באנר עדכון מהמם — מבצע reload בעצמו */
        sw.addEventListener('statechange', function() {
          /* New SW finished installing — tell it to activate immediately
             (no waiting for all tabs to close). Desktop Chrome otherwise parks it in "waiting". */
          if (sw.state === 'installed') {
            try { sw.postMessage({ type: 'skip-waiting' }); } catch (_) {}
          }
          if (sw.state === 'redundant') showUpToDate();
        });
      });
    }).catch(function(e) {
      console.warn('SW:', e.message);
    });
  }

  // Update splash footer version from the active SW cache name (e.g. "aleh-driver-v189" → "v189")
  _getAppVersion().then(function(v) {
    var el = document.getElementById('app-version-display');
    if (el && v) {
      var m = String(v).match(/v\d+/i);
      el.textContent = m ? m[0] : v;
    }
  }).catch(function(){});

  // Guard: אם הגענו מ-logout (?_lo=) — כפה null session ונקה URL (מניעת גרסאות SW ישנות שיקראו startApp)
  var _isPostLogout = location.search.indexOf('_lo=') !== -1;
  if (_isPostLogout) {
    try { localStorage.removeItem(SESSION_KEY); } catch(_) {}
    try { history.replaceState({}, '', location.pathname); } catch(_) {}
  }
  // Try cached session
  const session = _isPostLogout ? null : loadSession();

  // ═══ WebAuthn check — FIRST (before PIN, before Google) ═══
  // PIN_SESSION_KEY נשמר — bio זקוק לו לכניסה מהירה אחרי logout (idToken cached).
  // הכפתור מוצג, WebAuthn לא מופעל אוטומטית — רק בלחיצת המשתמש.
  var _bioData = _bioLoad();
  if (_bioData && _bioAvailable()) {
    _showBioLoginButton(_bioData);
  }
  var _bioShown = !!(_bioData && _bioAvailable());
  _wireLoginRipple();
  if (!_bioShown) {
    // אין ביומטרי רשום — פאנל במצב "Google בלבד"
    var _lbp = document.getElementById('login-buttons-panel');
    if (_lbp) _lbp.classList.add('nobio');
  }
  var _pinData = _pinLoad();
  var _pinSess = _pinSessionLoad();
  // אם כניסה ביומטרית זמינה על ה-splash — היא קודמת ל-PIN. אל תציג קודפד.
  if (!_bioShown && _pinData && _pinSess) {
    hideLoader();
    _showPinScreen(_pinSess);
    return; // ← חיוני: עצור boot, אל תיגע ב-Google
  }
  // session רגיל ללא PIN — שמור pin session להצעה עתידית
  if (!_pinData && session && session.token !== 'demo_token' && session.userInfo && !_isTokenExpired(session.token)) {
    _pinSessionSave(session.userInfo.email, session.vehicleData, session.userInfo, session.token);
  }

  if (session && session.token !== 'demo_token') {
    STATE.idToken = session.token;
    STATE.vehicle = session.vehicleData;
    STATE._washLogLoaded = false; STATE.washLog = [];
    STATE.user    = session.userInfo;

    // אם token פג, נקה והמשך ל-login רגיל (ללא overlay מבהיל)
    if (_isTokenExpired(STATE.idToken)) {
      localStorage.removeItem(SESSION_KEY);
      STATE.idToken = null;
      STATE.vehicle = null;
      STATE._washLogLoaded = false; STATE.washLog = [];
      STATE.user    = null;
    } else {
      try {
        _fbSignIn(STATE.idToken).catch(function() {}); // Firebase Auth מ-session שמור — non-blocking
        hideLoader();
        var _sEk = STATE.user && STATE.user.email ? STATE.user.email.replace(/[.#$[\]]/g,'_') : '';
        var _sVk = _vehKey(STATE.vehicle);
        showGreeting((STATE.vehicle && STATE.vehicle.holder) || (STATE.user && STATE.user.name), _sEk, _sVk);
        await loadFullData();
        _grComplete(function() {
          hideGreeting();
          _fbWriteLastLogin(_sEk, _sVk);
          _bioSessionStart();
          startApp();
        });
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
      window._userInitiatedLogin = true;
      // Native APK: use SocialLogin plugin (Credential Manager bottom sheet).
      if (_isNativeApp()) { _loginFallbackRedirect(); return; }
      // PWA: מחק g_state cookie לפני prompt כדי לאפס One Tap backoff (suppressed_by_user).
      // g_state נשמר על הדומיין שלנו (לא google.com) — אפשר לנקות אותו.
      try { document.cookie = 'g_state=;max-age=0;path=/'; } catch(_) {}
      try {
        google.accounts.id.prompt(function(notification) {
          var _notShown = false;
          try { _notShown = notification.isNotDisplayed() || notification.isSkippedMoment(); }
          catch(_ne) { _notShown = true; }
          if (_notShown) _loginFallbackRedirect();
        });
      } catch(e) {
        console.warn('[auth] prompt() threw:', e && e.message);
        _loginFallbackRedirect();
      }
    });
  };
  script.onerror = function() {
    // GIS script failed to load — attach direct fallback handler
    document.getElementById('login-btn').addEventListener('click', function() {
      window._userInitiatedLogin = true;
      if (_isNativeApp()) { _loginFallbackRedirect(); } else { _loginFallbackRedirect(); }
    });
  };
  document.head.appendChild(script);
});

/* ══ רענון נתונים בחזרה לאפליקציה ══ */
var _lastRefresh = 0;
var _REFRESH_MIN = 5 * 60 * 1000; // 5 דקות מינימום בין רענונים

var _lastApptSync = 0;
var _APPT_SYNC_MIN = 60 * 1000; // throttle appointment sync to at most once/min on refocus
document.addEventListener('visibilitychange', async function() {
  if (document.visibilityState !== 'visible') return;
  // Fake-screen guard: #app גלוי אבל אין session — מצב לא תקין (bfcache / Samsung restore).
  // מופעל לפני כל guard אחר כדי לתפוס כל מנגנון שמציג את האפליקציה ללא אימות.
  var _fsApp = document.getElementById('app');
  if (_fsApp && !_fsApp.classList.contains('hidden') && _fsApp.style.display !== 'none' && !STATE.idToken) {
    window.location.reload(true);
    return;
  }
  if (!STATE.idToken || !STATE.vehicle) return;
  if (_isTokenExpired(STATE.idToken)) return; // אל תקרא _sessionExpired בפורגראונד — יציג re-login בהפתעה
  // Throttled appointment sync — not on every screen-on
  if (Date.now() - _lastApptSync >= _APPT_SYNC_MIN) {
    try { _syncActiveAppointmentFromGAS(); } catch(_) {}
    _lastApptSync = Date.now();
  }
  if (Date.now() - _lastRefresh < _REFRESH_MIN) return;
  try {
    await loadFullData();
    renderAll();
    _lastRefresh = Date.now();
  } catch(e) {
    console.warn('visibilitychange refresh error:', e.message);
  }
});

// ═══ TEST HUB ═══

APP.openTestHub = function() {
  var v = STATE.vehicle || {};
  // date-gate: חלון 40 יום לפני testDue
  if (v.testDue && !v.testDone && !v.testPendingApproval) {
    var daysToTest = Math.round((new Date(v.testDue) - new Date()) / 86400000);
    if (daysToTest > 40) {
      APP._showAllGoodPopup(daysToTest);
      return;
    }
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const hub = document.getElementById('screen-testhub');
  if (hub) {
    hub.classList.add('active');
    APP._initTestHub();
  }
};

APP.closeTestHub = function() {
  document.getElementById('screen-testhub').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
};

APP._showAllGoodPopup = function(days) {
  var overlay = document.getElementById('th-allgood-overlay');
  if (!overlay) return;
  var daysEl = document.getElementById('th-allgood-days');
  if (daysEl) daysEl.textContent = days;
  var labelEl = document.getElementById('th-allgood-days-label');
  if (labelEl) labelEl.textContent = days === 1 ? 'יום' : 'ימים';
  // retrigger one-shot CSS animation on reopen (animation-fill-mode:both blocks replay)
  var _agCard = document.getElementById('th-allgood-card');
  if (_agCard) { _agCard.style.animation = 'none'; void _agCard.offsetWidth; _agCard.style.animation = ''; }
  overlay.style.display = 'flex';
  // סגירה בלחיצה על backdrop
  overlay.onclick = function(e) {
    if (e.target === overlay) APP._closeAllGoodPopup();
  };
};

APP._closeAllGoodPopup = function() {
  var overlay = document.getElementById('th-allgood-overlay');
  if (overlay) overlay.style.display = 'none';
};

// ═══ WASH ═══
// Stations enriched with Google-Places-style data (rating/hours/phone/addr/waze)
// to mirror the Test-Hub stations panel architecture.
APP._WASH_STATIONS = [
  {id:'1001',name:'פז תחנת שפיים',city:'שפיים',lat:32.1975,lng:34.8229,addr:'כביש 2, שפיים',phone:'09-9595001',rating:4.5,ratingCount:312,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.1975,34.8229&navigate=yes'},
  {id:'1002',name:'פז גבעת שמואל',city:'גבעת שמואל',lat:32.0789,lng:34.8492,addr:'מרכז מסחרי, גבעת שמואל',phone:'03-5310022',rating:4.1,ratingCount:148,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0789,34.8492&navigate=yes'},
  {id:'1003',name:'פז פתח תקווה מרכז',city:'פתח תקווה',lat:32.0871,lng:34.8867,addr:'ז\'בוטינסקי 90, פתח תקווה',phone:'03-9301133',rating:3.9,ratingCount:201,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0871,34.8867&navigate=yes'},
  {id:'1004',name:'פז ראשון לציון',city:'ראשון לציון',lat:31.9642,lng:34.7928,addr:'הרצל 120, ראשון לציון',phone:'03-9651044',rating:4.3,ratingCount:267,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.9642,34.7928&navigate=yes'},
  {id:'1005',name:'פז נתניה',city:'נתניה',lat:32.3215,lng:34.8563,addr:'הרצל 45, נתניה',phone:'09-8612055',rating:4.0,ratingCount:176,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.3215,34.8563&navigate=yes'},
  {id:'1006',name:'פז חיפה קריות',city:'קרית ביאליק',lat:32.8234,lng:35.0812,addr:'דרך עכו 80, קרית ביאליק',phone:'04-8770066',rating:3.7,ratingCount:134,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.8234,35.0812&navigate=yes'},
  {id:'1007',name:'פז באר שבע צפון',city:'באר שבע',lat:31.2693,lng:34.7832,addr:'דרך חברון 10, באר שבע',phone:'08-6230077',rating:3.6,ratingCount:98,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.2693,34.7832&navigate=yes'},
  {id:'1008',name:'פז ירושלים מלחה',city:'ירושלים',lat:31.7456,lng:35.1874,addr:'אגודת ספורט הפועל 5, ירושלים',phone:'02-6790088',rating:4.2,ratingCount:289,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.7456,35.1874&navigate=yes'},
  {id:'1009',name:'פז תל אביב ארלוזרוב',city:'תל אביב',lat:32.0853,lng:34.7818,addr:'ארלוזרוב 14, תל אביב',phone:'03-6951099',rating:4.4,ratingCount:354,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0853,34.7818&navigate=yes'},
  {id:'1010',name:'פז הרצליה פיתוח',city:'הרצליה',lat:32.1527,lng:34.8184,addr:'מדינת היהודים 60, הרצליה',phone:'09-9560110',rating:4.6,ratingCount:223,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.1527,34.8184&navigate=yes'},
  {id:'1011',name:'פז רעננה',city:'רעננה',lat:32.1842,lng:34.8706,addr:'אחוזה 200, רעננה',phone:'09-7710121',rating:4.2,ratingCount:167,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.1842,34.8706&navigate=yes'},
  {id:'1012',name:'פז כפר סבא',city:'כפר סבא',lat:32.1752,lng:34.9094,addr:'ויצמן 110, כפר סבא',phone:'09-7650132',rating:3.8,ratingCount:121,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.1752,34.9094&navigate=yes'},
  {id:'1013',name:'פז מודיעין',city:'מודיעין',lat:31.8929,lng:35.0108,addr:'עמק האלה 1, מודיעין',phone:'08-9701143',rating:4.3,ratingCount:198,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.8929,35.0108&navigate=yes'},
  {id:'1014',name:'פז אשדוד',city:'אשדוד',lat:31.7957,lng:34.6506,addr:'הגדוד העברי 8, אשדוד',phone:'08-8560154',rating:3.9,ratingCount:145,hoursWeekday:[8,20],hoursFriday:[7,14],hours:'א-ה 08:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.7957,34.6506&navigate=yes'},
  {id:'1015',name:'פז אשקלון',city:'אשקלון',lat:31.6688,lng:34.5742,addr:'בן גוריון 25, אשקלון',phone:'08-6720165',rating:3.7,ratingCount:87,hoursWeekday:[8,20],hoursFriday:[7,14],hours:'א-ה 08:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.6688,34.5742&navigate=yes'},
  {id:'1016',name:'פז נהריה',city:'נהריה',lat:33.0077,lng:35.0918,addr:'הגעתון 40, נהריה',phone:'04-9920176',rating:4.0,ratingCount:76,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=33.0077,35.0918&navigate=yes'},
  {id:'1017',name:'פז עכו',city:'עכו',lat:32.9230,lng:35.0818,addr:'דרך הארבעה 12, עכו',phone:'04-9810187',rating:3.6,ratingCount:64,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.9230,35.0818&navigate=yes'},
  {id:'1018',name:'פז טבריה',city:'טבריה',lat:32.7922,lng:35.5311,addr:'הגליל 2, טבריה',phone:'04-6720198',rating:4.1,ratingCount:109,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.7922,35.5311&navigate=yes'},
  {id:'1019',name:'פז חדרה',city:'חדרה',lat:32.4341,lng:34.9192,addr:'הנשיא ויצמן 75, חדרה',phone:'04-6340209',rating:3.8,ratingCount:118,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.4341,34.9192&navigate=yes'},
  {id:'1020',name:'פז קרית גת',city:'קרית גת',lat:31.6099,lng:34.7738,addr:'שדרות לכיש 30, קרית גת',phone:'08-6810210',rating:3.7,ratingCount:55,hoursWeekday:[8,20],hoursFriday:[7,14],hours:'א-ה 08:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.6099,34.7738&navigate=yes'},
  {id:'1021',name:'פז לוד',city:'לוד',lat:31.9516,lng:34.8951,addr:'דוד המלך 18, לוד',phone:'08-9240221',rating:3.5,ratingCount:62,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.9516,34.8951&navigate=yes'},
  {id:'1022',name:'פז רמלה',city:'רמלה',lat:31.9293,lng:34.8654,addr:'הרצל 88, רמלה',phone:'08-9270232',rating:3.6,ratingCount:71,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.9293,34.8654&navigate=yes'},
  {id:'1023',name:'פז רחובות',city:'רחובות',lat:31.8969,lng:34.8178,addr:'הרצל 150, רחובות',phone:'08-9450243',rating:4.2,ratingCount:163,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.8969,34.8178&navigate=yes'},
  {id:'1024',name:'פז גדרה',city:'גדרה',lat:31.8105,lng:34.7753,addr:'מנחם בגין 9, גדרה',phone:'08-8590254',rating:3.9,ratingCount:48,hoursWeekday:[8,20],hoursFriday:[7,14],hours:'א-ה 08:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=31.8105,34.7753&navigate=yes'},
  {id:'1025',name:'פז בת ים',city:'בת ים',lat:32.0200,lng:34.7512,addr:'בלפור 50, בת ים',phone:'03-5060265',rating:3.8,ratingCount:132,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0200,34.7512&navigate=yes'},
  {id:'1026',name:'פז חולון',city:'חולון',lat:32.0178,lng:34.7764,addr:'סוקולוב 70, חולון',phone:'03-5030276',rating:4.0,ratingCount:154,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0178,34.7764&navigate=yes'},
  {id:'1027',name:'פז פ"ת אפקה',city:'פתח תקווה',lat:32.1001,lng:34.8713,addr:'אם המושבות 95, פתח תקווה',phone:'03-9300287',rating:4.1,ratingCount:141,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.1001,34.8713&navigate=yes'},
  {id:'1028',name:'פז יהוד',city:'יהוד',lat:32.0302,lng:34.8897,addr:'מרבד הקסמים 4, יהוד',phone:'03-5360298',rating:3.7,ratingCount:58,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0302,34.8897&navigate=yes'},
  {id:'1029',name:'פז אור יהודה',city:'אור יהודה',lat:32.0320,lng:34.8583,addr:'העצמאות 22, אור יהודה',phone:'03-5340309',rating:3.8,ratingCount:67,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0320,34.8583&navigate=yes'},
  {id:'1030',name:'פז ראש העין',city:'ראש העין',lat:32.0952,lng:34.9561,addr:'שבזי 33, ראש העין',phone:'03-9020310',rating:4.0,ratingCount:103,hoursWeekday:[7,20],hoursFriday:[7,14],hours:'א-ה 07:00–20:00 | ו 07:00–14:00',waze:'waze://?ll=32.0952,34.9561&navigate=yes'},
  // Missing stations from Yellow app — added 2026-06-28
  { id:'paz_ziv_on', name:'פז זיו און', city:'תל אביב-יפו', addr:'דרך הטייסים 126', lat:32.0483, lng:34.7558, rating:4.2, ratingCount:180, hoursWeekday:[7,20], hoursFriday:[7,14], hours:'א-ה 07:00–20:00 | ו 07:00–14:00', phone:'', waze:'waze://?ll=32.0483,34.7558&navigate=yes' },
  { id:'paz_abu_kabir', name:'פז אבו כביר', city:'תל אביב-יפו', addr:'הרצל 188', lat:32.0488, lng:34.7658, rating:4.0, ratingCount:95, hoursWeekday:[6,22], hoursFriday:[6,14], hours:'א-ה 06:00–22:00 | ו 06:00–14:00', phone:'', waze:'waze://?ll=32.0488,34.7658&navigate=yes' },
  { id:'paz_ben_zvi', name:'פז שדרות בן צבי', city:'תל אביב-יפו', addr:'שד\' בן צבי 46', lat:32.0573, lng:34.7680, rating:4.1, ratingCount:210, hoursWeekday:[7,20], hoursFriday:[7,14], hours:'א-ה 07:00–20:00 | ו 07:00–14:00', phone:'', waze:'waze://?ll=32.0573,34.768&navigate=yes' },
  { id:'paz_nachalat_yehuda', name:'פז נחלת יהודה', city:'ראשון לציון', addr:'כביש בית דגן-ראשל"צ', lat:31.9850, lng:34.8020, rating:4.3, ratingCount:150, hoursWeekday:[7,20], hoursFriday:[7,14], hours:'א-ה 07:00–20:00 | ו 07:00–14:00', phone:'', waze:'waze://?ll=31.985,34.802&navigate=yes' },
  { id:'paz_aviel_superland', name:'פז אביאל (סופרלנד)', city:'ראשון לציון', addr:'שד\' מרילנד', lat:31.9972, lng:34.8140, rating:4.4, ratingCount:320, hoursWeekday:[7,20], hoursFriday:[7,14], hours:'א-ה 07:00–20:00 | ו 07:00–14:00', phone:'', waze:'waze://?ll=31.9972,34.814&navigate=yes' }
];
APP._washCurrentStation = null;
APP._washWazeLaunched = false;

APP._washMonthCount = function() {
  if (typeof STATE._realWashCount === 'number') return STATE._realWashCount;
  var thisMonth = new Date().toISOString().slice(0,7);
  return (STATE.washLog || []).filter(function(w){ return w.date && w.date.slice(0,7) === thisMonth; }).length;
};

/* Eagerly load this month's wash log from Firebase so the home-screen badge
   is correct on every app open — without requiring the user to open the wash
   screen. Idempotent via STATE._washLogLoaded. Returns a Promise. */
APP._loadWashLog = function() {
  if (STATE._washLogLoaded) return Promise.resolve();
  STATE._washLogLoaded = true;
  var vehFb = STATE.vehicle;
  var vid = vehFb && (vehFb.id || vehFb.vehicleId || vehFb.num);
  if (!vid || typeof firebase === 'undefined') return Promise.resolve();
  var thisMonth = new Date().toISOString().slice(0,7).replace('-','');
  return firebase.database().ref('washLog/' + vid + '/' + thisMonth).once('value').then(function(snap) {
    if (snap.exists()) {
      var data = snap.val();
      if (!STATE.washLog) STATE.washLog = [];
      Object.values(data).forEach(function(entry) {
        if (entry && entry.date) {
          var exists = STATE.washLog.some(function(w){ return w.date === entry.date && w.stationName === entry.stationName; });
          if (!exists) STATE.washLog.push({ date: entry.date, stationName: entry.stationName || '' });
        }
      });
    }
    APP._updateWashBadge();
    // Sync real wash count from GAS (includes Pazomot imports)
    var _syncVid = STATE.vehicle && (STATE.vehicle.id || STATE.vehicle.vehicleId || STATE.vehicle.num);
    var _syncMon = new Date().toISOString().slice(0,7);
    if (_syncVid) {
      gasPostForm('get_wash_status', {vehicleId: _syncVid, monthKey: _syncMon}).then(function(r) {
        if (r && typeof r.thisMonth === 'number') {
          STATE._realWashCount = r.thisMonth;
          if (typeof APP._wsUpdateQuota === 'function') APP._wsUpdateQuota();
          if (typeof APP._updateWashBadge === 'function') APP._updateWashBadge();
        }
      }).catch(function(e){ console.warn('[get_wash_status]', e); });
    }
  }).catch(function(e){ console.warn('[washLog fetch]', e); });
};

APP.openWash = function() {
  if (!STATE.vehicle) return;
  // Ensure washLog is loaded from Firebase (survives reload).
  // _loadWashLog is idempotent (no-op if already loaded at startup).
  if (!STATE._washLogLoaded) {
    APP._loadWashLog().then(function() {
      var used2 = APP._washMonthCount();
      APP._wsUpdateQuota(used2);
      // Re-check quota now that Firebase data is loaded
      if (used2 >= 4 && STATE.currentScreen === 'wash') {
        var scr = document.getElementById('screen-wash');
        if (scr) { scr.classList.remove('active'); scr.style.display = 'none'; }
        document.getElementById('wash-quota-popup').style.display = 'flex';
      }
    });
  }
  var used = APP._washMonthCount();
  if (used >= 4) {
    document.getElementById('wash-quota-popup').style.display = 'flex';
    return;
  }
  APP._washWazeLaunched = false;
  APP._washCurrentStation = null;
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  var scr = document.getElementById('screen-wash');
  if (scr) { scr.style.display = ''; scr.classList.add('active'); }
  STATE.currentScreen = 'wash';
  APP._wsUpdateQuota(used);
  APP._wsStartPanel();
};

APP.closeWash = function() {
  var scr = document.getElementById('screen-wash');
  if (scr) scr.classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  STATE.currentScreen = 'home';
};

// ═══ WASH TABS: stations / history ═══
APP._wsTab = function(tab) {
  var stationsPanel = document.getElementById('ws-panel-stations');
  var historyPanel  = document.getElementById('ws-panel-history');
  var tabStations   = document.getElementById('ws-tab-stations');
  var tabHistory    = document.getElementById('ws-tab-history');
  if (tab === 'history') {
    if (stationsPanel) stationsPanel.style.display = 'none';
    if (historyPanel)  historyPanel.style.display  = '';
    if (tabStations)   tabStations.classList.remove('active');
    if (tabHistory)    tabHistory.classList.add('active');
    APP._wsLoadHistory();
  } else {
    if (stationsPanel) stationsPanel.style.display = '';
    if (historyPanel)  historyPanel.style.display  = 'none';
    if (tabStations)   tabStations.classList.add('active');
    if (tabHistory)    tabHistory.classList.remove('active');
  }
};

// Load wash history (last 3 months) from Firebase washLog
APP._wsLoadHistory = function() {
  var listEl = document.getElementById('ws-history-list');
  var emptyEl = document.getElementById('ws-history-empty');
  if (!listEl) return;
  var veh = STATE.vehicle;
  var vid = veh && (veh.id || veh.vehicleId || veh.num);
  if (!vid || typeof firebase === 'undefined') {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  listEl.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.3);font-size:13px;">טוען...</div>';
  if (emptyEl) emptyEl.style.display = 'none';
  // Read last 3 months
  var months = [];
  var now = new Date();
  for (var i = 0; i < 3; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + '' + ('0'+(d.getMonth()+1)).slice(-2));
  }
  var allWashes = [];
  var done = 0;
  months.forEach(function(m) {
    firebase.database().ref('washLog/' + vid + '/' + m).once('value').then(function(snap) {
      if (snap.exists()) {
        var val = snap.val();
        Object.keys(val).forEach(function(k) {
          var w = val[k];
          if (w && w.date) allWashes.push(w);
        });
      }
    }).catch(function(e){ console.warn('[washLog read ' + m + ']', e); }).finally(function() {
      done++;
      if (done === months.length) {
        allWashes.sort(function(a,b){ return (b.date+' '+(b.time||'')).localeCompare(a.date+' '+(a.time||'')); });
        APP._wsRenderHistory(allWashes);
      }
    });
  });
};

// Render history list + per-wash rating UI
APP._wsRenderHistory = function(washes) {
  var listEl = document.getElementById('ws-history-list');
  var emptyEl = document.getElementById('ws-history-empty');
  if (!listEl) return;
  if (!washes || !washes.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  var veh = STATE.vehicle;
  var vid = veh && (veh.id || veh.vehicleId || veh.num);
  if (!APP._wsMyRatings) {
    try { APP._wsMyRatings = JSON.parse(localStorage.getItem('ws_my_ratings')) || {}; } catch(e) { APP._wsMyRatings = {}; }
  }
  var renderAll = function() {
    listEl.innerHTML = washes.map(function(w, i) {
      var myRating = APP._wsMyRatings[w.stationId] || APP._wsMyRatings[String(w.stationId).replace(/[^0-9A-Za-z_-]/g,'_')] || null;
      var dateStr = w.date || '';
      var timeStr = w.time ? w.time.slice(0,5) : '';
      var dateHeb = dateStr ? (function(){
        var parts = dateStr.split('-');
        return parts[2]+'/'+parts[1]+'/'+parts[0];
      })() : '';
      var stationName = w.stationName || 'תחנת פז';
      var ratedHtml = myRating
        ? '<div class="ws-hi-rated"><span class="ws-hi-rated-stars">' + '★'.repeat(myRating.rating) + '☆'.repeat(5-myRating.rating) + '</span><span class="ws-hi-rated-text">הדירוג שלך</span></div>' +
          (myRating.comment ? '<div class="ws-hi-rated-comment" style="font-size:12px;color:rgba(255,255,255,.55);margin-top:6px;padding:8px 10px;background:rgba(255,255,255,.05);border-radius:10px;direction:rtl;line-height:1.5;">' + (myRating.comment+'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' : '')
        : '<div class="ws-rating-label">דרג את הרחיצה</div>' +
          '<div class="ws-stars" id="ws-stars-'+i+'">' +
          [5,4,3,2,1].map(function(s){ return '<span class="ws-star" data-v="'+s+'" data-idx="'+i+'" onclick="APP._wsStarClick(this,' + i + ')">★</span>'; }).join('') +
          '</div>' +
          '<textarea class="ws-hi-comment" id="ws-comment-'+i+'" placeholder="הערה אופציונלית..." rows="2"></textarea>' +
          '<button class="ws-hi-submit" onclick="APP._wsSubmitRating(\''+(w.stationId||'')+'\',\''+stationName.replace(/'/g,"\\'")+'\','+i+')">שלח דירוג</button>';
      return '<div class="ws-hi"><div class="ws-hi-top"><div><div class="ws-hi-station">'+
        stationName+'</div><div class="ws-hi-city">'+(w.stationCity||'')+'</div></div>'+
        '<div class="ws-hi-date"><span>'+dateHeb+'</span><span>'+timeStr+'</span></div></div>'+
        '<div class="ws-hi-divider"></div><div class="ws-hi-rating">'+ratedHtml+'</div></div>';
    }).join('');
    APP._wsHistoryWashes = washes;
    // Re-apply any in-progress star selections that survived the re-render
    if (APP._wsSelected) {
      setTimeout(function() {
        Object.keys(APP._wsSelected).forEach(function(i) {
          var sel = APP._wsSelected[i];
          if (!sel) return;
          var cont = document.getElementById('ws-stars-' + i);
          if (!cont) return;
          cont.setAttribute('data-selected', sel);
          cont.querySelectorAll('.ws-star').forEach(function(s) {
            s.classList.toggle('on', parseInt(s.getAttribute('data-v'), 10) <= sel);
          });
        });
      }, 0);
    }
  };
  if (vid && typeof firebase !== 'undefined') {
    firebase.database().ref('washRatings').once('value').then(function(snap) {
      if (snap.exists()) {
        var all = snap.val();
        // GAS sanitizes keys — match raw stationId from washes to sanitized Firebase key
        washes.forEach(function(w) {
          var sKey = String(w.stationId).replace(/[^0-9A-Za-z_-]/g,'_');
          var vKey = String(vid).replace(/[^0-9A-Za-z_-]/g,'_');
          if (all[sKey] && all[sKey][vKey]) {
            APP._wsMyRatings[sKey] = all[sKey][vKey];
            try { localStorage.setItem('ws_my_ratings', JSON.stringify(APP._wsMyRatings)); } catch(e){}
          }
        });
      }
    }).catch(function(){}).finally(function(){ renderAll(); });
  } else { renderAll(); }
};

// Star tap → set selection (stored outside DOM to survive re-renders)
APP._wsSelected = APP._wsSelected || {};
APP._wsStarClick = function(el, idx) {
  var val = parseInt(el.getAttribute('data-v'), 10);
  APP._wsSelected = APP._wsSelected || {};
  APP._wsSelected[idx] = val;
  var container = document.getElementById('ws-stars-' + idx);
  if (!container) return;
  container.querySelectorAll('.ws-star').forEach(function(s) {
    var sv = parseInt(s.getAttribute('data-v'), 10);
    s.classList.toggle('on', sv <= val);
  });
  container.setAttribute('data-selected', val);
};

// Submit rating → GAS
APP._wsSubmitRating = function(stationId, stationName, idx) {
  // Read from persistent store first (survives Firebase re-renders), fallback to DOM
  var rating = (APP._wsSelected && APP._wsSelected[idx]) || 0;
  if (!rating) {
    var container = document.getElementById('ws-stars-' + idx);
    rating = container ? parseInt(container.getAttribute('data-selected')||'0', 10) : 0;
  }
  if (!rating) { showToast('בחר דירוג (1-5 כוכבים)'); return; }
  if (!stationId) { showToast('שגיאה: מזהה תחנה חסר'); return; }
  var comment = (document.getElementById('ws-comment-'+idx)||{}).value || '';
  var veh = STATE.vehicle;
  var vid = veh && (veh.id || veh.vehicleId || veh.num);
  var driverName = (STATE.vehicle && STATE.vehicle.holder) || (STATE.user && (STATE.user.name || STATE.user.displayName)) || '';
  gasPostForm('save_wash_rating', {
    vehicleId: vid||'', stationId: stationId, rating: rating,
    comment: comment, driverName: driverName, stationName: stationName
  }).then(function(r) {
    if (!r || r.ok === false) {
      showToast('שגיאה בשמירת הדירוג: ' + ((r && r.error) || ''));
      return;
    }
    APP._wsMyRatings = APP._wsMyRatings || {};
    var _sKey = String(stationId).replace(/[^0-9A-Za-z_-]/g,'_');
    APP._wsMyRatings[_sKey] = {rating: rating, comment: comment, stationName: stationName, stationId: stationId};
    try { localStorage.setItem('ws_my_ratings', JSON.stringify(APP._wsMyRatings)); } catch(e){}
    // Optimistically update Aleh stats so badge appears immediately on station card
    APP._wsAlehStats = APP._wsAlehStats || {};
    if (r.newAvg != null && Number(r.newAvg) > 0) {
      APP._wsAlehStats[_sKey] = {avg: r.newAvg, count: r.count || 1};
      try { localStorage.setItem('ws_aleh_stats', JSON.stringify(APP._wsAlehStats)); } catch(e){}
    } else {
      var _prevStat = APP._wsAlehStats[_sKey];
      APP._wsAlehStats[_sKey] = {avg: rating, count: (_prevStat && _prevStat.count) ? _prevStat.count + 1 : 1};
      try { localStorage.setItem('ws_aleh_stats', JSON.stringify(APP._wsAlehStats)); } catch(e){}
    }
    if (typeof APP._wsRefreshRatingRows === 'function') APP._wsRefreshRatingRows();
    // Optimistic update of recent comments so modal shows immediately
    APP._wsRecentComments = APP._wsRecentComments || {};
    var _newComment = {comment: comment || '', rating: rating, driverName: driverName, ts: Date.now()};
    var _cList = APP._wsRecentComments[_sKey] ? APP._wsRecentComments[_sKey].slice() : [];
    _cList.unshift(_newComment);
    APP._wsRecentComments[_sKey] = _cList.slice(0, 10);
    try { localStorage.setItem('ws_recent_comments', JSON.stringify(APP._wsRecentComments)); } catch(e){}
    if (APP._wsSelected) delete APP._wsSelected[idx];
    APP._wsRenderHistory(APP._wsHistoryWashes || []);
    showToast('תודה! הדירוג נשמר');
  }).catch(function(err) {
    showToast('שגיאה בשמירת הדירוג');
    console.error('[wash rating]', err);
  });
};

// Cyan marker icon (mirror of _thMakeMarkerIcon)
function _wsMakeMarkerIcon(num, active) {
  return L.divIcon({
    className: '',
    html: '<div style="width:32px;height:32px;border-radius:50%;background:' + (active?'#0891b2':'#0e7490') + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;box-shadow:0 2px 12px rgba(8,145,178,.5);border:2px solid ' + (active?'#fff':'rgba(255,255,255,.3)') + ';font-family:inherit;">' + num + '</div>',
    iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-18]
  });
}

// Start panel — load Leaflet if needed then init (mirror of _thStartStations)
APP._wsStartPanel = function() {
  function start() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async function(pos) {
        await APP._initWashPanel(pos.coords.latitude, pos.coords.longitude);
      }, async function() {
        await APP._initWashPanel(null, null);
      }, {timeout:5000});
    } else {
      APP._initWashPanel(null, null);
    }
  }
  if (typeof L !== 'undefined') {
    start();
  } else {
    if (!document.getElementById('th-leaflet-css')) {
      var lCss = document.createElement('link'); lCss.id='th-leaflet-css'; lCss.rel='stylesheet'; lCss.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(lCss);
    }
    var lJs = document.createElement('script'); lJs.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    lJs.onload = start;
    document.head.appendChild(lJs);
  }
};

// Mirror of _initStationsPanel — cyan markers, Waze-only cards
APP._initWashPanel = async function(userLat, userLng) {
  var list = document.getElementById('ws-station-list');
  if (!list) return;

  // Load persisted badge data immediately (before Firebase responds)
  if (!APP._wsAlehStats || Object.keys(APP._wsAlehStats).length === 0) {
    try { APP._wsAlehStats = JSON.parse(localStorage.getItem('ws_aleh_stats')) || {}; } catch(e) { APP._wsAlehStats = {}; }
  }
  if (!APP._wsRecentComments || Object.keys(APP._wsRecentComments).length === 0) {
    try { APP._wsRecentComments = JSON.parse(localStorage.getItem('ws_recent_comments')) || {}; } catch(e) { APP._wsRecentComments = {}; }
  }

  var stations = APP._WASH_STATIONS.map(function(s) {
    var dist = (userLat && userLng) ? _thHaversine(userLat, userLng, s.lat, s.lng) : null;
    return Object.assign({}, s, {dist: dist});
  });
  if (userLat) {
    // Show only stations within 30km — expand to 100km if fewer than 3 found
    var nearby = stations.filter(function(s){ return s.dist !== null && s.dist <= 30; });
    if (nearby.length < 3) nearby = stations.filter(function(s){ return s.dist !== null && s.dist <= 100; });
    if (nearby.length < 3) nearby = stations; // fallback: show all
    stations = nearby;
    stations.sort(function(a,b){ return a.dist - b.dist; });
  }

  APP._wsStationsData = stations;
  APP._wsSortMode = 'dist';
  APP._wsRenderCards(stations);

  // Load ratings from Firebase: Aleh driver stats + Google Places ratings + recent comments
  if (typeof firebase !== 'undefined') {
    var db = firebase.database();
    // 1) Google Places ratings → re-render the Google row inside each card
    db.ref('washGoogleRatings').once('value').then(function(snap) {
      APP._wsGoogleRatings = snap.val() || {};
      APP._wsRefreshRatingRows();
    }).catch(function(){});

    // 2) Aleh driver aggregate stats → animated teal badge row
    db.ref('washStationStats').once('value').then(function(snap) {
      var _fbStats = snap.val() || {};
      APP._wsAlehStats = APP._wsAlehStats || {};
      Object.keys(_fbStats).forEach(function(k) {
        var fb = _fbStats[k];
        var local = APP._wsAlehStats[k];
        // Only overwrite local data if Firebase has a real avg (>0), or no local data exists
        if (!local || !local.avg || (fb && fb.avg > 0)) {
          APP._wsAlehStats[k] = fb;
        }
      });
      try { localStorage.setItem('ws_aleh_stats', JSON.stringify(APP._wsAlehStats)); } catch(e){}
      APP._wsRefreshRatingRows();
    }).catch(function(){});

    // 3) Recent driver comments (last 3 across all vehicles) → expandable card body
    db.ref('washRatings').once('value').then(function(snap) {
      if (!snap.exists()) return;
      var all = snap.val() || {};
      var _prevLocal = APP._wsRecentComments || {};
      APP._wsRecentComments = {};
      Object.keys(all).forEach(function(sKey) {
        var perVeh = all[sKey] || {};
        var arr = [];
        Object.keys(perVeh).forEach(function(vKey) {
          var r = perVeh[vKey];
          if (r && r.comment && String(r.comment).trim()) {
            arr.push({
              comment: String(r.comment).trim(),
              rating: r.rating || 0,
              driverName: r.driverName || '',
              ts: r.ts || r.timestamp || r.date || 0
            });
          }
        });
        arr.sort(function(a, b){ return (b.ts || 0) - (a.ts || 0); });
        // Merge Firebase comments with local optimistic data — keep newest by ts
        var _fbArr = arr.slice(0, 10);
        var _localArr = _prevLocal[sKey] || [];
        var _merged = _fbArr.slice();
        _localArr.forEach(function(lc) {
          var isDup = _merged.some(function(fc) {
            return fc.driverName === lc.driverName && Math.abs((fc.ts||0)-(lc.ts||0)) < 60000;
          });
          if (!isDup) _merged.unshift(lc);
        });
        _merged.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
        if (_merged.length) APP._wsRecentComments[sKey] = _merged.slice(0, 10);
      });
      try { localStorage.setItem('ws_recent_comments', JSON.stringify(APP._wsRecentComments)); } catch(e){}
      APP._wsRefreshCommentSections();
    }).catch(function(){});
  }

  var mapEl = document.getElementById('ws-leaflet-map');
  if (!mapEl || !window.L) return;
  if (APP._wsMap) { APP._wsMap.remove(); APP._wsMap = null; }
  var centerLat = userLat || 32.08, centerLng = userLng || 34.78;
  var map = L.map('ws-leaflet-map', { zoomControl:true, attributionControl:false }).setView([centerLat, centerLng], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19, subdomains:'abcd' }).addTo(map);
  APP._wsMap = map;
  APP._wsMapMarkers = {};

  if (userLat) {
    L.circleMarker([userLat, userLng], { radius:8, color:'#0891b2', fillColor:'#0891b2', fillOpacity:1, weight:3 })
      .addTo(map).bindPopup('מיקומך');
  }

  stations.forEach(function(s, idx) {
    var marker = L.marker([s.lat, s.lng], { icon: _wsMakeMarkerIcon(idx+1, false) }).addTo(map);
    marker.bindPopup('<div style="direction:rtl">'+s.name+'<br><small>'+s.addr+'</small></div>', { autoPan: false });
    marker.on('click', function() {
      APP._wsToggleSC(s.id, true);
      marker.openPopup();
      var el = document.getElementById('ws-sc-'+s.id);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
      // Renumber markers based on current _wsStationsData order (post-sort)
      var cur = APP._wsStationsData || stations;
      cur.forEach(function(ss, ii) {
        if (APP._wsMapMarkers[ss.id]) APP._wsMapMarkers[ss.id].setIcon(_wsMakeMarkerIcon(ii+1, ss.id===s.id));
      });
    });
    APP._wsMapMarkers[s.id] = marker;
  });

  // Locate-me button
  var mapWrap = document.getElementById('ws-map-wrap');
  if (mapWrap && !mapWrap.querySelector('.th-locate-btn')) {
    var locateBtn = document.createElement('button');
    locateBtn.className = 'th-locate-btn';
    locateBtn.title = 'מיקום נוכחי';
    locateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    locateBtn.addEventListener('touchstart', function(e){ e.stopPropagation(); }, {passive:true});
    locateBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      locateBtn.classList.add('loading');
      navigator.geolocation.getCurrentPosition(function(pos) {
        locateBtn.classList.remove('loading');
        map.setView([pos.coords.latitude, pos.coords.longitude], 13, { animate: true });
      }, function() {
        locateBtn.classList.remove('loading');
        showToast('לא ניתן לאתר מיקום');
      }, { timeout: 6000 });
    });
    mapWrap.appendChild(locateBtn);
  }

  // Re-filter cards when map is panned/zoomed
  var _wsMapTimer = null;
  map.on('moveend', function() {
    clearTimeout(_wsMapTimer);
    _wsMapTimer = setTimeout(function() {
      var bounds = map.getBounds();
      var visible = APP._WASH_STATIONS.filter(function(s) {
        return bounds.contains([s.lat, s.lng]);
      }).map(function(s) {
        var dist = (userLat && userLng) ? _thHaversine(userLat, userLng, s.lat, s.lng) : null;
        return Object.assign({}, s, {dist: dist});
      });
      if (visible.length === 0) return; // don't clear list if nothing in bounds
      if (APP._wsSortMode === 'rating') {
        visible.sort(function(a,b){ return (b.rating||0) - (a.rating||0); });
      } else {
        visible.sort(function(a,b){ return (a.dist||9999) - (b.dist||9999); });
      }
      APP._wsStationsData = visible;
      APP._wsRenderCards(visible);
      // Renumber map markers to match new sort order
      visible.forEach(function(s, ii) {
        if (APP._wsMapMarkers && APP._wsMapMarkers[s.id]) {
          APP._wsMapMarkers[s.id].setIcon(_wsMakeMarkerIcon(ii+1, false));
        }
      });
    }, 600);
  });

  setTimeout(function(){ if (APP._wsMap) APP._wsMap.invalidateSize(); }, 250);
};

// Parse wash station hours string "א-ה HH:MM–HH:MM | ו HH:MM–HH:MM" into 7-day array
function _wsParseHoursStr(hoursStr) {
  var dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  var todayIdx = new Date().getDay(); // 0=Sun
  var weekdayHours = 'סגור', fridayHours = 'סגור';
  if (hoursStr) {
    var parts = hoursStr.split(' | ');
    var timeRe = /(\d{1,2}:\d{2}[–\-]\d{1,2}:\d{2})/;
    if (parts.length >= 2) {
      var m1 = parts[0].match(timeRe), m2 = parts[1].match(timeRe);
      if (m1) weekdayHours = m1[1];
      if (m2) fridayHours = m2[1];
    } else if (parts.length === 1) {
      var m0 = parts[0].match(timeRe);
      if (m0) weekdayHours = m0[1];
    }
  }
  return dayNames.map(function(name, i) {
    var h;
    if (i === 6) h = 'סגור'; // שבת
    else if (i === 5) h = fridayHours; // שישי
    else h = weekdayHours; // ראשון-חמישי
    return { day: name, hours: h, isToday: (i === todayIdx) };
  });
}

// Sanitize a station id the same way GAS does before using it as a Firebase key
APP._wsSanKey = function(id) { return String(id).replace(/[^0-9A-Za-z_-]/g, '_'); };

// Render 0–5 stars supporting halves: full ★, half ⯨ (rendered via ½ glyph), empty ☆
APP._wsStarsHalf = function(r) {
  r = Number(r) || 0;
  var out = '';
  for (var i = 1; i <= 5; i++) {
    if (r >= i)            out += '★';
    else if (r >= i - 0.5) out += '<span class="ws-half">★</span>';
    else                   out += '☆';
  }
  return out;
};

// Look up Aleh + Google data for a station (handles both raw and sanitized keys)
APP._wsAlehFor = function(id) {
  var a = APP._wsAlehStats || {};
  return a[id] || a[APP._wsSanKey(id)] || null;
};
APP._wsGoogleFor = function(id) {
  var g = APP._wsGoogleRatings || {};
  return g[id] || g[APP._wsSanKey(id)] || null;
};
APP._wsCommentsFor = function(id) {
  var c = APP._wsRecentComments || {};
  return c[id] || c[APP._wsSanKey(id)] || null;
};

// Build the two-row rating block (Google Places + Aleh drivers) for a card
APP._wsRatingRowsHtml = function(s) {
  var g = APP._wsGoogleFor(s.id);
  var gRating = (g && g.rating != null) ? Number(g.rating) : (s.rating != null ? Number(s.rating) : null);
  var gCount  = (g && g.count != null) ? g.count : s.ratingCount;
  var html = '';
  if (gRating != null) {
    html += '<div class="ws-rate-google">' +
              '<span class="ws-rate-stars">' + APP._wsStarsHalf(gRating) + '</span>' +
              '<span class="ws-rate-val">' + gRating.toFixed(1) + '</span>' +
              '<span class="ws-rate-cnt">(' + (gCount || 0) + ' ביקורות גוגל)</span>' +
            '</div>';
  }
  var a = APP._wsAlehFor(s.id);
  if (a && a.avg != null) {
    html += '<div class="ws-aleh-badge ws-aleh-live" title="דירוג נהגי עלה — לחץ לביקורות" onclick="event.stopPropagation();APP._wsShowReviews(\'' + s.id + '\')" style="cursor:pointer">' +
              '<svg class="ws-aleh-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="12" y1="3" x2="12" y2="10"/><line x1="4.2" y1="16.5" x2="10.3" y2="13"/><line x1="19.8" y1="16.5" x2="13.7" y2="13"/></svg>' +
              '<span class="ws-rate-val">' + Number(a.avg).toFixed(1) + '</span>' +
              '<span class="ws-aleh-cnt">(' + (a.count || 0) + ' נהגי עלה)</span>' +
            '</div>';
  }
  return html;
};

// Build the "ביקורות נהגים" section (recent comments) for the expandable body
APP._wsCommentsHtml = function(s) {
  var arr = APP._wsCommentsFor(s.id);
  if (!arr || !arr.length) return '';
  var items = arr.map(function(c) {
    var stars = '';
    var rr = Math.round(Number(c.rating) || 0);
    for (var i = 1; i <= 5; i++) stars += (i <= rr) ? '★' : '☆';
    var who = c.driverName ? ('<span class="ws-cm-who">' + c.driverName + '</span>') : '';
    return '<div class="ws-cm">' +
             '<div class="ws-cm-top"><span class="ws-cm-stars">' + stars + '</span>' + who + '</div>' +
             '<div class="ws-cm-text">' + String(c.comment).replace(/</g, '&lt;') + '</div>' +
           '</div>';
  }).join('');
  return '<div class="ws-cm-label">ביקורות נהגים</div>' + items;
};

// ===== Aleh Reviews Modal =====
// Build the gold star string (full ★ / empty ☆) for an integer-rounded rating
APP._wsStarsStr = function(r) {
  var rr = Math.round(Number(r) || 0), out = '';
  for (var i = 1; i <= 5; i++) out += (i <= rr) ? '★' : '☆';
  return out;
};

// Show the reviews modal for a given station id
APP._wsShowReviews = function(stationId) {
  var s = (APP._wsStationsData || APP._WASH_STATIONS).find(function(x){ return String(x.id) === String(stationId); });
  if (!s) return;
  var a = APP._wsAlehFor(stationId) || {};
  var arr = APP._wsCommentsFor(stationId) || [];

  var titleEl = document.getElementById('wsRvTitle');
  if (titleEl) titleEl.textContent = s.name || 'תחנה';

  // Average row
  var avgRow = document.getElementById('wsRvAvgRow');
  if (avgRow) {
    if (a.avg != null) {
      avgRow.innerHTML =
        '<div class="ws-rv-avgnum">' + Number(a.avg).toFixed(1) + '</div>' +
        '<div>' +
          '<div class="ws-rv-avgstars">' + APP._wsStarsStr(a.avg) + '</div>' +
          '<div class="ws-rv-avgcnt">(' + (a.count || 0) + ' נהגי עלה)</div>' +
        '</div>';
    } else {
      avgRow.innerHTML = '';
    }
  }

  // Body
  var body = document.getElementById('wsRvBody');
  if (body) {
    if (!arr.length) {
      body.innerHTML = '<div class="ws-rv-empty">אין ביקורות עדיין</div>';
    } else {
      var note = '';
      if (a.count != null && a.count > arr.length) {
        note = '<div class="ws-rv-note">מציג ' + arr.length + ' ביקורות אחרונות</div>';
      }
      var cards = arr.map(function(c) {
        var nm = (c.driverName || '').trim();
        var initial = nm ? nm.charAt(0) : '?';
        var dateStr = '';
        if (c.ts) {
          var d = new Date(Number(c.ts));
          if (!isNaN(d.getTime())) {
            var dd = ('0'+d.getDate()).slice(-2), mm = ('0'+(d.getMonth()+1)).slice(-2);
            dateStr = dd + '/' + mm + '/' + d.getFullYear();
          }
        }
        return '<div class="ws-rv-card">' +
                 '<div class="ws-rv-avatar">' + String(initial).replace(/</g,'&lt;') + '</div>' +
                 '<div class="ws-rv-cmain">' +
                   '<div class="ws-rv-crow">' +
                     '<span class="ws-rv-cname">' + (nm ? String(nm).replace(/</g,'&lt;') : 'נהג עלה') + '</span>' +
                     '<span class="ws-rv-cstars">' + APP._wsStarsStr(c.rating) + '</span>' +
                     (dateStr ? '<span class="ws-rv-cdate">' + dateStr + '</span>' : '') +
                   '</div>' +
                   '<div class="ws-rv-ctext">' + String(c.comment || '').replace(/</g,'&lt;') + '</div>' +
                 '</div>' +
               '</div>';
      }).join('');
      body.innerHTML = note + cards;
      body.scrollTop = 0;
    }
  }

  var ov = document.getElementById('wsReviewsOverlay');
  if (ov) ov.style.display = 'flex';
};

// Close the reviews modal
APP._wsCloseReviews = function() {
  var ov = document.getElementById('wsReviewsOverlay');
  if (ov) ov.style.display = 'none';
};

// Re-render the rating block of every visible card (called after Firebase loads)
APP._wsRefreshRatingRows = function() {
  var data = APP._wsStationsData || APP._WASH_STATIONS;
  document.querySelectorAll('.ws-sc-ratings').forEach(function(el) {
    var card = el.closest('.ws-sc');
    if (!card) return;
    var sid = card.getAttribute('data-station-id');
    var s = data.find(function(x){ return String(x.id) === String(sid); });
    if (s) el.innerHTML = APP._wsRatingRowsHtml(s);
  });
};

// Re-render the comments section of every visible card (called after Firebase loads)
APP._wsRefreshCommentSections = function() {
  var data = APP._wsStationsData || APP._WASH_STATIONS;
  document.querySelectorAll('.ws-sc-comments').forEach(function(el) {
    var card = el.closest('.ws-sc');
    if (!card) return;
    var sid = card.getAttribute('data-station-id');
    var s = data.find(function(x){ return String(x.id) === String(sid); });
    if (s) el.innerHTML = APP._wsCommentsHtml(s);
  });
};

// Mirror of _thRenderCards — Waze-only + confirm bar
APP._wsRenderCards = function(stations) {
  var list = document.getElementById('ws-station-list');
  if (!list) return;
  // Capture which station card is open before wiping DOM
  var _prevOpen = list.querySelector('.ws-sc.open');
  var _openId = _prevOpen ? _prevOpen.getAttribute('data-station-id') : null;
  list.innerHTML = '';
  stations.forEach(function(s, idx) {
    var open = _thIsOpen(s);
    var parsedHours = _wsParseHoursStr(s.hours || '');
    var todayHours = _thTodayHours(parsedHours);
    var distTxt = s.dist !== null && s.dist !== undefined ? (s.dist < 1 ? Math.round(s.dist*1000) + 'מ׳' : s.dist.toFixed(1) + ' ק"מ') : '—';
    var card = document.createElement('div');
    card.className = 'ws-sc' + ((String(s.id) === String(_openId) || (!_openId && idx === 0)) ? ' open' : '');
    card.id = 'ws-sc-' + s.id;
    card.setAttribute('data-station-id', s.id);
    card.innerHTML =
      '<div class="ws-sc-head" onclick="APP._wsToggleSC(\''+s.id+'\')">' +
        '<div class="ws-sc-row1">' +
          '<div><div class="ws-sc-name">'+s.name+'</div><div class="ws-sc-addr">'+s.addr+'</div></div>' +
          '<div class="ws-sc-right">' +
            '<div class="ws-sc-dist">'+distTxt+'</div>' +
            '<div class="ws-sc-ratings" id="ws-ratings-'+s.id+'">'+APP._wsRatingRowsHtml(s)+'</div>' +
          '</div>' +
        '</div>' +
        '<div class="ws-sc-row2">' +
          '<div class="ws-sc-status '+(open?'open':'closed')+'"><div class="ws-sc-dot"></div>'+(open?'פתוח':'סגור')+'</div>' +
          '<div class="ws-sc-hours">'+(todayHours || '')+'</div>' +
          '<svg class="ws-sc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>' +
        '</div>' +
      '</div>' +
      '<div class="ws-sc-body">' +
        _thHoursTableHtml(parsedHours) +
        '<div class="ws-sc-comments" id="ws-comments-'+s.id+'">'+APP._wsCommentsHtml(s)+'</div>' +
        '<div class="ws-sc-actions">' +
          '<button class="ws-sc-btn waze" onclick="APP._wsWaze(\''+s.id+'\')"><div class="ws-sc-btn-icon"><svg width="20" height="20" viewBox="0 0 48 48" fill="none"><ellipse cx="24" cy="27" rx="17" ry="14" fill="#0891b2"/><circle cx="18" cy="33" r="3" fill="#fff"/><circle cx="30" cy="33" r="3" fill="#fff"/><path d="M15 24 Q24 14 33 24" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg></div>נווט ב-Waze</button>' +
        '</div>' +
      '</div>';
    list.appendChild(card);
  });
  // Re-apply async-loaded rating data after every card rebuild
  if (APP._wsAlehStats || APP._wsGoogleRatings) APP._wsRefreshRatingRows();
  if (APP._wsRecentComments) APP._wsRefreshCommentSections();
};

// Tap Waze → show confirm popup FIRST (wash is saved only after confirmation)
APP._wsWaze = function(stationId) {
  var s = (APP._wsStationsData || APP._WASH_STATIONS).find(function(x){ return String(x.id) === String(stationId); });
  if (!s) return;
  APP._wsPendingWazeStation = s;
  APP._washCurrentStation = s;
  // Show confirm popup
  var el = document.getElementById('ws-waze-confirm-popup');
  var nameEl = document.getElementById('ws-wcp-station-name');
  var quotaEl = document.getElementById('ws-wcp-quota-text');
  if (nameEl) nameEl.textContent = s.name + (s.city ? ' — ' + s.city : '');
  if (quotaEl) {
    var used = APP._washMonthCount();
    quotaEl.textContent = 'ניצלת ' + used + ' מתוך 4 רחיצות החודש';
  }
  if (el) el.style.display = 'flex';
};

APP._wsWazeConfirmGo = function() {
  var el = document.getElementById('ws-waze-confirm-popup');
  if (el) el.style.display = 'none';
  var s = APP._wsPendingWazeStation;
  if (!s) return;
  var url = s.wazeUrl || s.waze || ('waze://ul?ll=' + s.lat + ',' + s.lng + '&navigate=yes');
  // Save wash FIRST, then navigate to Waze. Opening Waze immediately navigates the
  // browser away and aborts the in-flight save fetch (root cause of lost washes).
  // Wait for the save to settle (or a 2.5s safety timeout) before leaving the page.
  var navigated = false;
  var go = function() { if (navigated) return; navigated = true; window.open(url, '_blank'); };
  var savePromise;
  try { savePromise = APP._wsConfirmWash(s.id); } catch(e) { savePromise = null; }
  if (savePromise && typeof savePromise.then === 'function') {
    setTimeout(go, 2500); // safety: never block navigation more than 2.5s
    savePromise.then(go, go);
  } else {
    go();
  }
};

APP._wsWazeConfirmCancel = function() {
  var el = document.getElementById('ws-waze-confirm-popup');
  if (el) el.style.display = 'none';
  APP._wsPendingWazeStation = null;
};

// Confirm wash → save to GAS (mirror of old confirmWash)
APP._wsConfirmWash = function(stationId) {
  var s = (APP._wsStationsData || APP._WASH_STATIONS).find(function(x){ return String(x.id) === String(stationId); });
  var veh = STATE.vehicle;
  if (!s || !veh) { showToast('שגיאה: אין נתוני רכב'); return Promise.reject(new Error('no vehicle')); }
  var vehicleId = veh.id || veh.vehicleId || veh.num || '';
  if (!vehicleId) { showToast('שגיאה: מזהה רכב חסר'); return Promise.reject(new Error('no vehicleId')); }
  var params = {
    vehicleId: vehicleId,
    plate: veh.num || '',
    stationId: s.id,
    stationName: s.name,
    stationCity: s.city,
    washType: 'regular',
    driverName: (STATE.user && (STATE.user.name || STATE.user.displayName)) || ''
  };
  if (!STATE.washLog) STATE.washLog = [];
  STATE.washLog.push({ date: new Date().toISOString().slice(0,10), stationName: s.name });
  APP._updateWashBadge();
  var used = APP._washMonthCount();
  APP._wsUpdateQuota(used);
  showToast('רחיצה נרשמה!');
  APP._showWashSuccess();
  console.log('[save_wash] vehicleId=' + vehicleId + ' stationId=' + s.id + ' stationName=' + s.name);
  return gasPostForm('save_wash', params).then(function(r) {
    if (r && r.quotaFull) {
      // Rollback optimistic wash entry (the last pushed entry)
      if (STATE.washLog && STATE.washLog.length > 0) STATE.washLog.pop();
      APP._updateWashBadge();
      var usedQF = APP._washMonthCount();
      APP._wsUpdateQuota(usedQF);
      // Show beautiful quota popup instead of toast
      var qp = document.getElementById('wash-quota-popup');
      if (qp) { qp.style.display = 'flex'; } else { showToast('הגעת למכסת הרחיצות החודשית (4/4)'); }
      return r;
    }
    // Write to Firebase directly from PWA (authenticated session)
    // This ensures data appears even if GAS _fbWrite fails (auth/rules issue)
    try {
      if (typeof firebase !== 'undefined') {
        var vehFb2 = STATE.vehicle;
        var vid2 = vehFb2 && (vehFb2.id || vehFb2.vehicleId || vehFb2.num);
        if (vid2) {
          var now2 = new Date();
          var mo2 = now2.getFullYear() + '' + ('0'+(now2.getMonth()+1)).slice(-2);
          var dateStr2 = now2.toISOString().slice(0,10);
          var timeStr2 = now2.toTimeString().slice(0,8);
          var fbRef = 'washLog/' + vid2 + '/' + mo2 + '/' + now2.getTime();
          firebase.database().ref(fbRef).set({
            vehicleId: String(vid2),
            stationId: String(s.id),
            stationName: s.name || '',
            stationCity: s.city || '',
            date: dateStr2,
            time: timeStr2,
            washType: 'regular',
            source: 'pwa'
          }).catch(function(fbErr) {
            console.warn('[save_wash Firebase direct]', fbErr);
          });
          // Also push to in-memory history so tab shows it immediately
          var histEntry = {
            vehicleId: String(vid2 || vehicleId),
            stationId: String(s.id),
            stationName: s.name || '',
            stationCity: s.city || '',
            date: dateStr2,
            time: timeStr2,
            washType: 'regular',
            source: 'pwa'
          };
          if (!APP._wsHistoryWashes) APP._wsHistoryWashes = [];
          APP._wsHistoryWashes.unshift(histEntry);  // prepend — newest first
          // If history panel is visible, re-render immediately
          var hp = document.getElementById('ws-panel-history');
          if (hp && hp.style.display !== 'none') {
            APP._wsRenderHistory(APP._wsHistoryWashes);
          }
        }
      }
    } catch(fbEx) { console.warn('[save_wash Firebase]', fbEx); }
    return r;
  }).catch(function(err) {
    // Rollback optimistic update
    if (STATE.washLog && STATE.washLog.length > 0) STATE.washLog.pop();
    APP._updateWashBadge();
    var usedAfter = APP._washMonthCount();
    APP._wsUpdateQuota(usedAfter);
    // Quota full → show beautiful popup instead of error toast
    var errMsg = err.message || '';
    if (errMsg.indexOf('מכסה') > -1 || errMsg.indexOf('quota') > -1 || errMsg.indexOf('4/4') > -1) {
      var qp = document.getElementById('wash-quota-popup');
      if (qp) { qp.style.display = 'flex'; return; }
    }
    showToast('שגיאה בשמירת הרחיצה: ' + errMsg);
    console.error('[save_wash ERROR]', errMsg, err);
  });
};

// Re-sort cards by distance / rating (mirror of _thSort)
APP._wsSort = function(mode) {
  APP._wsSortMode = mode;
  var db = document.getElementById('ws-sort-dist'); if (db) db.classList.toggle('active', mode==='dist');
  var rb = document.getElementById('ws-sort-rating'); if (rb) rb.classList.toggle('active', mode==='rating');
  if (!APP._wsStationsData) return;
  var sorted = APP._wsStationsData.slice().sort(function(a,b){
    if (mode === 'rating') return (b.rating||0) - (a.rating||0);
    return (a.dist||9999) - (b.dist||9999);
  });
  APP._wsRenderCards(sorted);
};

// Expand/collapse a card + highlight marker (mirror of _thToggleSC)
APP._wsToggleSC = function(id, forceOpen) {
  var card = document.getElementById('ws-sc-'+id);
  if (!card) return;
  var wasOpen = card.classList.contains('open');
  document.querySelectorAll('.ws-sc').forEach(function(c){ c.classList.remove('open','highlight'); });
  if (!wasOpen || forceOpen) { card.classList.add('open','highlight'); }
  if (APP._wsMapMarkers && APP._wsStationsData) {
    APP._wsStationsData.forEach(function(s, idx) {
      if (APP._wsMapMarkers[s.id]) {
        APP._wsMapMarkers[s.id].setIcon(_wsMakeMarkerIcon(idx+1, String(s.id)===String(id) && (!wasOpen||forceOpen)));
      }
    });
  }
};

// Update quota dots / pill / labels
APP._wsUpdateQuota = function(used) {
  used = (used == null) ? APP._washMonthCount() : used;
  var dotsEl = document.getElementById('ws-quota-dots');
  if (dotsEl) {
    var d = '';
    for (var i = 0; i < 4; i++) d += '<div class="ws-quota-dot' + (i < used ? ' used' : '') + '"></div>';
    dotsEl.innerHTML = d;
  }
  var lbl = document.getElementById('ws-quota-label');
  if (lbl) lbl.textContent = used + '/4 רחיצות החודש';
  var pill = document.getElementById('wash-quota-pill');
  if (pill) pill.textContent = used + '/4';
  var sub = document.getElementById('wash-quota-sub');
  if (sub) sub.textContent = used >= 4 ? 'ניצלת את כל הרחיצות החודש' : 'בחר תחנת פז עם שירות שטיפה';
  // Wave bar
  var fill = document.getElementById('ws-wave-fill');
  if (fill) fill.style.height = Math.round(used/4*100) + '%';
  var waveNum = document.getElementById('ws-wave-num');
  if (waveNum) waveNum.textContent = used + '/4';
  var waveSub = document.getElementById('ws-wave-sub');
  if (waveSub) waveSub.textContent = used >= 4 ? 'מכסה מלאה!' : 'רחיצות החודש';
  var dropsEl = document.getElementById('ws-wave-drops');
  if (dropsEl) {
    var dd = '';
    for (var i = 0; i < 4; i++) dd += '<div class="ws-drop' + (i < used ? ' filled' : '') + '"></div>';
    dropsEl.innerHTML = dd;
  }
};

APP._showWashSuccess = function() {
  var ov = document.getElementById('wash-success-popup');
  if (!ov) return;
  ov.style.display = 'flex';
  setTimeout(function(){ ov.style.display = 'none'; }, 2200);
};

APP._updateWashBadge = function() {
  var badge = document.getElementById('wash-count-badge');
  if (!badge) return;
  var cnt = APP._washMonthCount();
  if (cnt > 0) { badge.textContent = cnt + '/4'; badge.style.display = 'block'; }
  else { badge.style.display = 'none'; }
};

APP._initTestHub = function() {
  const v = STATE.vehicle || {};

  // כותרת משנה: מספר רכב · תאריך טסט
  const sub = document.getElementById('test-hub-plate-sub');
  if (sub) {
    const plate = v.num ? formatPlate(v.num) : '—';
    const dateTxt = v.testDue ? formatDate(v.testDue) : '—';
    sub.textContent = plate + ' · ' + dateTxt;
  }

  // pill סטטוס לפי ימים שנותרו
  const pill = document.getElementById('test-hub-status-pill');
  if (pill && String(v.testPendingApproval) === 'true') {
    pill.classList.remove('ok', 'red'); pill.classList.add('warn');
    pill.textContent = '⏳ ממתין לאישור מנהל';
  } else if (pill && v.testDue && !v.testDone) {
    const days = Math.round((new Date(v.testDue) - new Date()) / 86400000);
    pill.classList.remove('ok', 'warn', 'red');
    if (days <= 7)       { pill.classList.add('red');  pill.textContent = 'דחוף · ' + days + ' ימים'; }
    else if (days <= 30) { pill.classList.add('warn'); pill.textContent = days + ' ימים לטסט'; }
    else                 { pill.classList.add('ok');   pill.textContent = days + ' ימים לטסט'; }
  } else if (pill && v.testDone) {
    pill.classList.remove('warn', 'red'); pill.classList.add('ok');
    pill.textContent = 'בוצע ✓';
  }

  // Populate doc expiry dates from STATE.vehicle.
  // Real field names are licExp / insCompExp (see driver_vehicle response & docs builder).
  var licEl = document.getElementById('th-pds-license-date');
  if (licEl) licEl.textContent = v.licExp ? 'בתוקף עד ' + formatDate(v.licExp) : 'בתוקף —';
  var insEl = document.getElementById('th-pds-insurance-date');
  if (insEl) insEl.textContent = v.insCompExp ? 'בתוקף עד ' + formatDate(v.insCompExp) : 'בתוקף —';

  // ── Step 1 (Checklist) "מסמכים" category: fill expiry dates + auto-check by validity ──
  function _thDocStatus(dateStr) {
    if (!dateStr) return 'missing';
    var d = new Date(dateStr);
    if (isNaN(d)) return 'missing';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return d >= today ? 'valid' : 'expired';
  }
  function _thFillDoc(dateElId, dateVal) {
    var dateEl = document.getElementById(dateElId);
    if (!dateEl) return;
    var status = _thDocStatus(dateVal);
    dateEl.textContent = dateVal ? 'תוקף עד: ' + formatDate(dateVal) : 'תוקף עד: —';
    var item = dateEl.closest('.doc-item');
    if (!item) return;
    var badge = item.querySelector('.doc-badge');
    if (badge) {
      badge.classList.remove('ok', 'expired', 'overdue', 'warn');
      if (status === 'valid')       { badge.classList.add('ok');      badge.textContent = 'תקין'; }
      else if (status === 'expired'){ badge.classList.add('expired'); badge.textContent = 'פג תוקף'; }
      else                          { badge.classList.add('expired'); badge.textContent = 'חסר'; }
    }
  }
  _thFillDoc('th-doc-license-date',   v.licExp);
  _thFillDoc('th-doc-insurance-date', v.insCompExp);

  // Update map with real GPS (bug 2)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      var iframe = document.getElementById('th-map-iframe');
      if (iframe) {
        iframe.src = 'https://maps.google.com/maps?q=מכון+טסט+קרוב&ll=' + lat + ',' + lng + '&z=13&output=embed&hl=he';
      }
      if (typeof APP._updateStationDistances === 'function') APP._updateStationDistances(lat, lng);
    }, null, {timeout:5000});
  }

  // Init stations panel (Leaflet map + cards)
  function _thStartStations() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async function(pos) {
        await APP._initStationsPanel(pos.coords.latitude, pos.coords.longitude);
      }, async function() {
        await APP._initStationsPanel(null, null);
      }, {timeout:5000});
    } else {
      APP._initStationsPanel(null, null);
    }
  }
  if (typeof L !== 'undefined') {
    _thStartStations();
  } else {
    // Leaflet not loaded yet — load and retry
    if (!document.getElementById('th-leaflet-css')) {
      var lCss = document.createElement('link'); lCss.id='th-leaflet-css'; lCss.rel='stylesheet'; lCss.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(lCss);
    }
    var lJs = document.createElement('script'); lJs.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    lJs.onload = _thStartStations;
    document.head.appendChild(lJs);
  }
};

APP.thSwitchStep = function(step) {
  // step nodes use 1-based ids (stp-node-1..3). Accept either 0-based or 1-based.
  var idx = (step >= 1 && step <= 3) ? (step - 1) : step; // normalize to 0-based
  // guard: if moving from checklist to stations, verify all items checked
  if (idx === 1) {
    var total   = document.querySelectorAll('.chk-section .chk-item').length;
    var checked = document.querySelectorAll('.chk-section .chk-item.checked').length;
    if (total > 0 && checked < total) {
      APP._showTestSkipGuard(checked);
      return;
    }
  }
  var panelMap = ['test-panel-checklist', 'test-panel-stations', 'test-panel-docs'];
  document.querySelectorAll('.test-panel').forEach(p => p.classList.remove('active'));
  var panel = document.getElementById(panelMap[idx]);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.stp-node').forEach((s, i) => {
    s.classList.toggle('active', i === idx);
    s.classList.toggle('completed', i < idx);
  });
};

APP._showTestSkipGuard = function(done) {
  const overlay = document.getElementById('th-skip-guard');
  if (!overlay) return;
  const el = document.getElementById('th-guard-count');
  if (el) el.textContent = done + ' / 21';
  overlay.style.display = 'flex';
};

APP.thDismissGuard = function(goAnyway) {
  document.getElementById('th-skip-guard').style.display = 'none';
  if (goAnyway) APP._thForceStep(1); // bypass guard, go directly to stations
};
APP._thForceStep = function(idx) {
  var panelMap = ['test-panel-checklist', 'test-panel-stations', 'test-panel-docs'];
  document.querySelectorAll('.test-panel').forEach(p => p.classList.remove('active'));
  var panel = document.getElementById(panelMap[idx]);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.stp-node').forEach((s, i) => {
    s.classList.toggle('active', i === idx);
    s.classList.toggle('completed', i < idx);
  });
  if (idx === 2) setTimeout(function(){ APP._initCamTooltip && APP._initCamTooltip(); }, 300);
};

APP.thCheckItem = function(id, el) {
  // legacy entry point — real markup uses .chk-item; delegate to the working path
  if (el) {
    var item = el.closest ? el.closest('.chk-item') : null;
    if (item) item.classList.toggle('checked');
    else el.classList.toggle('checked');
  }
  if (typeof APP._thUpdateProgress === 'function') APP._thUpdateProgress();
};

APP.thToggleHint = function(id) {
  const hint = document.getElementById('th-hint-' + id);
  if (hint) hint.classList.toggle('open');
};

APP.thToggleSection = function(sec) {
  var key = String(sec);
  document.querySelectorAll('.chk-section').forEach(s => {
    if (String(s.dataset.section) !== key) s.classList.remove('open');
  });
  const el = document.querySelector('.chk-section[data-section="' + key + '"]');
  if (el) el.classList.toggle('open');
};

APP.thToggleStationCard = function(id) {
  var card = document.getElementById(id);
  if (!card) return;
  var actions = card.querySelector('.station-card-actions');
  var chevron = card.querySelector('.sc-chevron');
  if (!actions) return;
  var open = actions.style.display !== 'none';
  actions.style.display = open ? 'none' : 'flex';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
};

APP.thToggleDocRow = function(el) {
  var title = el.querySelector('.pds-doc-title')?.textContent || '';
  var v = STATE.vehicle || {};
  // Map row title → document type the viewer understands.
  if (title.indexOf('רישיון') >= 0) {
    if (v.licLink) return APP.thOpenDocViewer('license');
    return showToast('אין קובץ רישיון רכב מקושר');
  }
  if (title.indexOf('ביטוח') >= 0) {
    if (v.insCompLink) return APP.thOpenDocViewer('insurance');
    return showToast('אין קובץ ביטוח חובה מקושר');
  }
  // ייפוי כוח / אישור מורשי חתימה — נוצרים אוטומטית בשליחה.
  // במקום toast — הצג overlay מסביר מה ייווצר.
  if (title.indexOf('ייפוי') >= 0 || title.indexOf('יפוי') >= 0) {
    return APP._thShowAutoDocInfo('poa');
  }
  if (title.indexOf('מורשי חתימה') >= 0 || title.indexOf('חתימה') >= 0) {
    return APP._thShowAutoDocInfo('sig');
  }
  showToast(title + ' — נוצר אוטומטית בשליחה');
};

// Info overlay for auto-generated documents (POA / signatory approval).
// These docs have no URL until an email is sent, so we show a descriptive
// panel inside the existing doc-viewer overlay instead of an iframe.
APP._thShowAutoDocInfo = function(type) {
  var titles = { poa: 'ייפוי כוח', sig: 'אישור מורשי חתימה' };
  var descs = {
    poa: 'מסמך ייפוי כוח ייווצר אוטומטית בעת השליחה ויכלול: שם בעל הרכב, מספר רכב, פרטי מורשי חתימה.',
    sig: 'אישור מורשי חתימה הוא מסמך קבוע של הארגון — ייצורף אוטומטית לכל שליחה.'
  };
  var overlay = document.getElementById('th-doc-viewer');
  var iframe  = document.getElementById('th-doc-iframe');
  var titleEl = document.getElementById('th-doc-title');
  if (!overlay) { showToast(descs[type]); return; }
  if (titleEl) titleEl.textContent = titles[type] || type;
  if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
  var info = overlay.querySelector('#th-doc-auto-info');
  if (!info) {
    info = document.createElement('div');
    info.id = 'th-doc-auto-info';
    info.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;padding:40px;text-align:center;direction:rtl;';
    overlay.appendChild(info);
  }
  info.innerHTML =
    '<div style="font-size:48px;margin-bottom:20px">📄</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:12px">' + titles[type] + '</div>' +
    '<div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.7">' + descs[type] + '</div>' +
    '<div style="margin-top:24px;padding:12px 20px;background:rgba(48,209,88,0.15);border:1px solid rgba(48,209,88,0.3);border-radius:12px;font-size:13px;color:#30D158">ייווצר ויישלח אוטומטית</div>';
  info.style.display = 'flex';
  overlay.style.display = 'flex';
};

APP.thOpenStationsMap = function() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      var url = 'https://www.google.com/maps/search/מכון+טסט/@' + pos.coords.latitude + ',' + pos.coords.longitude + ',14z';
      window.open(url, '_blank');
    }, function() {
      window.open('https://www.google.com/maps/search/מכון+טסט+קרוב', '_blank');
    }, {timeout: 4000});
  } else {
    window.open('https://www.google.com/maps/search/מכון+טסט+קרוב', '_blank');
  }
};

// ── TestHub Stations v2 ──
var TH_STATIONS = [
  // גוש דן
  { id:1,  name:'מכון רישוי הרצליה',       addr:'סוקולוב 10, הרצליה',          lat:32.1636, lng:34.8440, phone:'09-9507714', rating:4.2, ratingCount:187, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=32.1636,34.8440&navigate=yes' },
  { id:2,  name:'מכון רישוי ת"א מרכז',     addr:'הרכבת 40, תל אביב',            lat:32.0553, lng:34.7750, phone:'03-6888700', rating:3.8, ratingCount:312, hours:'א-ה 07:00–18:00 | ו 07:00–13:00', hoursWeekday:[7,18],   hoursFriday:[7,13],   waze:'https://waze.com/ul?ll=32.0553,34.7750&navigate=yes' },
  { id:3,  name:'מכון רישוי ת"א צפון',     addr:'הכובשים 2, תל אביב',           lat:32.1050, lng:34.8050, phone:'03-6474747', rating:3.9, ratingCount:201, hours:'א-ה 07:00–17:00 | ו 07:00–13:00', hoursWeekday:[7,17],   hoursFriday:[7,13],   waze:'https://waze.com/ul?ll=32.1050,34.8050&navigate=yes' },
  { id:4,  name:'מכון רישוי ראשל"צ',       addr:'הלל יפה 19, ראשון לציון',      lat:31.9700, lng:34.8020, phone:'03-9524820', rating:4.0, ratingCount:143, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.9700,34.8020&navigate=yes' },
  { id:5,  name:'מכון רישוי בת ים',        addr:'בילו 1, בת ים',                lat:32.0220, lng:34.7420, phone:'03-5099940', rating:4.1, ratingCount:98,  hours:'א-ה 07:30–17:00',                    hoursWeekday:[7.5,17], hoursFriday:null,     waze:'https://waze.com/ul?ll=32.0220,34.7420&navigate=yes' },
  { id:6,  name:'מכון רישוי חולון',        addr:'ויצמן 3, חולון',               lat:32.0115, lng:34.7720, phone:'03-5030303', rating:3.7, ratingCount:165, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=32.0115,34.7720&navigate=yes' },
  { id:7,  name:'מכון רישוי פ"ת',          addr:'אחד העם 2, פתח תקווה',         lat:32.0874, lng:34.8880, phone:'03-9394000', rating:3.9, ratingCount:76,  hours:'א-ה 07:30–17:00',                    hoursWeekday:[7.5,17], hoursFriday:null,     waze:'https://waze.com/ul?ll=32.0874,34.8880&navigate=yes' },
  { id:8,  name:'מכון רישוי רמת גן',       addr:'ביאליק 18, רמת גן',            lat:32.0750, lng:34.8200, phone:'03-6133333', rating:4.0, ratingCount:134, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=32.0750,34.8200&navigate=yes' },
  { id:9,  name:'מכון רישוי בני ברק',      addr:'רבי עקיבא 100, בני ברק',       lat:32.0804, lng:34.8387, phone:'03-5771234', rating:3.6, ratingCount:89,  hours:'א-ה 07:30–17:00',                    hoursWeekday:[7.5,17], hoursFriday:null,     waze:'https://waze.com/ul?ll=32.0804,34.8387&navigate=yes' },
  { id:10, name:'מכון רישוי נתניה',        addr:'הבנאי 1, נתניה',               lat:32.3215, lng:34.8530, phone:'09-8601234', rating:4.1, ratingCount:210, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=32.3215,34.8530&navigate=yes' },
  { id:11, name:'מכון רישוי רחובות',       addr:'הרצל 84, רחובות',              lat:31.8978, lng:34.8100, phone:'08-9452222', rating:4.2, ratingCount:156, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.8978,34.8100&navigate=yes' },
  { id:12, name:'מכון רישוי אשדוד',        addr:'הגפן 16, אשדוד',               lat:31.8040, lng:34.6550, phone:'08-8566789', rating:3.9, ratingCount:178, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.8040,34.6550&navigate=yes' },
  { id:13, name:'מכון רישוי מודיעין',      addr:'האומן 19, מודיעין',             lat:31.9000, lng:35.0100, phone:'08-9727777', rating:4.3, ratingCount:245, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.9000,35.0100&navigate=yes' },
  { id:14, name:'מכון רישוי ירושלים',      addr:'יגאל אלון 68, ירושלים',        lat:31.7767, lng:35.2132, phone:'02-5387777', rating:3.8, ratingCount:298, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.7767,35.2132&navigate=yes' },
  { id:15, name:'מכון רישוי חיפה',         addr:'ישראל גלילי 10, חיפה',          lat:32.8184, lng:35.0037, phone:'04-8400400', rating:4.0, ratingCount:189, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=32.8184,35.0037&navigate=yes' },
  { id:16, name:'מכון רישוי באר שבע',      addr:'הנגב 1, באר שבע',              lat:31.2518, lng:34.7913, phone:'08-6230000', rating:3.7, ratingCount:134, hours:'א-ה 07:30–17:00 | ו 07:30–13:00', hoursWeekday:[7.5,17], hoursFriday:[7.5,13], waze:'https://waze.com/ul?ll=31.2518,34.7913&navigate=yes' },
  { id:17, name:'מכון רישוי רמלה',         addr:'ז\'בוטינסקי 22, רמלה',          lat:31.9330, lng:34.8720, phone:'08-9272222', rating:3.8, ratingCount:67,  hours:'א-ה 07:30–17:00',                    hoursWeekday:[7.5,17], hoursFriday:null,     waze:'https://waze.com/ul?ll=31.9330,34.8720&navigate=yes' },
  { id:18, name:'מכון רישוי לוד',          addr:'בן גוריון 30, לוד',             lat:31.9510, lng:34.8960, phone:'08-9241234', rating:3.6, ratingCount:88,  hours:'א-ה 07:30–17:00',                    hoursWeekday:[7.5,17], hoursFriday:null,     waze:'https://waze.com/ul?ll=31.9510,34.8960&navigate=yes' },
];

function _thHaversine(lat1, lng1, lat2, lng2) {
  var R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// GATE MODULE — חניון ושערים אוטומטיים
// ============================================================

var GATE_STATE = 'idle';
var _gateCooldownUntil = 0;
var _gateWatchId = null;
var _gateOpening = false;

/* Show the gate card in a DISABLED state — visible but grayed out & not tappable.
   Used when gate access was revoked / not yet granted, but the vehicle is assigned.
   The card must NEVER disappear once a vehicle is assigned. */
function _gateSetDisabled(reason) {
  var card = document.getElementById('qa-gate-card');
  if (!card) return;
  card.style.display = 'flex';            // always visible (card is a flex .qa-card)
  card.classList.add('gate-access-disabled');
  card.setAttribute('data-state', 'disabled');
  card.setAttribute('aria-disabled', 'true');
  card.setAttribute('aria-label', 'גישה לחניון מושבתת');
  // Stop any running GPS watch — no point tracking while access is revoked.
  if (typeof _gateWatchId !== 'undefined' && _gateWatchId !== null && navigator.geolocation) {
    try { navigator.geolocation.clearWatch(_gateWatchId); _gateWatchId = null; } catch(_gsdW) {}
  }
  GATE_STATE = 'access-disabled';
  var lbl = document.getElementById('gate-lbl');
  if (lbl) lbl.innerHTML = (reason || 'גישה לחניון\nמושהית').replace(/\n/g, '<br>');
}

/* Re-enable the gate card (remove disabled styling). Actual init/state is
   handled by _gateInit which is called right after by the caller.
   NOTE: must ALSO clear the disabled data-state left behind by _gateSetDisabled /
   _gateSetState('disabled') — otherwise the [data-state="disabled"] CSS keeps the
   card grayed even after the .gate-access-disabled class is removed, so the card
   stays visually "stuck disabled" until the next full refresh. */
function _gateSetEnabled() {
  var card = document.getElementById('qa-gate-card');
  if (!card) return;
  card.style.display = 'flex';
  card.classList.remove('gate-access-disabled');
  card.removeAttribute('aria-disabled');
  // Reset any disabled/revoked visual state to a neutral idle look immediately,
  // so the card reads as live even before _gateInit finishes its GAS round-trip.
  if (card.getAttribute('data-state') === 'disabled') {
    card.setAttribute('data-state', 'idle');
    var _lbl = document.getElementById('gate-lbl');
    if (_lbl) _lbl.innerHTML = 'שערי חניון<br>וחניה';
    var _ib = document.getElementById('gate-icon-box');
    if (_ib) _ib.style.background = 'var(--red-dim)';
    var _svg = document.getElementById('gate-icon-svg');
    if (_svg) _svg.setAttribute('stroke', '#1F8A3D');
  }
}

function _gateInit() {
  var card = document.getElementById('qa-gate-card');
  if (!card) return;
  _gateSetEnabled(); // clear any prior disabled styling
  var cfg = APP._gateConfig || {};
  if (!cfg.enabled) { card.style.display = 'none'; return; }
  // Guard: vehicle must be active
  var vehActive = !STATE.vehicle || String(STATE.vehicle.isActive || 'true').toLowerCase() === 'true';
  card.style.display = 'flex';
  if (!vehActive) { _gateSetState('disabled'); return; }
  _gateSetState('idle');
  _gateStartOrStop();
}

function _gateStartWatch() {
  if (_gateWatchId !== null) { navigator.geolocation.clearWatch(_gateWatchId); }
  if (!navigator.geolocation) { _gateSetState('gps-off'); return; }
  _gateWatchId = navigator.geolocation.watchPosition(
    function(pos) { _gateOnPosition(pos); },
    function(err) { console.warn('Gate GPS error:', err.code); _gateSetState('gps-off'); },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
  );
}

function _gateOnPosition(pos) {
  var cfg = APP._gateConfig || {};
  if (!cfg.enabled || !cfg.lat || !cfg.lng) return;
  var lat = pos.coords.latitude;
  var lng = pos.coords.longitude;
  var speedMs = pos.coords.speed || 0;
  var distKm = _thHaversine(lat, lng, parseFloat(cfg.lat), parseFloat(cfg.lng));
  var distM = distKm * 1000;
  var radius = parseFloat(cfg.radius) || 200;
  if (distM < radius) {
    if (_gateOpening) return;
    if (!_gateCheckConditions(speedMs, cfg)) return;
    _gateSetState('opening');
    _gateOpen(cfg.lotId, distM, speedMs, lat, lng);
  } else if (distM < 400) {
    _gateSetState('approaching');
    var badge = document.getElementById('gate-dist-badge');
    if (badge) badge.textContent = Math.round(distM) + ' מ\'';
  } else {
    _gateSetState('idle');
  }
}

function _gateCheckConditions(speedMs, cfg) {
  if (Date.now() < _gateCooldownUntil) return false;
  if (_gateMode === 'off') return false;
  if (_gateMode === 'schedule') {
    var _scH = ('0' + new Date().getHours()).slice(-2) + ':' + ('0' + new Date().getMinutes()).slice(-2);
    if (_scH < _gateModeStart || _scH > _gateModeEnd) return false;
  }
  var speedKmh = speedMs * 3.6;
  var maxSpeed = parseFloat(cfg.maxSpeed) || 30;
  if (maxSpeed > 0 && speedKmh > maxSpeed) return false;
  if (cfg.hoursStart && cfg.hoursEnd) {
    var now = new Date();
    var hhmm = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
    if (hhmm < cfg.hoursStart || hhmm > cfg.hoursEnd) return false;
  }
  if (cfg.allowedDays) {
    var days = String(cfg.allowedDays).split(',').map(function(d){return parseInt(d.trim(),10);});
    if (days.indexOf(new Date().getDay()) === -1) return false;
  }
  return true;
}

function _gateOpen(lotId, distM, speedMs, lat, lng) {
  _gateOpening = true;
  var uid = STATE.firebaseUid || (STATE.user && STATE.user.uid) || '';
  var vehId = (STATE.vehicle && STATE.vehicle.id) || '';
  gasPost('open_gate', {
    lotId: lotId,
    vehicleId: vehId,
    uid: uid,
    dist: Math.round(distM),
    speed: Math.round(speedMs * 3.6 * 10) / 10,
    lat: lat,
    lng: lng
  }, { silent: true }).then(function(r) {
    _gateOpening = false;
    if (r && r.ok) {
      var cooldownSec = parseFloat((APP._gateConfig||{}).cooldownSec) || 300;
      _gateCooldownUntil = Date.now() + cooldownSec * 1000;
      _gateShowSuccess(r.lotName || (APP._gateConfig||{}).lotName || 'חניון', distM);
    } else {
      _gateSetState('error');
      setTimeout(function(){ _gateSetState('idle'); }, 5000);
    }
  }).catch(function() {
    _gateOpening = false;
    _gateSetState('error');
    setTimeout(function(){ _gateSetState('idle'); }, 5000);
  });
}

function _gateSetState(state) {
  GATE_STATE = state;
  var card = document.getElementById('qa-gate-card');
  if (!card) return;
  card.setAttribute('data-state', state);
  var lbl = document.getElementById('gate-lbl');
  var iconBox = document.getElementById('gate-icon-box');
  var distBadge = document.getElementById('gate-dist-badge');
  var statusDot = document.getElementById('gate-status-dot');
  var svg = document.getElementById('gate-icon-svg');
  if (distBadge) distBadge.style.display = state === 'approaching' ? 'block' : 'none';
  if (statusDot) { statusDot.style.display = state === 'gps-off' ? 'block' : 'none'; statusDot.style.background = '#FF9F0A'; }
  if (lbl) {
    var labels = { 'idle':'שערי חניון\nוחניה', 'gps-off':'GPS\nלא זמין', 'approaching':'שערי חניון\nוחניה', 'opening':'פותח\nשער...', 'success':'נפתח\n✓', 'error':'שגיאה\nנסה שוב', 'disabled':'שער מושבת\nרכב לא פעיל' };
    lbl.innerHTML = (labels[state]||'שערי חניון<br>וחניה').replace('\n','<br>');
  }
  if (iconBox) {
    if (state === 'opening') { iconBox.style.background = 'rgba(255,255,255,0.2)'; }
    else if (state === 'gps-off') { iconBox.style.background = 'rgba(138,138,142,0.15)'; }
    else { iconBox.style.background = 'var(--red-dim)'; }
  }
  if (svg) {
    if (state === 'gps-off') { svg.setAttribute('stroke','#8A8A8E'); }
    else if (state === 'error') { svg.setAttribute('stroke','#FF453A'); }
    else if (state === 'opening') { svg.setAttribute('stroke','#fff'); }
    else { svg.setAttribute('stroke','#1F8A3D'); }
  }
}

function _gateShowSuccess(lotName, distM) {
  _gateSetState('success');
  var overlay = document.getElementById('gate-success-overlay');
  if (!overlay) return;
  var title = document.getElementById('gs-title');
  var lot = document.getElementById('gs-lot');
  var meta = document.getElementById('gs-meta');
  var bar = document.getElementById('gs-bar');
  if (title) title.textContent = 'השער נפתח!';
  if (lot) lot.textContent = lotName;
  var now = new Date();
  var timeStr = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
  if (meta) meta.textContent = 'מרחק: ' + Math.round(distM) + ' מ\' · ' + timeStr;
  overlay.style.display = 'flex';
  if (bar) { bar.style.width = '0'; setTimeout(function(){ bar.style.width = '100%'; }, 50); }
  // Show OS notification
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(function(reg) {
      reg.showNotification('🅿️ שער החניון נפתח', {
        body: lotName + ' · נפתח אוטומטית עבורך',
        icon: './icons/icon-192.png',
        badge: './icons/badge-blue.png',
        tag: 'gate-open',
        renotify: true,
        requireInteraction: true,
        actions: [{ action:'view', title:'פרטים' }, { action:'dismiss', title:'סגור' }],
        dir: 'rtl', lang: 'he'
      });
    }).catch(function(){});
  }
  setTimeout(function() {
    overlay.style.display = 'none';
    _gateSetState('idle');
  }, 4500);
}

// Expose tap handler
if (typeof APP !== 'undefined') {
  APP.gateCardTap = function() {
    if (GATE_STATE === 'error') { _gateSetState('idle'); _gateStartWatch(); }
  };
}
// ============================================================
// END GATE MODULE
// ============================================================

// ============================================================
// GATE BACKGROUND MODE — מנוע GPS ברקע + לוח זמנים
// ============================================================

var _gateBgWatchId   = null;    // ID מ-BackgroundGeolocation.addWatcher()
var _gateBgInst      = null;    // reference to BG plugin — for notif updates
var _gateLastNotifMsg   = '';   // last notification message text
var _gateLastNotifDistM = -999; // distM at last notification update
var _gateMode        = 'off';   // 'always' | 'schedule' | 'off'
var _gateModeStart   = '07:00'; // HH:MM
var _gateModeEnd     = '18:00'; // HH:MM
var _GATE_MODE_KEY       = 'aleh_gate_mode_v1';
var _GATE_MODE_START_KEY = 'aleh_gate_mode_start_v1';
var _GATE_MODE_END_KEY   = 'aleh_gate_mode_end_v1';

function _gateLoadMode() {
  _gateMode      = localStorage.getItem(_GATE_MODE_KEY)       || 'off';
  _gateModeStart = localStorage.getItem(_GATE_MODE_START_KEY) || '07:00';
  _gateModeEnd   = localStorage.getItem(_GATE_MODE_END_KEY)   || '18:00';
}

function _gateSaveMode(mode, start, end) {
  _gateMode = mode;
  if (start) _gateModeStart = start;
  if (end)   _gateModeEnd   = end;
  localStorage.setItem(_GATE_MODE_KEY,       _gateMode);
  localStorage.setItem(_GATE_MODE_START_KEY, _gateModeStart);
  localStorage.setItem(_GATE_MODE_END_KEY,   _gateModeEnd);
}

/* Visible status line in the gate card. type: 'native'|'foreground'|'error'|'off'. */
function _gateSetStatus(type, extra) {
  var el = document.getElementById('gm-status');
  if (!el) return;
  var txt = '', bg = '', color = '', border = '';
  if (type === 'native') {
    txt = '🔵 Native GPS פעיל'; color = '#0A84FF'; bg = 'rgba(10,132,255,.12)'; border = 'rgba(10,132,255,.35)';
  } else if (type === 'foreground') {
    txt = '🟡 Foreground GPS פעיל'; color = '#FFD60A'; bg = 'rgba(255,214,10,.12)'; border = 'rgba(255,214,10,.35)';
  } else if (type === 'error') {
    txt = '🔴 שגיאה: ' + (extra || 'לא ידועה'); color = '#FF453A'; bg = 'rgba(255,69,58,.12)'; border = 'rgba(255,69,58,.4)';
  } else {
    el.style.display = 'none'; return;
  }
  el.textContent = txt;
  el.style.color = color;
  el.style.background = bg;
  el.style.border = '1px solid ' + border;
  el.style.display = 'block';
}

function _gateIsNativeCapacitor() {
  return !!(window.Capacitor &&
            window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform());
}

function _gateBgPlugin() {
  if (!window.Capacitor) return null;
  // Already registered (bundled context)
  var existing = window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation;
  if (existing) return existing;
  // Plain HTML context: register the plugin proxy on demand
  if (typeof window.Capacitor.registerPlugin === 'function') {
    try {
      var plugin = window.Capacitor.registerPlugin('BackgroundGeolocation');
      if (plugin) return plugin;
    } catch(e) {
      console.warn('[gate-native] registerPlugin failed:', e);
    }
  }
  return null;
}

function _gateStopWatchNative() {
  var BG = _gateBgPlugin();
  if (!BG || !_gateBgWatchId) { _gateBgWatchId = null; _gateBgInst = null; return Promise.resolve(); }
  var id = _gateBgWatchId;
  _gateBgWatchId = null;
  _gateBgInst = null;
  _gateLastNotifMsg = '';
  _gateLastNotifDistM = -999;
  return BG.removeWatcher({ id: id }).then(function() {
    console.log('[gate-native] watch removed');
  }).catch(function(e) {
    console.warn('[gate-native] removeWatcher error:', e);
  });
}

/* Build rich notification message from current position data. */
function _gateBuildNotifMsg(distM, speedMs) {
  var cfg = APP._gateConfig || {};
  var lotName = cfg.lotName || 'החניון';
  var speedKmh = Math.round((speedMs || 0) * 3.6);
  var distStr = distM < 1000
    ? Math.round(distM) + 'מ\''
    : (distM / 1000).toFixed(1) + 'ק"מ';
  var parts = ['📍 ' + distStr + ' מ' + lotName];
  if (speedKmh > 2) parts.push('🚗 ' + speedKmh + ' קמ"ש');
  if (_gateMode === 'schedule') parts.push('⏰ ' + _gateModeStart + '–' + _gateModeEnd);
  return parts.join(' • ');
}

/* Named GPS callback — used in addWatcher so it can be re-passed on notif restart. */
function _gateBgOnLocation(location, error) {
  if (error) {
    console.warn('[gate-native] error:', error.code, error.message);
    _gateSetStatus('error', (error.message || error.code || 'שגיאת מיקום'));
    if (error.code === 'NOT_AUTHORIZED') _gateSetState('gps-off');
    return;
  }
  if (!location) return;
  var coords = {
    latitude:  location.latitude,
    longitude: location.longitude,
    speed:     typeof location.speed === 'number' ? location.speed : 0,
    accuracy:  location.accuracy
  };
  _gateOnPosition({ coords: coords });
  _gateBgUpdateNotif(coords);
}

/* Restart watcher with updated notification message when distance changes >75m. */
function _gateBgUpdateNotif(coords) {
  if (!_gateBgInst || !_gateBgWatchId) return;
  var cfg = APP._gateConfig || {};
  if (!cfg.lat || !cfg.lng) return;
  var distM = _thHaversine(
    coords.latitude, coords.longitude,
    parseFloat(cfg.lat), parseFloat(cfg.lng)
  ) * 1000;
  if (Math.abs(distM - _gateLastNotifDistM) < 75 && _gateLastNotifMsg) return;
  var newMsg = _gateBuildNotifMsg(distM, coords.speed || 0);
  if (newMsg === _gateLastNotifMsg) return;
  _gateLastNotifMsg   = newMsg;
  _gateLastNotifDistM = distM;
  var BG    = _gateBgInst;
  var oldId = _gateBgWatchId;
  _gateBgWatchId = null;
  BG.removeWatcher({ id: oldId }).then(function() {
    return BG.addWatcher({
      backgroundTitle:    'עלה דרייב',
      backgroundMessage:  newMsg,
      requestPermissions: false,
      stale:              false,
      distanceFilter:     20
    }, _gateBgOnLocation);
  }).then(function(newId) {
    _gateBgWatchId = newId;
  }).catch(function(e) {
    console.warn('[gate-native] notif update failed:', e);
  });
}

function _gateStartWatchNative() {
  var BG = _gateBgPlugin();
  // In Capacitor 6, registerPlugin() always returns a truthy proxy even when
  // the native plugin is absent — so a non-null BG does NOT prove native works.
  // We rely on addWatcher's Promise: it resolves with a real watcherId only
  // when the native service actually started. If the plugin proxy has no
  // addWatcher (or it rejects), we fall back to foreground GPS and say so.
  if (!BG || typeof BG.addWatcher !== 'function') {
    console.warn('[gate-native] BackgroundGeolocation plugin unavailable — using foreground GPS');
    _gateSetStatus('foreground');
    _gateStartWatch();
    return;
  }
  var modeLabel = _gateMode === 'schedule'
    ? 'מעקב פעיל ' + _gateModeStart + '–' + _gateModeEnd
    : 'GPS עוקב לפתיחת שערי חניון אוטומטית';
  // Guard against addWatcher hanging without ever resolving/rejecting.
  var settled = false;
  var hangTimer = setTimeout(function() {
    if (settled) return;
    settled = true;
    console.warn('[gate-native] addWatcher timed out — falling back to foreground GPS');
    _gateSetStatus('error', 'התוסף לא הגיב (timeout) — עברנו ל-GPS רגיל');
    _gateStartWatch();
  }, 8000);
  _gateStopWatchNative().then(function() {
    return BG.addWatcher({
      backgroundTitle:    'עלה דרייב',
      backgroundMessage:  modeLabel,
      requestPermissions: true,
      stale:              false,
      distanceFilter:     20
    }, _gateBgOnLocation);
  }).then(function(watcherId) {
    if (settled) return;
    settled = true;
    clearTimeout(hangTimer);
    _gateBgWatchId = watcherId;
    _gateBgInst    = BG;
    console.log('[gate-native] watch started, id:', watcherId);
    _gateSetStatus('native');
  }).catch(function(err) {
    if (settled) return;
    settled = true;
    clearTimeout(hangTimer);
    console.warn('[gate-native] addWatcher failed:', err && (err.message || err));
    _gateSetStatus('error', (err && (err.message || err.code)) || 'addWatcher נכשל — עברנו ל-GPS רגיל');
    _gateStartWatch();
  });
}

/* Central entry point — decides which GPS engine to use based on stored mode.
   Replaces the direct _gateStartWatch() call in _gateInit(). */
function _gateStartOrStop() {
  _gateLoadMode();
  _gateUpdateModeUI();
  if (_gateMode === 'off') {
    if (_gateWatchId !== null) {
      try { navigator.geolocation.clearWatch(_gateWatchId); } catch(_) {}
      _gateWatchId = null;
    }
    _gateStopWatchNative();
    _gateSetState('idle');
    return;
  }
  // 'always' or 'schedule' — start the appropriate GPS engine
  if (_gateIsNativeCapacitor()) {
    _gateStartWatchNative();
  } else {
    _gateSetStatus('foreground');
    _gateStartWatch();
  }
}

/* Public: change mode and restart GPS. Called from mode-selector UI. */
function _gateModeSet(mode, start, end) {
  _gateSaveMode(mode, start, end);
  _gateStartOrStop();
}

/* Public: stop GPS entirely and set mode to 'off'. Called from power button. */
function _gatePowerOff() {
  _gateSaveMode('off', null, null);
  if (_gateWatchId !== null) {
    try { navigator.geolocation.clearWatch(_gateWatchId); } catch(_) {}
    _gateWatchId = null;
  }
  _gateStopWatchNative();
  _gateLastNotifMsg   = '';
  _gateLastNotifDistM = -999;
  _gateSetState('idle');
  _gateSetStatus('off');
  _gateUpdateModeUI();
}

/* Sync the 3-pill mode selector and schedule panel to current _gateMode. */
function _gateUpdateModeUI() {
  var modeWrap = document.getElementById('gate-mode-wrap');
  if (modeWrap) modeWrap.style.display = 'flex';
  ['always', 'schedule', 'off'].forEach(function(m) {
    var btn = document.getElementById('gm-btn-' + m);
    if (!btn) return;
    btn.classList.remove('gm-active', 'gm-active-off');
    if (m === _gateMode) {
      btn.classList.add(m === 'off' ? 'gm-active-off' : 'gm-active');
    }
  });
  var schedPanel = document.getElementById('gm-sched-panel');
  if (schedPanel) schedPanel.style.display = _gateMode === 'schedule' ? 'flex' : 'none';
  var startEl = document.getElementById('gm-start');
  var endEl   = document.getElementById('gm-end');
  if (startEl) startEl.value = _gateModeStart;
  if (endEl)   endEl.value   = _gateModeEnd;
}

/* Helper: apply schedule mode with current picker values. Called from "אישור" button. */
function _gateApplySchedule() {
  var s = document.getElementById('gm-start');
  var e = document.getElementById('gm-end');
  if (!s || !e || !s.value || !e.value) return;
  _gateModeSet('schedule', s.value, e.value);
}

// Override the tap handler exposed by the legacy END GATE MODULE block and
// add new public APIs — this runs after the original, overwriting APP properties.
(function _gateExposePublicApi() {
  if (typeof APP === 'undefined') { setTimeout(_gateExposePublicApi, 300); return; }
  APP.gateCardTap  = function() {
    if (GATE_STATE === 'error') { _gateSetState('idle'); _gateStartOrStop(); }
  };
  APP.gatePowerOff     = _gatePowerOff;
  APP.gateModeSet      = _gateModeSet;
  APP.gateApplySchedule = _gateApplySchedule;
})();

// ============================================================
// END GATE BACKGROUND MODE
// ============================================================

function _thIsOpen(s) {
  var now = new Date(), day = now.getDay(), h = now.getHours() + now.getMinutes()/60;
  if (day === 6) return false; // שבת
  if (day === 5) return s.hoursFriday ? (h >= s.hoursFriday[0] && h < s.hoursFriday[1]) : false;
  if (!s.hoursWeekday) return false; // unknown (e.g. API station without hours)
  return h >= s.hoursWeekday[0] && h < s.hoursWeekday[1];
}

function _thStars(r) {
  var s = ''; for (var i=1;i<=5;i++) s += (i <= Math.round(r)) ? '★' : '☆'; return s;
}

function _thMakeMarkerIcon(num, active) {
  return L.divIcon({
    className: '',
    html: '<div style="width:32px;height:32px;border-radius:50%;background:' + (active?'#30D158':'#1F8A3D') + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;box-shadow:0 2px 12px rgba(48,209,88,.5);border:2px solid ' + (active?'#fff':'rgba(255,255,255,.3)') + ';font-family:inherit;">' + num + '</div>',
    iconSize: [32,32], iconAnchor: [16,16], popupAnchor: [0,-18]
  });
}

APP._thMarkers = [];

// Parse Google weekday descriptions array into structured days
// Input: ["יום ראשון: 7:00–16:15", "יום שני: 7:00–16:15", ...]
// Output: [{day:'ראשון', hours:'7:00–16:15', isToday:bool}, ...]
function _thParseHours(weekdayDescArr) {
  if (!weekdayDescArr || !weekdayDescArr.length) return [];
  var todayIdx = new Date().getDay(); // 0=Sun
  return weekdayDescArr.map(function(line, i) {
    var parts = String(line).split(': ');
    var dayLabel = parts[0] ? parts[0].replace('יום ','') : '';
    var hoursStr = parts.slice(1).join(': ') || 'סגור';
    return { day: dayLabel, hours: hoursStr, isToday: (i === todayIdx) };
  });
}

function _thHoursTableHtml(parsed) {
  if (!parsed || !parsed.length) return '<div style="color:var(--t2);font-size:12px;padding:8px 16px;">שעות לא ידועות</div>';
  return '<div class="th-hours-table">' +
    parsed.map(function(d) {
      return '<div class="th-hours-row' + (d.isToday ? ' today' : '') + '">' +
        '<div class="th-hours-day">' + (d.isToday ? '▶ ' : '') + 'יום ' + d.day + '</div>' +
        '<div class="th-hours-val">' + d.hours + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _thTodayHours(parsed) {
  if (!parsed || !parsed.length) return null;
  var today = parsed.find(function(d){ return d.isToday; });
  return today ? today.hours : null;
}

APP._initStationsPanel = async function(userLat, userLng) {
  var list = document.getElementById('th-station-list');
  if (!list) return;

  // Source data: real Google Places via GAS, fallback to TH_STATIONS
  var source = TH_STATIONS;
  if (userLat && userLng) {
    try {
      var r = await gasPost('get_nearby_test_stations', {
        idToken: STATE.idToken || STATE.token || '',
        lat: userLat,
        lng: userLng
      });
      if (r && r.ok && r.stations && r.stations.length > 0) {
        source = r.stations.map(function(s, i) {
          return Object.assign({}, s, {
            id: i + 1,
            rating: s.rating || 0,
            ratingCount: s.ratingCount || 0,
            hoursWeekday: null, // use isOpen from API
            hoursFriday: null,
            waze: s.waze || ('https://waze.com/ul?ll=' + s.lat + ',' + s.lng + '&navigate=yes')
          });
        });
      }
    } catch(e) { /* fallback to TH_STATIONS */ }
  }

  // Sort by distance if GPS available
  var stations = source.map(function(s) {
    var dist = (userLat && userLng) ? _thHaversine(userLat, userLng, s.lat, s.lng) : null;
    return Object.assign({}, s, {dist: dist});
  });
  if (userLat) stations.sort(function(a,b){ return a.dist - b.dist; });

  // Save for re-sort / re-render
  APP._thStationsData = stations;
  APP._thSortMode = 'dist';

  // Build cards
  APP._thRenderCards(stations);

  // Init Leaflet map
  var mapEl = document.getElementById('th-leaflet-map');
  if (!mapEl || !window.L) return;
  if (APP._thMap) { APP._thMap.remove(); APP._thMap = null; }
  var centerLat = userLat || 32.08, centerLng = userLng || 34.78;
  var map = L.map('th-leaflet-map', { zoomControl:true, attributionControl:false }).setView([centerLat, centerLng], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19, subdomains:'abcd' }).addTo(map);
  APP._thMap = map;
  APP._thMapMarkers = {};

  // User marker
  if (userLat) {
    L.circleMarker([userLat, userLng], { radius:8, color:'#30D158', fillColor:'#30D158', fillOpacity:1, weight:3 })
      .addTo(map).bindPopup('מיקומך');
  }

  // Station markers
  stations.forEach(function(s, idx) {
    var marker = L.marker([s.lat, s.lng], { icon: _thMakeMarkerIcon(idx+1, false) }).addTo(map);
    marker.bindPopup('<div style="direction:rtl">'+s.name+'<br><small>'+s.addr+'</small></div>');
    marker.on('click', function() {
      APP._thMarkerClicking = true; // suppress moveend reload
      APP._thToggleSC(s.id, true);
      marker.openPopup();
      var el = document.getElementById('th-sc-'+s.id);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
      // Update all markers
      stations.forEach(function(ss, ii) {
        if (APP._thMapMarkers[ss.id]) APP._thMapMarkers[ss.id].setIcon(_thMakeMarkerIcon(ii+1, ss.id===s.id));
      });
    });
    APP._thMapMarkers[s.id] = marker;
  });

  // Reload stations by new map center on drag/zoom (debounced)
  // Skip reload when triggered by marker click pan
  APP._thMarkerClicking = false;
  var _mapLoadTimer = null;
  map.on('moveend', function() {
    if (APP._thMarkerClicking) { APP._thMarkerClicking = false; return; }
    clearTimeout(_mapLoadTimer);
    _mapLoadTimer = setTimeout(function() {
      var center = map.getCenter();
      APP._thLoadStations(center.lat, center.lng);
    }, 800);
  });

  // Locate-me button — positioned as absolute overlay on map container (not Leaflet control)
  var mapWrap = document.getElementById('th-station-map-wrap');
  if (mapWrap) {
    var locateBtn = document.createElement('button');
    locateBtn.className = 'th-locate-btn';
    locateBtn.title = 'מיקום נוכחי';
    locateBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    locateBtn.addEventListener('touchstart', function(e){ e.stopPropagation(); }, {passive:true});
    locateBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      locateBtn.classList.add('loading');
      navigator.geolocation.getCurrentPosition(function(pos) {
        locateBtn.classList.remove('loading');
        APP._thMarkerClicking = true;
        map.setView([pos.coords.latitude, pos.coords.longitude], 13, { animate: true });
        APP._thLoadStations(pos.coords.latitude, pos.coords.longitude);
      }, function() {
        locateBtn.classList.remove('loading');
        showToast('לא ניתן לאתר מיקום');
      }, { timeout: 6000 });
    });
    mapWrap.appendChild(locateBtn);
  }

  // Fix Leaflet sizing when panel becomes visible
  setTimeout(function(){ if (APP._thMap) APP._thMap.invalidateSize(); }, 250);
};

// Render station cards from a list into #th-station-list
APP._thRenderCards = function(stations) {
  var list = document.getElementById('th-station-list');
  if (!list) return;
  list.innerHTML = '';
  stations.forEach(function(s, idx) {
    var open = (s.isOpen !== null && s.isOpen !== undefined) ? s.isOpen : _thIsOpen(s);
    var parsedHours = _thParseHours(s.hoursArr || (s.hours ? s.hours.split(' | ') : []));
    var todayHours = _thTodayHours(parsedHours);
    var distTxt = s.dist !== null && s.dist !== undefined ? (s.dist < 1 ? Math.round(s.dist*1000) + 'מ׳' : s.dist.toFixed(1) + ' ק"מ') : '—';
    var card = document.createElement('div');
    card.className = 'th-sc' + (idx === 0 ? ' open' : '');
    card.id = 'th-sc-' + s.id;
    card.innerHTML =
      '<div class="th-sc-head" onclick="APP._thToggleSC('+s.id+')">' +
        '<div class="th-sc-row1">' +
          '<div><div class="th-sc-name">'+s.name+'</div><div class="th-sc-addr">'+s.addr+'</div></div>' +
          '<div class="th-sc-right">' +
            '<div class="th-sc-dist">'+distTxt+'</div>' +
            '<div class="th-sc-stars">'+_thStars(s.rating)+'<span>'+s.rating+' ('+s.ratingCount+')</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="th-sc-row2">' +
          '<div class="th-sc-status '+(open?'open':'closed')+'"><div class="th-sc-dot"></div>'+(open?'פתוח':'סגור')+'</div>' +
          '<div class="th-sc-hours">'+(todayHours || '')+'</div>' +
          '<svg class="th-sc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>' +
        '</div>' +
      '</div>' +
      '<div class="th-sc-body">' +
        _thHoursTableHtml(parsedHours) +
        '<div class="th-sc-actions">' +
          '<button class="th-sc-btn call" onclick="window.open(\'tel:'+s.phone+'\')"><div class="th-sc-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#30D158" stroke-width="2.2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 11.88 19.79 19.79 0 0 1 1.07 3.21 2 2 0 0 1 3.05 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/></svg></div>חייג</button>' +
          '<a class="th-sc-btn waze" href="'+s.waze+'" target="_blank" rel="noopener"><div class="th-sc-btn-icon"><svg width="20" height="20" viewBox="0 0 48 48" fill="none"><ellipse cx="24" cy="27" rx="17" ry="14" fill="#fff"/><circle cx="18" cy="33" r="3" fill="#333"/><circle cx="30" cy="33" r="3" fill="#333"/><path d="M15 24 Q24 14 33 24" stroke="#333" stroke-width="2.5" stroke-linecap="round" fill="none"/><circle cx="35" cy="15" r="6" fill="#FFB800"/></svg></div>Waze</a>' +
          '<button class="th-sc-btn site" onclick="window.open(\'https://www.gov.il/he/service/vehicle_test_scheduling\',\'_blank\')"><div class="th-sc-btn-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>תור</button>' +
        '</div>' +
      '</div>';
    list.appendChild(card);
  });
};

// Re-sort stations by distance or rating
APP._thSort = function(mode) {
  APP._thSortMode = mode;
  var db = document.getElementById('th-sort-dist'); if (db) db.classList.toggle('active', mode==='dist');
  var rb = document.getElementById('th-sort-rating'); if (rb) rb.classList.toggle('active', mode==='rating');
  if (!APP._thStationsData) return;
  var sorted = APP._thStationsData.slice().sort(function(a,b){
    if (mode === 'rating') return (b.rating||0) - (a.rating||0);
    return (a.dist||9999) - (b.dist||9999);
  });
  APP._thRenderCards(sorted);
};

// Load stations near (lat,lng) — used on map drag/zoom
APP._thLoadStations = async function(lat, lng) {
  var list = document.getElementById('th-station-list');
  if (list) list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--t2);">טוען מכונים...</div>';

  var stations = TH_STATIONS; // fallback
  try {
    var r = await gasPost('get_nearby_test_stations', {
      idToken: STATE.idToken || STATE.token || '',
      lat: lat, lng: lng
    });
    if (r && r.ok && r.stations && r.stations.length > 0) {
      stations = r.stations.map(function(s, i) {
        var dist = _thHaversine(lat, lng, s.lat, s.lng);
        return Object.assign({}, s, {
          id: i+1, dist: dist,
          waze: s.waze || ('https://waze.com/ul?ll='+s.lat+','+s.lng+'&navigate=yes')
        });
      });
    }
  } catch(e) {}

  stations = stations.map(function(s) {
    var dist = (s.dist != null) ? s.dist : _thHaversine(lat, lng, s.lat, s.lng);
    return Object.assign({}, s, {dist: dist});
  });
  stations.sort(function(a,b){ return a.dist - b.dist; });

  APP._thStationsData = stations;
  APP._thRenderCards(stations);

  // Update map markers
  if (APP._thMapMarkers) {
    Object.values(APP._thMapMarkers).forEach(function(m){ m.remove(); });
    APP._thMapMarkers = {};
  }
  stations.forEach(function(s, idx) {
    if (!s.lat || !s.lng || !APP._thMap) return;
    var marker = L.marker([s.lat, s.lng], { icon: _thMakeMarkerIcon(idx+1, false) }).addTo(APP._thMap);
    marker.bindPopup('<div style="direction:rtl">'+s.name+'</div>');
    marker.on('click', function() {
      APP._thToggleSC(s.id, true);
      var el = document.getElementById('th-sc-'+s.id);
      if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
      stations.forEach(function(ss,ii){ if(APP._thMapMarkers[ss.id]) APP._thMapMarkers[ss.id].setIcon(_thMakeMarkerIcon(ii+1, ss.id===s.id)); });
    });
    APP._thMapMarkers[s.id] = marker;
  });
};

APP._thToggleSC = function(id, forceOpen) {
  var card = document.getElementById('th-sc-'+id);
  if (!card) return;
  var wasOpen = card.classList.contains('open');
  // Close all
  document.querySelectorAll('.th-sc').forEach(function(c){ c.classList.remove('open','highlight'); });
  // Toggle or force
  if (!wasOpen || forceOpen) { card.classList.add('open','highlight'); }
  // Update map marker highlight
  if (APP._thMapMarkers) {
    TH_STATIONS.forEach(function(s, idx) {
      if (APP._thMapMarkers[s.id]) {
        APP._thMapMarkers[s.id].setIcon(_thMakeMarkerIcon(idx+1, s.id===id && (!wasOpen||forceOpen)));
      }
    });
  }
};

APP._thResizeImage = function(file) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(url);
      var MAX = 800; // max width/height in px
      var w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // JPEG quality 0.75 — מספיק לOCR, קטן בהרבה
      var b64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      resolve(b64);
    };
    img.onerror = function() {
      // fallback — שלח כמות שהיא
      APP._fileToBase64(file).then(resolve).catch(function() { resolve(''); });
    };
    img.src = url;
  });
};

// Camera tooltip — position:fixed, immune to overflow:hidden on parents
APP._initCamTooltip = function() {
  var btn = document.getElementById('pds-cam-btn');
  var tip = document.getElementById('pds-cam-tip-fixed');
  if (!btn || !tip) return;
  var hideTimer, showTimer;
  function positionTip() {
    var r = btn.getBoundingClientRect();
    var left = r.right - 252;
    if (left < 8) left = 8;
    tip.style.left = left + 'px';
    tip.style.top  = (r.bottom + 10) + 'px';
  }
  function showTip() {
    clearTimeout(hideTimer);
    positionTip();
    tip.classList.remove('hiding');
    tip.classList.add('visible');
    hideTimer = setTimeout(hideTip, 5000);
  }
  function hideTip() {
    tip.classList.add('hiding');
    setTimeout(function(){ tip.classList.remove('visible','hiding'); }, 300);
  }
  showTimer = setTimeout(showTip, 1400);
  btn.addEventListener('click', function(){ clearTimeout(showTimer); clearTimeout(hideTimer); hideTip(); });
  document.addEventListener('touchstart', function(e){
    if (!tip.contains(e.target) && e.target !== btn){ clearTimeout(hideTimer); hideTip(); }
  }, {passive:true});
};

APP.thOcrScanEmail = function() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  input.onchange = async function(e) {
    var file = e.target.files[0];
    document.body.removeChild(input);
    if (!file) return;
    var overlay = document.getElementById('th-ocr-overlay');
    if (overlay) overlay.style.display = 'flex';
    try {
      var b64 = await APP._thResizeImage(file);
      if (!b64) { if (overlay) overlay.style.display = 'none'; APP._thEmailManualFallback('שגיאה בעיבוד התמונה'); return; }
      var r = await gasPostForm('ocr_extract_email', { imageBase64: b64 });
      if (overlay) overlay.style.display = 'none';
      if (r && r.ok && r.email) {
        var inp = document.getElementById('th-pds-email') || document.getElementById('th-station-email');
        if (inp) { inp.value = r.email; inp.focus(); }
        showToast('מייל זוהה: ' + r.email);
      } else {
        APP._thEmailManualFallback('לא זוהה מייל — הזן ידנית');
      }
    } catch(err) {
      if (overlay) overlay.style.display = 'none';
      APP._thEmailManualFallback('שגיאה: ' + ((err && err.message) || 'נסה שנית'));
    }
  };
  // חייב להיות ב-DOM לפני click — נדרש על iOS/Android PWA
  document.body.appendChild(input);
  input.click();
};

// Fallback when OCR fails: focus the email field so the user can type manually.
APP._thEmailManualFallback = function(msg) {
  showToast(msg || 'הזן כתובת מייל ידנית');
  var inp = document.getElementById('th-pds-email') || document.getElementById('th-station-email');
  if (inp) { try { inp.focus(); inp.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_) {} }
};

APP.thSendDocs = async function() {
  var email = ((document.getElementById('th-station-email') || document.getElementById('th-pds-email')) || {}).value;
  email = email ? email.trim() : '';
  if (!email || !email.includes('@')) {
    showToast('נא להזין כתובת מייל תקינה'); return;
  }
  var btn = document.getElementById('th-pds-send-cta');
  if (!btn) return;
  // מצב שליחה
  btn.className = btn.className.replace(/\b(sent|resend|sending)\b/g, '').trim() + ' sending';
  btn.innerHTML = '<span style="display:flex;align-items:center;gap:8px;position:relative;z-index:1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="50" stroke-dashoffset="50" style="animation:dashAnim 1s linear infinite"><circle cx="12" cy="12" r="9"/></svg>שולח...</span>';
  // הסר error div קודם אם יש
  var prevErr = document.getElementById('th-send-error');
  if (prevErr) prevErr.style.display = 'none';
  var _docsGps = {lat:'', lng:''};
  try { var _dg = await APP._getGps(4000); if (_dg && _dg.lat) { _docsGps = {lat:String(_dg.lat), lng:String(_dg.lng)}; } } catch(_dge){}
  try {
    var r = await gasPost('send_test_documents', {
      vehicleId: (STATE.vehicle && STATE.vehicle.id) || '',
      stationEmail: email,
      lat: _docsGps.lat, lng: _docsGps.lng
    });
    if (r && r.ok) {
      // success — הצג banner
      var sb = document.getElementById('th-pds-success');
      if (sb) sb.style.display = 'flex';
      // מצב "נשלח" — אנימציה 3 שניות
      btn.className = btn.className.replace(/\b(sending|resend)\b/g, '').trim() + ' sent';
      btn.innerHTML = '<span style="font-size:17px;font-weight:800;position:relative;z-index:1;letter-spacing:-0.3px">נשלח בהצלחה!</span>';
      // אחרי 3 שניות — מצב "שלח שוב"
      setTimeout(function() {
        btn.className = btn.className.replace(/\b(sent)\b/g, '').trim() + ' resend';
        btn.innerHTML = '<span style="display:flex;align-items:center;gap:8px;position:relative;z-index:1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>שלח שוב</span>';
      }, 3000);
    } else {
      // שגיאת שרת
      btn.className = btn.className.replace(/\b(sending|sent|resend)\b/g, '').trim();
      btn.innerHTML = '<span style="position:relative;z-index:1">שלח מסמכים</span>';
      var errDiv = document.getElementById('th-send-error');
      if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'th-send-error';
        errDiv.style.cssText = 'background:#3D1A1A;color:#FF6B6B;border:1px solid #FF453A;border-radius:10px;padding:12px 16px;font-size:13px;direction:rtl;margin-top:8px;white-space:pre-wrap;word-break:break-all;';
        btn.parentNode && btn.parentNode.appendChild(errDiv);
      }
      errDiv.textContent = '⚠ ' + (r.error || 'שגיאה לא ידועה');
      errDiv.style.display = 'block';
    }
  } catch(e) {
    btn.className = btn.className.replace(/\b(sending|sent|resend)\b/g, '').trim();
    btn.innerHTML = '<span style="position:relative;z-index:1">שלח מסמכים</span>';
    var errDiv2 = document.getElementById('th-send-error');
    if (!errDiv2) {
      errDiv2 = document.createElement('div');
      errDiv2.id = 'th-send-error';
      errDiv2.style.cssText = 'background:#3D1A1A;color:#FF6B6B;border:1px solid #FF453A;border-radius:10px;padding:12px 16px;font-size:13px;direction:rtl;margin-top:8px;white-space:pre-wrap;word-break:break-all;';
      btn.parentNode && btn.parentNode.appendChild(errDiv2);
    }
    errDiv2.textContent = '⚠ ' + ((e && e.message) ? e.message : 'שגיאת שליחה');
    errDiv2.style.display = 'block';
    console.error('[thSendDocs]', e);
  }
};

// thCaptureEmail removed — thOcrScanEmail (POST) replaces it

APP.thSelectResult = function(type) {
  document.getElementById('th-result-pass')?.classList.toggle('selected', type === 'pass');
  document.getElementById('th-result-fail')?.classList.toggle('selected', type === 'fail');
  // Support both ID variants
  var passDrawer = document.getElementById('th-pass-drawer') || document.getElementById('th-drawer-pass');
  var failDrawer = document.getElementById('th-fail-drawer') || document.getElementById('th-drawer-fail');
  if (passDrawer) passDrawer.classList.toggle('open', type === 'pass');
  if (failDrawer) failDrawer.classList.toggle('open', type === 'fail');
};

APP.thCaptureTestForm = function(mode) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  if (mode === 'camera') input.capture = 'environment';
  input.onchange = async function(e) {
    var file = e.target.files[0]; if (!file) return;
    var preview = document.getElementById('th-form-preview');
    if (preview) { preview.textContent = '📎 ' + file.name; preview.style.display = 'block'; }
    var btn = document.getElementById('th-confirm-cta');
    if (btn) btn.disabled = false;
    APP._testFormFile = file;
  };
  input.click();
};

APP.thConfirmTestPass = async function() {
  if (!APP._testFormFile) { showToast('נא להעלות טופס טסט'); return; }
  const btn = document.getElementById('th-confirm-cta');
  if (btn) { btn.disabled = true; btn.textContent = 'שולח לאישור...'; }
  const b64 = await APP._fileToBase64(APP._testFormFile);
  const today = new Date().toISOString().slice(0,10);
  var gpsCoords = {lat:'', lng:''};
  try { var _g = await APP._getGps(4000); if (_g && _g.lat) { gpsCoords = {lat:String(_g.lat), lng:String(_g.lng)}; } } catch(_ge){}
  var driverId = (STATE.driver && (STATE.driver.id || STATE.driver.uid)) || '';
  try {
    const r = await gasPostForm('save_test_completion', {
      vehicleId: (STATE.vehicle && STATE.vehicle.id) || '',
      data: JSON.stringify({ date: today, formBase64: b64, lat: gpsCoords.lat, lng: gpsCoords.lng, driverId: driverId })
    });
    if (r.ok) {
      // מצב pending — לא testDone עדיין
      if (STATE.vehicle) {
        STATE.vehicle.testPendingApproval = 'true';
        STATE.vehicle.testPendingDate = today;
      }
      // הסתר drawer pass הרגיל, הצג מסך "נשלח לאישור"
      var ps = document.getElementById('th-pass-success');
      if (ps) ps.style.display = 'none';
      var pendingScreen = document.getElementById('th-pending-approval');
      if (pendingScreen) pendingScreen.style.display = 'flex';
      APP._clearTestAlert && APP._clearTestAlert();
    } else {
      showToast('שגיאה: ' + (r.error || ''));
      if (btn) { btn.disabled = false; btn.textContent = 'אשר — טסט בוצע'; }
    }
  } catch(e) {
    showToast('שגיאת רשת');
    if (btn) { btn.disabled = false; btn.textContent = 'אשר — טסט בוצע'; }
  }
};

APP.thConfirmPass = function() { return APP.thConfirmTestPass && APP.thConfirmTestPass(); };

APP.thSubmitFail = async function() {
  var reason = (document.getElementById('th-fail-reason')?.value || '').trim();
  if (!reason) { showToast('נא לציין סיבה'); return; }
  var btn = document.getElementById('th-fail-cta');
  if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }
  try {
    var r = await gasPost('save_test_failure', {
      vehicleId: (STATE.vehicle && STATE.vehicle.id) || '',
      reason: reason
    });
    if (r.ok) {
      var banner = document.getElementById('th-fail-success');
      if (banner) banner.style.display = 'flex';
      if (btn) btn.style.display = 'none';
    } else {
      showToast('שגיאה: ' + (r.error || 'לא ידוע'));
      if (btn) { btn.disabled = false; btn.textContent = 'שמור ותזמן טסט חוזר'; }
    }
  } catch(e) {
    showToast('שגיאת רשת');
    if (btn) { btn.disabled = false; btn.textContent = 'שמור ותזמן טסט חוזר'; }
  }
};

APP.thSendInvoice = async function() {
  const amount = document.getElementById('th-inv-amount')?.value?.trim();
  const date   = document.getElementById('th-inv-date')?.value?.trim();
  if (!amount || !APP._invoiceFile) { showToast('נא למלא סכום ולצרף חשבונית'); return; }
  const btn = document.getElementById('th-send-inv-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'שולח...'; }
  const b64 = await APP._fileToBase64(APP._invoiceFile);
  try {
    const r = await gasPostForm('send_test_invoice', {
      vehicleId: (STATE.vehicle && STATE.vehicle.id) || '', invoiceBase64: b64, amount, testDate: date
    });
    if (r.ok) {
      document.getElementById('th-inv-success')?.classList.remove('hidden');
    } else {
      showToast('שגיאה: ' + (r.error || ''));
      if (btn) { btn.disabled = false; btn.textContent = 'שלח למזכירות'; }
    }
  } catch(e) {
    showToast('שגיאת רשת');
    if (btn) { btn.disabled = false; btn.textContent = 'שלח למזכירות'; }
  }
};

APP.thCaptureInvoice = function() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*,application/pdf'; input.capture = 'environment';
  input.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    APP._invoiceFile = file;
    const lbl = document.getElementById('th-inv-filename');
    if (lbl) lbl.textContent = file.name;
    const btn = document.getElementById('th-send-inv-btn');
    if (btn) btn.disabled = false;
  };
  input.click();
};

APP._fileToBase64 = function(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
};

APP._clearTestAlert = function() {
  const alertEl = document.getElementById('home-alert');
  if (alertEl && alertEl.dataset.alertType?.includes('test')) {
    alertEl.classList.add('hidden');
  }
};

APP.thOpenDocViewer = function(docType) {
  const overlay = document.getElementById('th-doc-viewer');
  if (!overlay) return;
  const iframe = document.getElementById('th-doc-iframe');
  const title  = document.getElementById('th-doc-title');
  const v = STATE.vehicle || {};
  const urls = {
    license: v.licLink,
    insurance: v.insCompLink
  };
  const titles = { license: 'רישיון רכב', insurance: 'ביטוח חובה' };
  // Restore iframe view in case the auto-doc info panel was shown previously.
  var info = document.getElementById('th-doc-auto-info');
  if (info) info.style.display = 'none';
  if (iframe) iframe.style.display = '';
  if (iframe && urls[docType]) iframe.src = APP._thDrivePreviewUrl(urls[docType]);
  if (title) title.textContent = titles[docType] || docType;
  overlay.style.display = 'flex';
};

// Convert any Google Drive link to its embeddable /preview form.
APP._thDrivePreviewUrl = function(url) {
  if (!url) return '';
  var m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
  return url.replace('/view', '/preview');
};

APP.thCloseDocViewer = function() {
  const overlay = document.getElementById('th-doc-viewer');
  if (overlay) { overlay.style.display = 'none'; }
  const iframe = document.getElementById('th-doc-iframe');
  if (iframe) { iframe.src = ''; iframe.style.display = ''; }
  // Hide and reset the auto-doc info panel so the next open is clean.
  const info = document.getElementById('th-doc-auto-info');
  if (info) info.style.display = 'none';
};

// Aliases for screen-testhub HTML onclick handlers
APP.thSetStep = function(step) { APP.thSwitchStep && APP.thSwitchStep(step); };
APP.thToggleItem = function(idx) {
  var item = document.querySelector('[data-idx="' + idx + '"]');
  if (!item) return;
  var box = item.querySelector('.chk-box');
  if (!box) return;
  var done = item.classList.toggle('checked');
  // update global counter
  if (typeof APP._thUpdateProgress === 'function') APP._thUpdateProgress();
};
APP._thUpdateProgress = function() {
  var checked = document.querySelectorAll('.chk-section .chk-item.checked').length;
  var total = document.querySelectorAll('.chk-section .chk-item').length || 19;
  var countEl = document.getElementById('globalCount');
  if (countEl) countEl.textContent = checked;
  var subEl = document.getElementById('globalSub');
  if (subEl) subEl.textContent = checked + ' מתוך ' + total + ' סעיפים הושלמו';
  var ring = document.getElementById('globalRingFill');
  if (ring) {
    var r = ring.r && ring.r.baseVal ? ring.r.baseVal.value : 22;
    var circ = 2 * Math.PI * r;
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ * (1 - (checked / total));
  }
  // per-section rings
  document.querySelectorAll('.chk-section').forEach(function(sec) {
    var items = sec.querySelectorAll('.chk-item');
    var ok = sec.querySelectorAll('.chk-item.checked').length;
    var lbl = sec.querySelector('[data-ring-label]');
    if (lbl) lbl.textContent = ok + '/' + items.length;
    sec.classList.toggle('complete', items.length > 0 && ok === items.length);
  });
};
APP.thConfirmPass = function() { APP.thConfirmTestPass && APP.thConfirmTestPass(); };
