# Plan: Firebase Realtime DB — סנכרון מלא בין מכשירים

**Goal:** כל נהג שמתחבר עם אותו Google Account רואה מצב זהה בכל מכשיר —
התראות, מצב מוסך, תזכורות, ומחיקות מסתנכרנים real-time.

**Architecture:**
- Firebase Realtime DB = single source of truth לכל נהג
- localStorage = cache מקומי בלבד (מהיר + offline fallback)
- `onValue` listener מסנכרן שינויים מכל מכשיר מיידית
- Firebase Auth משתמש ב-Google idToken הקיים — **אין לוגין נוסף לנהג**

---

## מבנה DB מלא

```
/driverData/{uid}/
  notifications/
    {ts}:            { id, title, body, alertType, vehicleId, eventId,
                       requestNumber, reasonLabel, originalDescription,
                       managerNote, ts }
  deletedTs/
    {ts}: true       ← blacklist — מונע מ-GAS re-pull להחיות התראות שנמחקו
  clearedAt:         1716123456789
  pendingGarage:     { eventId, reason, reasonLabel, description, submittedAt }
  approvedGarage:    { eventId, reasonLabel, requestNumber, managerNote,
                       approvedAt, vehicleId }
  reminders/
    {id}:            { vehicleId, date, label, createdAt }
```

**DB Rules:**
```json
{
  "rules": {
    "driverData": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

---

## ⚠️ שלב מקדים — הגדרת Firebase Console (ידני, ~10 דקות)

1. כנס ל: https://console.firebase.google.com
2. בחר פרויקט קיים **או** לחץ "Add project" → שם: `aleh-fleet`
3. **Build → Realtime Database** → "Create database" → אזור `europe-west1` → Test mode
4. **Build → Authentication** → "Get started" → **Sign-in method** → Enable **Google**
5. **Project Settings** (⚙️) → **General** → "Your apps" → לחץ **</>** → Register `aleh-driver-pwa`
6. **העתק את ה-`firebaseConfig` object** ושלח לי
7. חזור ל-**Realtime Database → Rules** → החלף ב-Rules שלמעלה → **Publish**

---

## Task 1 — Firebase SDK ב-index.html

**File:** `driver/index.html`

- [ ] הוסף 3 script tags של Firebase לפני הסקריפטים הקיימים

```html
<!-- Firebase SDK (compat v9 — עובד ב-vanilla JS ללא bundler) -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
```

---

## Task 2 — Firebase Config + Init ב-app.js

**File:** `driver/app.js` — ממש אחרי `const SESSION_TTL`

- [ ] הוסף `FIREBASE_CONFIG` עם ערכים מה-Console
- [ ] אתחל `_fbApp`, `_fbAuth`, `_fbDb`
- [ ] הוסף `firebaseUid: null` ל-STATE object

```javascript
/* ══ Firebase Config ══ */
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "aleh-fleet.firebaseapp.com",
  databaseURL:       "https://aleh-fleet-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "aleh-fleet",
  storageBucket:     "aleh-fleet.appspot.com",
  messagingSenderId: "111111111111",
  appId:             "1:111111111111:web:aaaa..."
};

/* ══ Firebase Init (מגן מפני double-init) ══ */
var _fbApp, _fbAuth, _fbDb;
(function() {
  try {
    if (typeof firebase === 'undefined') return;
    _fbApp  = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
    _fbAuth = firebase.auth(_fbApp);
    _fbDb   = firebase.database(_fbApp);
  } catch(e) {
    console.warn('[firebase] init failed:', e.message);
  }
})();
```

**ב-STATE object** — הוסף:
```javascript
firebaseUid: null,
```

---

## Task 3 — Firebase Auth

**File:** `driver/app.js`

- [ ] הוסף פונקציה `_fbSignIn` ליד `handleGoogleCredential`
- [ ] קרא ל-`_fbSignIn` ב-`handleGoogleCredential` אחרי קבלת vehicle
- [ ] קרא ל-`_fbSignIn` ב-session restore (auto-login)
- [ ] הוסף `_fbAuth.signOut()` ב-`_sessionExpired`

```javascript
/* ══ Firebase Auth — משתמש ב-Google idToken הקיים, ללא לוגין נוסף ══ */
async function _fbSignIn(googleIdToken) {
  if (!_fbAuth || !googleIdToken || googleIdToken === 'demo_token') return false;
  try {
    var credential = firebase.auth.GoogleAuthProvider.credential(googleIdToken);
    var userCred   = await _fbAuth.signInWithCredential(credential);
    STATE.firebaseUid = userCred.user.uid;
    console.log('[fbAuth] signed in, uid:', STATE.firebaseUid);
    _initFbSync();   // מפעיל את כל ה-listeners
    return true;
  } catch(e) {
    console.warn('[fbAuth] failed (localStorage-only mode):', e.message);
    return false;
  }
}
```

**ב-`handleGoogleCredential`** — אחרי `STATE.vehicle = result.vehicle;`:
```javascript
_fbSignIn(STATE.idToken).catch(function() {}); // non-blocking
```

**ב-session restore** — אחרי שחזרת STATE:
```javascript
if (stored.token && stored.token !== 'demo_token') {
  _fbSignIn(stored.token).catch(function() {});
}
```

**ב-`_sessionExpired`** — בתחילת הפונקציה:
```javascript
try { if (_fbAuth) _fbAuth.signOut(); } catch(_e) {}
STATE.firebaseUid = null;
```

---

## Task 4 — Firebase DB Helpers (ליבת הסנכרון)

**File:** `driver/app.js` — הוסף ליד פונקציות notification history

- [ ] `_fbRef(path)` — reference לפי path תחת `/driverData/{uid}/`
- [ ] `_fbSaveNotif(item)` — שמור התראה בודדת
- [ ] `_fbDeleteNotif(id)` — מחק התראה + הוסף ל-deletedTs blacklist
- [ ] `_fbClearAllNotifs(clearedAt)` — נקה הכל + שמור clearedAt
- [ ] `_fbSetPendingGarage(data)` — שמור/עדכן בקשת מוסך
- [ ] `_fbClearPendingGarage()` — מחק בקשת מוסך (בוטלה / אושרה)
- [ ] `_fbSetApprovedGarage(data)` — שמור פרטי מוסך מאושר
- [ ] `_fbClearApprovedGarage()` — מחק פרטי מוסך מאושר
- [ ] `_fbSaveReminder(reminder)` — שמור תזכורת
- [ ] `_fbDeleteReminder(id)` — מחק תזכורת
- [ ] `_initFbSync()` — מפעיל את כל ה-listeners

```javascript
/* ══════════════════════════════════════════════════════════════
   Firebase Sync — כל הפונקציות לסנכרון cross-device
══════════════════════════════════════════════════════════════ */

/** מחזיר DB reference לנתיב תחת /driverData/{uid}/... */
function _fbRef(path) {
  if (!_fbDb || !STATE.firebaseUid) return null;
  return _fbDb.ref('driverData/' + STATE.firebaseUid + (path ? '/' + path : ''));
}

/* ── Notifications ── */

/** שומר התראה בודדת. key = ts — overwrite בטוח אם אותה התראה מגיעה שוב. */
function _fbSaveNotif(item) {
  var ref = _fbRef('notifications/' + String(item.ts));
  if (!ref || !item || !item.ts) return;
  ref.set(item).catch(function(e) { console.warn('[fbSync] saveNotif:', e.message); });
}

/**
 * מוחק התראה מ-Firebase ומוסיף את ה-ts ל-deletedTs blacklist.
 * הblacklist מונע מ-GAS re-pull להחיות התראות שנמחקו במכשיר אחר.
 */
function _fbDeleteNotif(id) {
  var notifRef   = _fbRef('notifications/' + String(id));
  var deletedRef = _fbRef('deletedTs/' + String(id));
  if (!notifRef) return;
  notifRef.remove().catch(function(e) { console.warn('[fbSync] deleteNotif:', e.message); });
  if (deletedRef) deletedRef.set(true).catch(function() {});
}

/** נקה כל ההתראות + שמור clearedAt — מתפשט לכל המכשירים דרך listener. */
function _fbClearAllNotifs(clearedAt) {
  var notifRef   = _fbRef('notifications');
  var clearedRef = _fbRef('clearedAt');
  if (!notifRef) return;
  notifRef.remove().catch(function() {});
  if (clearedRef) clearedRef.set(clearedAt || Date.now()).catch(function() {});
}

/* ── Garage State ── */

/** שומר/מעדכן בקשת מוסך פתוחה — מופיע בכל מכשירי הנהג. */
function _fbSetPendingGarage(data) {
  var ref = _fbRef('pendingGarage');
  if (!ref) return;
  ref.set(data).catch(function(e) { console.warn('[fbSync] setPendingGarage:', e.message); });
}

/** מוחק בקשת מוסך (בוטלה / אושרה / נדחתה). */
function _fbClearPendingGarage() {
  var ref = _fbRef('pendingGarage');
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] clearPendingGarage:', e.message); });
}

/** שומר פרטי מוסך מאושר — כולל כתובת, שעות, הערת מנהל. */
function _fbSetApprovedGarage(data) {
  var ref = _fbRef('approvedGarage');
  if (!ref) return;
  ref.set(data).catch(function(e) { console.warn('[fbSync] setApprovedGarage:', e.message); });
}

/** מוחק פרטי מוסך מאושר (לאחר שהנהג סיים עם המוסך). */
function _fbClearApprovedGarage() {
  var ref = _fbRef('approvedGarage');
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] clearApprovedGarage:', e.message); });
}

/* ── Reminders ── */

/** שומר תזכורת בודדת. id = createdAt timestamp. */
function _fbSaveReminder(reminder) {
  var id  = reminder.id || reminder.createdAt || Date.now();
  var ref = _fbRef('reminders/' + String(id));
  if (!ref) return;
  ref.set(reminder).catch(function(e) { console.warn('[fbSync] saveReminder:', e.message); });
}

/** מוחק תזכורת בודדת. */
function _fbDeleteReminder(id) {
  var ref = _fbRef('reminders/' + String(id));
  if (!ref) return;
  ref.remove().catch(function(e) { console.warn('[fbSync] deleteReminder:', e.message); });
}

/* ── Master Sync Init ── */

/**
 * מפעיל את כל ה-onValue listeners אחרי Firebase Auth.
 * נקרא פעם אחת מ-_fbSignIn.
 * כל שינוי ב-Firebase (מכל מכשיר) מגיע כאן ומעדכן את localStorage + UI.
 */
function _initFbSync() {
  _initFbNotifSync();
  _initFbGarageSync();
  _initFbReminderSync();
}

/* ── Listener: Notifications ── */
function _initFbNotifSync() {
  var ref = _fbRef('notifications');
  if (!ref) return;

  ref.on('value', function(snap) {
    try {
      var data = snap.val() || {};

      // בנה רשימה ממיין מהחדש לישן
      var items = Object.keys(data).map(function(k) { return data[k]; })
        .filter(function(n) { return n && n.ts; })
        .sort(function(a, b) { return b.ts - a.ts; })
        .slice(0, 30);

      // שמור ב-localStorage
      localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(items));

      // badge
      var clearedAt = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
      var unread = items.filter(function(n) { return n.ts > clearedAt; }).length;
      _applyBadgeCount(unread);

      // רנדר מחדש אם המשתמש בתצוגת התראות
      if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') {
        renderNotifHistory();
      }
    } catch(e) { console.warn('[fbSync] notif onValue:', e.message); }
  }, function(err) {
    console.warn('[fbSync] notif listener error:', err.message);
  });

  // clearedAt listener — ניקוי הכל ממכשיר אחר
  var clearedRef = _fbRef('clearedAt');
  if (clearedRef) {
    clearedRef.on('value', function(snap) {
      var remoteCleared = snap.val();
      if (!remoteCleared) return;
      var localCleared = parseInt(localStorage.getItem('driver_notif_cleared_at') || '0', 10);
      if (remoteCleared > localCleared) {
        localStorage.setItem('driver_notif_cleared_at', String(remoteCleared));
        localStorage.setItem('driver_notif_unread', '0');
        localStorage.setItem(_NOTIF_HISTORY_KEY, '[]');
        _applyBadgeCount(0);
        if (typeof STATE !== 'undefined' && STATE.currentScreen === 'alerts') renderNotifHistory();
      }
    });
  }

  // deletedTs listener — סנכרון blacklist מחיקות
  var deletedRef = _fbRef('deletedTs');
  if (deletedRef) {
    deletedRef.on('value', function(snap) {
      var data = snap.val() || {};
      var tsList = Object.keys(data).map(Number).filter(Boolean);
      if (tsList.length) {
        localStorage.setItem('driver_notif_deleted_ts', JSON.stringify(tsList));
      }
    });
  }
}

/* ── Listener: Garage State ── */
function _initFbGarageSync() {
  // Pending garage
  var pendingRef = _fbRef('pendingGarage');
  if (pendingRef) {
    pendingRef.on('value', function(snap) {
      try {
        var data = snap.val();
        if (data) {
          localStorage.setItem('pendingGarageRequest', JSON.stringify(data));
        } else {
          localStorage.removeItem('pendingGarageRequest');
        }
        // עדכן UI אם מסך הגראז' פתוח
        if (typeof APP !== 'undefined' && typeof APP._garageRefreshUI === 'function') {
          APP._garageRefreshUI();
        }
      } catch(e) { console.warn('[fbSync] pendingGarage onValue:', e.message); }
    });
  }

  // Approved garage
  var approvedRef = _fbRef('approvedGarage');
  if (approvedRef) {
    approvedRef.on('value', function(snap) {
      try {
        var data = snap.val();
        if (data) {
          localStorage.setItem('approvedGarageRequest', JSON.stringify(data));
        } else {
          localStorage.removeItem('approvedGarageRequest');
        }
      } catch(e) { console.warn('[fbSync] approvedGarage onValue:', e.message); }
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

      // עדכן UI אם מסך תזכורות פתוח
      if (typeof APP !== 'undefined' && typeof APP._remindersRefreshUI === 'function') {
        APP._remindersRefreshUI();
      }
    } catch(e) { console.warn('[fbSync] reminders onValue:', e.message); }
  });
}
```

---

## Task 5 — עדכן `saveNotifToHistory`

**File:** `driver/app.js` — שורה ~137

- [ ] הוצא את ה-`newItem` למשתנה נפרד
- [ ] הוסף `_fbSaveNotif(newItem)` אחרי השמירה ב-localStorage

```javascript
// הוצא את ה-object למשתנה:
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
```

---

## Task 6 — עדכן `deleteNotifById`

**File:** `driver/app.js` — שורה ~246

- [ ] החלף `_fbDelete(id)` ב-`_fbDeleteNotif(id)` (כולל blacklist)

```javascript
function deleteNotifById(id) {
  try {
    var ts = parseInt(id, 10);
    var list = getNotifHistory().filter(function(n) { return String(n.id) !== String(id); });
    localStorage.setItem(_NOTIF_HISTORY_KEY, JSON.stringify(list));
    if (ts) {
      var del = JSON.parse(localStorage.getItem('driver_notif_deleted_ts') || '[]');
      if (del.indexOf(ts) === -1) del.push(ts);
      if (del.length > 100) del = del.slice(-100);
      localStorage.setItem('driver_notif_deleted_ts', JSON.stringify(del));
    }
    _fbDeleteNotif(id); // ← Firebase sync — מחיקה + blacklist לכל המכשירים
  } catch(e) {}
}
```

---

## Task 7 — עדכן `clearNotifHistory`

**File:** `driver/app.js` — פונקציה `clearNotifHistory`

- [ ] הוסף `_fbClearAllNotifs(now)` לפני סגירת הפונקציה

```javascript
// אחרי:
localStorage.setItem('driver_notif_cleared_at', String(now));
localStorage.setItem(_NOTIF_HISTORY_KEY, '[]');

// הוסף:
_fbClearAllNotifs(now); // ← Firebase sync — ניקוי לכל המכשירים
```

---

## Task 8 — עדכן שמירת `pendingGarageRequest`

**File:** `driver/app.js` — `_garageSubmitRequest` (שורה ~2846)

- [ ] מצא את 2 מקומות שמירת pendingGarageRequest (הצלחה + duplicate)
- [ ] הוסף `_fbSetPendingGarage(data)` בכל אחד מיד אחרי localStorage.setItem

```javascript
// דוגמה לכל אחד משני המקומות:
var pendingData = {
  eventId:     eventId,
  reason:      ctx.reasonId,
  reasonLabel: ctx.reasonLabel,
  description: ctx.description || '',
  submittedAt: Date.now()
};
localStorage.setItem('pendingGarageRequest', JSON.stringify(pendingData));
_fbSetPendingGarage(pendingData); // ← Firebase sync
```

---

## Task 9 — עדכן ניקוי `pendingGarageRequest`

**File:** `driver/app.js` — `_garageClearPending` + כל מקום שמוחק pendingGarageRequest

- [ ] מצא את כל `localStorage.removeItem('pendingGarageRequest')`
- [ ] הוסף `_fbClearPendingGarage()` אחרי כל אחד

```javascript
// בכל מקום שמוחק pending:
localStorage.removeItem('pendingGarageRequest');
_fbClearPendingGarage(); // ← Firebase sync
```

---

## Task 10 — עדכן `approvedGarageRequest`

**File:** `driver/app.js` — `saveNotifToHistory` + `_garageShowApproved` וכל מקום שכותב approvedGarageRequest

- [ ] מצא את כל `localStorage.setItem('approvedGarageRequest', ...)`
- [ ] הוסף `_fbSetApprovedGarage(data)` אחרי כל אחד
- [ ] מצא את `localStorage.removeItem('approvedGarageRequest')`
- [ ] הוסף `_fbClearApprovedGarage()` אחריו

```javascript
// בכל מקום שכותב:
var approvedData = { eventId, reasonLabel, requestNumber, managerNote, approvedAt: ts, vehicleId };
localStorage.setItem('approvedGarageRequest', JSON.stringify(approvedData));
_fbSetApprovedGarage(approvedData); // ← Firebase sync

// בכל מקום שמוחק:
localStorage.removeItem('approvedGarageRequest');
_fbClearApprovedGarage(); // ← Firebase sync
```

---

## Task 11 — עדכן `driver_garage_reminders`

**File:** `driver/app.js` — פונקציות ניהול תזכורות (שורה ~3285-3336)

- [ ] מצא את `localStorage.setItem('driver_garage_reminders', ...)` — שמירת תזכורת חדשה
- [ ] הוסף `_fbSaveReminder(reminder)` אחרי כל הוספה
- [ ] מצא מחיקת תזכורת (אחרי תפוגה / ביטול ידני)
- [ ] הוסף `_fbDeleteReminder(id)` אחרי כל מחיקה

```javascript
// שמירת תזכורת חדשה:
reminders.push(newReminder);
localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
_fbSaveReminder(newReminder); // ← Firebase sync

// מחיקת תזכורת שתפגה:
reminders.splice(idx, 1);
localStorage.setItem('driver_garage_reminders', JSON.stringify(reminders));
_fbDeleteReminder(expiredReminder.id || expiredReminder.createdAt); // ← Firebase sync
```

---

## Task 12 — בדיקת קוד לפני push

### 12A — בדיקת console בטעינה ראשונה
- [ ] פתח DevTools → Console
- [ ] וודא שמופיע: `[firebase] init` ללא שגיאות
- [ ] וודא שמופיע: `[fbAuth] signed in, uid: ...` אחרי לוגין
- [ ] וודא שלא מופיע: `[firebase] init failed` / `permission_denied` / `PERMISSION_DENIED`
- [ ] וודא שלא מופיע שום שגיאת `ReferenceError` / `TypeError` על `_fbRef`, `_fbSave*` וכו'

### 12B — בדיקת Firebase Console במקביל
- [ ] פתח Firebase Console → Realtime Database → Data
- [ ] בצע לוגין ב-PWA → וודא שנוצר node: `/driverData/{uid}/`
- [ ] שלח התראת בדיקה → וודא שמופיעה תחת `notifications/{ts}`
- [ ] מחק התראה → וודא שנעלמת מ-DB ונוצרה תחת `deletedTs/{ts}: true`
- [ ] לחץ "נקה הכל" → וודא שנוצר `clearedAt: {timestamp}` ו-`notifications` ריק

### 12C — בדיקת Regression (פונקציונליות קיימת לא נשברה)
- [ ] לוגין רגיל עובד (Google Auth)
- [ ] Session restore עובד (רענון עמוד ללא לוגין מחדש)
- [ ] Demo mode עובד — אין ניסיון Firebase, אין שגיאות console
- [ ] התראות נשמרות ב-localStorage גם כשFirebase מחובר
- [ ] badge count מתעדכן נכון
- [ ] מסך התראות מרנדר נכון
- [ ] מחיקת התראה בודדת עובדת
- [ ] בקשת מוסך — שליחה, סטטוס המתנה, וקבלת אישור — זרימה שלמה עובדת

### 12D — בדיקת סנכרון בין מכשירים (פתח שני טאבים / שני מכשירים)

| תרחיש | פעולה ב-A | ציפייה ב-B | ✓ |
|--------|-----------|-----------|---|
| התראה חדשה | קבל push | מופיעה תוך 2 שניות | |
| מחיקת התראה | מחק | נעלמת תוך 2 שניות | |
| נקה הכל | לחץ "נקה" | רשימה ריקה | |
| בקשת מוסך | שלח | מסך "בהמתנה" מופיע | |
| ביטול בקשה | בטל | מסך "בהמתנה" נעלם | |
| אישור מוסך | מנהל אישר | פרטי מוסך מופיעים | |
| תזכורת חדשה | קבע | מופיעה | |
| מחיקת תזכורת | מחק | נעלמת | |

### 12E — בדיקת Offline
- [ ] נתק רשת (DevTools → Network → Offline)
- [ ] וודא שה-PWA עובד — קורא מ-localStorage
- [ ] וודא שאין crash / שגיאות קריטיות בconsole
- [ ] חבר רשת — וודא שFirebase מתעדכן ב-background (בדוק ב-Console)

### 12F — בדיקת DB Rules
- [ ] נסה לגשת ל-`/driverData/{uid-אחר}/` מ-DevTools console:
  ```javascript
  firebase.database().ref('driverData/FAKE_UID').once('value')
    .then(s => console.log('FAIL - got data:', s.val()))
    .catch(e => console.log('PASS - blocked:', e.message));
  ```
  **ציפייה:** `PASS - blocked: PERMISSION_DENIED`

---

## Task 13 — git commit + push

- [ ] `git add driver/app.js driver/index.html`
- [ ] `git commit -m "feat: Firebase Realtime DB — full cross-device sync (notifs, garage, reminders)"`
- [ ] `git push origin main`
