# Driver Notifications — Full Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 20 notification bugs, remove double-listener architecture, and redesign all 12 notification types with rich animated toasts and a full-detail history screen.

**Architecture:** Single notification pathway — SW → app.js (Mechanism B only). Mechanism A (index.html) removed entirely. Each alertType gets type-specific chips, CTA, and severity-matched animation.

**Tech Stack:** Vanilla JS, CSS animations, Web Push API, Service Worker, localStorage, Firebase RTDB

**Spec:** `docs/superpowers/specs/2026-05-24-driver-notifications-redesign.md`

---

## Pre-flight: Backup

- [ ] Run `python backup.py` and verify output > 0 bytes before any file edits.

---

## Task 1: Fix sw.js — Remove GAS fetch + add notificationclose

**Files:**
- Modify: `driver/sw.js:106-193`

### Context
`sw.js` currently fetches a GAS endpoint (`driver_pending_notifications`) that doesn't exist, causing every push with an empty payload to show a generic "יש התראה חדשה" toast. The fix: use the push payload directly and never make the GAS roundtrip. Also: dismissing an OS notification currently leaves it in `_pendingNotifs`, so it replays as a toast when the app opens.

- [ ] **Step 1: Open `sw.js` and locate the push event handler (~line 106)**

Find the block that starts:
```javascript
// Empty push — fetch latest pending notification from GAS
if (!notif && self.GAS_URL) {
```
(approximately lines 117–126)

- [ ] **Step 2: Remove the GAS fetch block and replace with a safe fallback**

Replace this entire block:
```javascript
    // Empty push — fetch latest pending notification from GAS
    if (!notif && self.GAS_URL) {
      try {
        const r = await fetch(self.GAS_URL + '?action=driver_pending_notifications', { mode: 'cors' });
        const list = await r.json();
        if (list && list.ok && list.notifications && list.notifications.length) {
          const first = list.notifications[0];
          notif = first.notification || first;
          meta  = first.data || meta;
        }
      } catch(_) {}
    }

    if (!notif) {
      notif = { title: 'עלה — התראה', body: 'יש התראה חדשה. פתח את האפליקציה.' };
    }
```

With:
```javascript
    // No payload or no notif object — skip silently (do not show generic toast)
    // Cloud Run always sends a full payload; empty pushes are FCM keep-alives.
    if (!notif) return;
```

- [ ] **Step 3: Add `notificationclose` listener after the `notificationclick` listener**

After the closing `});` of the `notificationclick` listener (approximately line 219), add:

```javascript
self.addEventListener('notificationclose', e => {
  const tag = e.notification.tag;
  if (tag) {
    _pendingNotifs = _pendingNotifs.filter(n => {
      const nTag = 'aleh-' + ((n.data && n.data.alertType) || 'notif') + '-' + ((n.data && n.data.vehicleId) || '');
      return nTag !== tag;
    });
  }
});
```

- [ ] **Step 4: Update CACHE_NAME version**

Change `CACHE_NAME = 'aleh-driver-v87'` → `CACHE_NAME = 'aleh-driver-v88'`

- [ ] **Step 5: Commit**

```bash
git add driver/sw.js
git commit -m "fix(sw): remove non-existent GAS endpoint, add notificationclose to clear buffer"
```

---

## Task 2: Fix index.html — Remove Mechanism A completely

**Files:**
- Modify: `driver/index.html:1966-2002`

### Context
Lines 1966–2002 in index.html contain three things:
1. Line 1966: `window.showInAppNotification = showInAppNotification;` — exposes Mechanism A
2. Lines 1968–1984: SW message listener (Mechanism A) — fires in parallel with app.js listener → double toast
3. Lines 1986–1996: `_notif` URL param handler — must MOVE to app.js (Task 3)
4. Lines 1998–2001: Badge restore — must MOVE to app.js (Task 3)

- [ ] **Step 1: Find the Mechanism A block in index.html**

Search for: `window.showInAppNotification = showInAppNotification;`
It's at approximately line 1966.

- [ ] **Step 2: Remove lines 1966–2002 entirely**

Delete this entire block (adjust exact lines after reading file):
```javascript
  window.showInAppNotification = showInAppNotification;

  /* ── SW message listener ── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(ev){
      var msg = ev.data || {};
      if (msg.type === 'notification-click' && msg.data) {
        navigateForNotif(msg.data);
      } else if ((msg.type === 'push-foreground' || msg.type === 'push-received') && msg.payload) {
        if (typeof saveNotifToHistory === 'function') saveNotifToHistory(msg.payload);
        playNotifSound();
        showInAppNotification(msg.payload);
      } else if (msg.type === 'pending-notifs' && msg.notifs && msg.notifs.length) {
        msg.notifs.forEach(function(p){ if (typeof saveNotifToHistory === 'function') saveNotifToHistory(p); });
        showInAppNotification(msg.notifs[0]);
      }
    });
    navigator.serviceWorker.ready.then(function(reg){
      if (reg.active) reg.active.postMessage({ type: 'get-pending-notifs' });
    }).catch(function(){});
  }

  /* ── Read notification from URL (app opened via OS notification tap) ── */
  try {
    var _raw = new URLSearchParams(location.search).get('_notif');
    if (_raw) {
      var _nd = JSON.parse(decodeURIComponent(_raw));
      if (!_nd.ts) _nd.ts = (_nd.data && _nd.data.originalTs) || Date.now();
      history.replaceState({}, '', location.pathname + location.hash);
      if (typeof saveNotifToHistory === 'function') saveNotifToHistory(_nd);
      setTimeout(function(){ showInAppNotification(_nd); }, 800);
    }
  } catch(e) {}

  /* ── Restore badge on load ── */
  try {
    var _n = parseInt(localStorage.getItem('driver_notif_unread') || '0', 10) || 0;
    if (typeof _applyBadgeCount === 'function') _applyBadgeCount(_n);
  } catch(e) {}
})();
```

Replace with just the closing of the IIFE:
```javascript
})();
```

- [ ] **Step 3: Verify the IIFE still closes correctly**

The IIFE that wraps the index.html notification code (Mechanism A) should now end cleanly at `})();`.

- [ ] **Step 4: Commit**

```bash
git add driver/index.html
git commit -m "fix(notifications): remove Mechanism A double-listener from index.html"
```

---

## Task 3: Fix app.js — SEVERITY_MAP, saveNotifToHistory fields, SW init

**Files:**
- Modify: `driver/app.js` — three separate locations

### Part A: SEVERITY_MAP additions (line ~4512)

- [ ] **Step 1: Find SEVERITY_MAP and add missing entries**

Find:
```javascript
  garage_approved: 'approved'
};
```

Replace with:
```javascript
  garage_approved:              'approved',
  garage_appointment_set:       'plan',
  garage_appointment_cancelled: 'info'
};
```

### Part B: saveNotifToHistory — add missing fields (line ~544)

- [ ] **Step 2: Find the `newItem` object in `saveNotifToHistory` (~line 544)**

Find the object that ends with:
```javascript
      eventId:             meta.eventId || '',
      ts:                  ts
    };
```

Replace with:
```javascript
      eventId:             meta.eventId || '',
      ts:                  ts,
      appointmentDate:     meta.appointmentDate || '',
      appointmentTime:     meta.appointmentTime || '',
      fuelConsumption:     meta.fuelConsumption != null ? meta.fuelConsumption : '',
      costPerKm:           meta.costPerKm       != null ? meta.costPerKm       : '',
      fleetAverage:        meta.fleetAverage    != null ? meta.fleetAverage    : '',
      threshold:           meta.threshold       != null ? meta.threshold       : '',
      garageInfo:          meta.garageInfo      || '',
      testDate:            meta.testDate        || '',
      daysLeft:            meta.daysLeft        != null ? meta.daysLeft        : '',
      kmLeft:              meta.kmLeft          != null ? meta.kmLeft          : '',
      estKm:               meta.estKm           != null ? meta.estKm           : '',
      nextKm:              meta.nextKm          != null ? meta.nextKm          : '',
      daysSinceUpdate:     meta.daysSinceUpdate != null ? meta.daysSinceUpdate : ''
    };
```

### Part C: SW message listener — add pending-notifs handler + get-pending-notifs request + _notif URL + badge (line ~4672)

- [ ] **Step 3: Find the SW message listener in app.js (~line 4673)**

Find the block:
```javascript
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
```

Replace with:
```javascript
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
    } else if (msg.type === 'pending-notifs' && msg.notifs && msg.notifs.length) {
      msg.notifs.forEach(function(p) { saveNotifToHistory(p); });
      showInAppNotification(msg.notifs[0]);
    }
  });

  // Request any buffered notifications from SW (app just opened)
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
```

- [ ] **Step 4: Commit**

```bash
git add driver/app.js
git commit -m "fix(notifications): SEVERITY_MAP entries, saveNotifToHistory fields, SW init moved from index.html"
```

---

## Task 4: Redesign showInAppNotification — rich animated toast

**Files:**
- Modify: `driver/app.js` — `showInAppNotification` function (~line 4595), `TOAST_DURATION` (~line 4525)

### Context
The current toast shows only icon + title + body + one "פרטים" button. The redesign adds:
- Type-specific chips with actual data values
- Primary + secondary CTAs per alertType
- Auto-dismiss progress bar
- Severity-matched colors (CSS classes)
- Spring entrance animation (450ms), swipe-right to dismiss

- [ ] **Step 1: Update TOAST_DURATION**

Find:
```javascript
var TOAST_DURATION = {
  critical: 8000,
  urgent:   6000,
  plan:     4000,
  info:     3000,
  approved: 5000
};
```

Replace with:
```javascript
var TOAST_DURATION = {
  critical: 10000,
  urgent:   8000,
  plan:     6000,
  info:     6000,
  approved: 0
};
```

(0 = no auto-dismiss; used for approved + requireInteraction types)

- [ ] **Step 2: Add chip-builder helper functions before `showInAppNotification`**

Before the `showInAppNotification` function (around line 4595), insert:

```javascript
function _buildToastChips(alertType, meta) {
  var chips = [];
  var c = function(label, val, unit) {
    if (val === '' || val == null) return;
    chips.push('<div class="nt-chip"><span class="nt-chip-label">' + _escHtml(label) + '</span><span class="nt-chip-val">' + _escHtml(String(val)) + (unit ? ' ' + unit : '') + '</span></div>');
  };
  switch (alertType) {
    case 'overdue':
    case 'urgent':
      c('חריגה', meta.kmLeft, 'ק"מ'); c('מד נוכחי', meta.estKm); c('הבא לטיפול', meta.nextKm); break;
    case 'plan':
      c('נותר', meta.kmLeft, 'ק"מ'); c('הבא ב', meta.nextKm); break;
    case 'km_update':
      c('לפני', meta.daysSinceUpdate, 'ימים'); c('מד אחרון', meta.lastKm); break;
    case 'test_due':
    case 'test_urgent':
      c('תאריך טסט', meta.testDate); c('נותרו', meta.daysLeft, 'ימים'); break;
    case 'garage_approved':
      if (meta.garageInfo) c('מוסך', meta.garageInfo); break;
    case 'garage_rejected':
      if (meta.reasonLabel) c('סיבה', meta.reasonLabel); break;
    case 'garage_appointment_set':
      c('תאריך', meta.appointmentDate); c('שעה', meta.appointmentTime); if (meta.garageInfo) c('מוסך', meta.garageInfo); break;
    case 'garage_appointment_cancelled':
      c('תאריך שבוטל', meta.appointmentDate); if (meta.appointmentTime) c('שעה', meta.appointmentTime); break;
    case 'fuel_high':
      if (meta.fuelConsumption != null) c('צריכה', meta.fuelConsumption, 'ל׳/100ק"מ');
      if (meta.threshold != null) c('סף', meta.threshold, 'ל׳');
      if (meta.fleetAverage != null) c('ממוצע', meta.fleetAverage, 'ל׳'); break;
    case 'fuel_km_high':
      if (meta.costPerKm != null) c('עלות לק"מ', '₪' + meta.costPerKm);
      if (meta.fleetAverage != null) c('ממוצע', '₪' + meta.fleetAverage); break;
  }
  return chips.length ? '<div class="nt-chips">' + chips.join('') + '</div>' : '';
}

function _buildToastActions(alertType, meta, el) {
  var primary = null, secondary = null;
  switch (alertType) {
    case 'overdue':
    case 'urgent':
      primary = { label: 'בקש מוסך', action: function() { navigateForAlertType('overdue', meta); } }; break;
    case 'plan':
    case 'km_update':
      primary = { label: 'צפה בפרטים', action: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'test_due':
    case 'test_urgent':
      primary = { label: alertType === 'test_urgent' ? 'בצע טסט' : 'הגדר תזכורת', action: function() { navigateForAlertType(alertType, meta); } }; break;
    case 'garage_approved':
      primary = { label: 'קבע מועד', action: function() { navigateForAlertType('garage_approved', meta); } };
      secondary = { label: 'מאוחר יותר' }; break;
    case 'garage_rejected':
      primary = { label: 'שלח בקשה חדשה', action: function() { navigateForAlertType('garage_rejected', meta); } }; break;
    case 'garage_appointment_set':
      primary = { label: 'הוסף ליומן', action: function() {
        var d = meta.appointmentDate || ''; var t = meta.appointmentTime || '00:00';
        if (d) { var iso = d.split('/').reverse().join('-') + 'T' + t + ':00';
          var start = new Date(iso); var end = new Date(start.getTime() + 90 * 60000);
          window.open('https://calendar.google.com/calendar/r/eventedit?text=' + encodeURIComponent('תור מוסך') + '&dates=' + start.toISOString().replace(/[-:]/g,'').replace('.000','') + '/' + end.toISOString().replace(/[-:]/g,'').replace('.000',''), '_blank');
        }
      }};
      secondary = { label: 'בסדר' }; break;
    case 'garage_appointment_cancelled':
      primary = { label: 'קבע מועד חדש', action: function() { navigateForAlertType('garage_appointment_cancelled', meta); } };
      secondary = { label: 'לא כרגע' }; break;
    case 'fuel_high':
    case 'fuel_km_high':
      primary = { label: 'דוח צריכה', action: function() { navigateForAlertType(alertType, meta); } }; break;
  }
  if (!primary) primary = { label: 'פרטים', action: function() { navigateForAlertType(alertType, meta); } };
  var html = '<div class="nt-actions">';
  html += '<button class="nt-btn-primary">' + _escHtml(primary.label) + '</button>';
  if (secondary) html += '<button class="nt-btn-secondary">' + _escHtml(secondary.label) + '</button>';
  html += '</div>';
  return { html: html, primary: primary, secondary: secondary };
}
```

- [ ] **Step 3: Rewrite `showInAppNotification`**

Find the entire `showInAppNotification` function (from `function showInAppNotification(payload)` to its closing `}`, approximately lines 4595–4660).

Replace with:

```javascript
function showInAppNotification(payload) {
  var notif     = payload.notification || {};
  var meta      = payload.data || {};
  var alertType = meta.alertType || 'plan';
  var severity  = SEVERITY_MAP[alertType] || 'plan';
  var duration  = TOAST_DURATION[severity] || 6000;

  // Save to history
  saveNotifToHistory(payload);

  // Remove existing toast with exit animation
  if (_activeToast && _activeToast.parentNode) {
    _activeToast.classList.add('nt-leaving');
    var old = _activeToast;
    setTimeout(function() { if (old.parentNode) old.parentNode.removeChild(old); }, 280);
  }

  // Icon by severity
  var icon = SEVERITY_ICONS[severity] || SEVERITY_ICONS.plan;

  // Severity labels
  var SEV_LABEL = { critical: 'קריטי', urgent: 'דחוף', plan: 'תזכורת', info: 'מידע', approved: 'אושר' };

  // Build chips and actions
  var chipsHtml = _buildToastChips(alertType, meta);
  var actionsObj = _buildToastActions(alertType, meta, null);

  // Progress bar (only for auto-dismiss toasts)
  var progressHtml = duration > 0
    ? '<div class="nt-progress"><div class="nt-progress-fill" style="animation-duration:' + (duration / 1000) + 's"></div></div>'
    : '';

  var el = document.createElement('div');
  el.className = 'notif-toast nt-sev-' + severity;
  el.setAttribute('role', 'alert');
  el.innerHTML =
    '<div class="nt-header">' +
      '<div class="nt-icon">' + icon + '</div>' +
      '<div class="nt-meta">' +
        '<div class="nt-title">' + _escHtml(notif.title || 'עלה — התראה') + '</div>' +
        '<div class="nt-time">כרגע</div>' +
      '</div>' +
      '<span class="nt-badge">' + (SEV_LABEL[severity] || severity) + '</span>' +
      '<button class="nt-close" aria-label="סגור">✕</button>' +
    '</div>' +
    (notif.body ? '<div class="nt-body">' + _escHtml(notif.body) + '</div>' : '') +
    chipsHtml +
    actionsObj.html +
    progressHtml;

  // Backdrop
  var backdrop = document.createElement('div');
  backdrop.className = 'notif-backdrop';
  document.body.appendChild(backdrop);
  setTimeout(function() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 550);

  document.body.appendChild(el);
  _activeToast = el;

  // Sound
  _playNotifSound(alertType);

  // Critical pulse ring
  if (severity === 'critical') {
    var ring = document.createElement('div');
    ring.className = 'nt-pulse-ring';
    el.querySelector('.nt-icon').appendChild(ring);
  }

  // Primary CTA
  var primaryBtn = el.querySelector('.nt-btn-primary');
  if (primaryBtn && actionsObj.primary && actionsObj.primary.action) {
    primaryBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dismissToast(el);
      actionsObj.primary.action();
    });
  } else if (primaryBtn) {
    primaryBtn.addEventListener('click', function(e) { e.stopPropagation(); dismissToast(el); });
  }

  // Secondary CTA
  var secondaryBtn = el.querySelector('.nt-btn-secondary');
  if (secondaryBtn) {
    secondaryBtn.addEventListener('click', function(e) { e.stopPropagation(); dismissToast(el); });
  }

  // Close button
  el.querySelector('.nt-close').addEventListener('click', function(e) {
    e.stopPropagation();
    dismissToast(el);
  });

  // Swipe right to dismiss (RTL: swipe right = dismiss, consistent with direction)
  var _swipeStartX = null;
  el.addEventListener('touchstart', function(e) { _swipeStartX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', function(e) {
    if (_swipeStartX === null) return;
    var dx = e.changedTouches[0].clientX - _swipeStartX;
    if (dx > 80) dismissToast(el);
    _swipeStartX = null;
  }, { passive: true });

  // Auto-dismiss
  if (duration > 0) {
    el._dismissTimer = setTimeout(function() { dismissToast(el); }, duration);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add driver/app.js
git commit -m "feat(notifications): rich animated toast with chips, CTAs, progress bar for all 12 types"
```

---

## Task 5: Add CSS for new toast system

**Files:**
- Modify: `driver/app.js` — CSS injection block (find existing notif CSS near top of file or in a `_injectStyles`/`addStyles` call)

### Context
Find where existing notification CSS is defined. In app.js there's typically a block with `.notif-toast`, `.notif-card` styles. Replace/extend it with the new system.

- [ ] **Step 1: Find existing notification CSS block in app.js**

Search for `notif-toast` in app.js to find the CSS string injection. It's likely in a function that builds a `<style>` tag.

- [ ] **Step 2: Add new toast CSS**

In the existing notification styles block (or in a new `<style>` injection), add/replace the `.notif-toast` styles with:

```css
/* ══ Notification Toast — new design ══ */
.notif-toast {
  position: fixed;
  top: 16px;
  inset-inline: 16px;
  z-index: 9999;
  border-radius: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(255,255,255,0.08);
  font-family: 'Noto Sans Hebrew', sans-serif;
  direction: rtl;
  cursor: pointer;
  animation: nt-enter 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
  max-width: 420px;
  margin: 0 auto;
}
.notif-toast.nt-leaving {
  animation: nt-exit 0.28s ease-in both;
}
@keyframes nt-enter {
  from { opacity:0; transform: translateY(-28px) scale(0.93); }
  to   { opacity:1; transform: translateY(0) scale(1); }
}
@keyframes nt-exit {
  from { opacity:1; transform: translateY(0) scale(1); }
  to   { opacity:0; transform: translateY(-16px) scale(0.96); }
}

/* Severity variants */
.nt-sev-critical {
  background: linear-gradient(135deg, rgba(248,81,73,0.14), rgba(248,81,73,0.05));
  border-color: rgba(248,81,73,0.28);
}
.nt-sev-urgent {
  background: linear-gradient(135deg, rgba(227,179,65,0.14), rgba(227,179,65,0.05));
  border-color: rgba(227,179,65,0.28);
}
.nt-sev-plan {
  background: linear-gradient(135deg, rgba(88,166,255,0.14), rgba(88,166,255,0.05));
  border-color: rgba(88,166,255,0.28);
}
.nt-sev-approved {
  background: linear-gradient(135deg, rgba(63,185,80,0.14), rgba(63,185,80,0.05));
  border-color: rgba(63,185,80,0.28);
}
.nt-sev-info {
  background: linear-gradient(135deg, rgba(139,148,158,0.12), rgba(139,148,158,0.04));
  border-color: rgba(139,148,158,0.22);
}

/* Header */
.nt-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.nt-icon {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: rgba(255,255,255,0.07);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  position: relative;
}
.nt-meta { flex: 1; min-width: 0; }
.nt-title {
  font-size: 13px; font-weight: 700; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nt-time { font-size: 10px; color: #8b949e; margin-top: 1px; }
.nt-badge {
  font-size: 9px; font-weight: 700;
  padding: 2px 8px; border-radius: 20px;
  flex-shrink: 0; align-self: flex-start;
  background: rgba(255,255,255,0.08);
  color: #c9d1d9;
  border: 1px solid rgba(255,255,255,0.12);
}
.nt-sev-critical .nt-badge { background: rgba(248,81,73,0.15); color: #f85149; border-color: rgba(248,81,73,0.3); }
.nt-sev-urgent .nt-badge   { background: rgba(227,179,65,0.15); color: #e3b341; border-color: rgba(227,179,65,0.3); }
.nt-sev-plan .nt-badge     { background: rgba(88,166,255,0.15); color: #58a6ff; border-color: rgba(88,166,255,0.3); }
.nt-sev-approved .nt-badge { background: rgba(63,185,80,0.15);  color: #3fb950; border-color: rgba(63,185,80,0.3); }

.nt-close {
  background: none; border: none; color: #8b949e;
  font-size: 15px; cursor: pointer; padding: 0 4px;
  line-height: 1; flex-shrink: 0;
}
.nt-close:hover { color: #e6edf3; }

/* Body */
.nt-body {
  font-size: 12px; color: #c9d1d9; line-height: 1.6;
  margin-bottom: 10px;
}

/* Chips */
.nt-chips {
  display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;
}
.nt-chip {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px; padding: 3px 10px;
  font-size: 10px; display: flex; gap: 4px;
  white-space: nowrap;
}
.nt-chip-label { color: #8b949e; font-weight: 500; }
.nt-chip-val   { color: #e6edf3; font-weight: 700; }

/* Actions */
.nt-actions { display: flex; gap: 8px; }
.nt-btn-primary {
  flex: 1; padding: 8px 12px;
  border-radius: 10px; border: none;
  font-size: 11px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: opacity 150ms;
  color: #0d1117;
}
.nt-btn-secondary {
  padding: 8px 12px; border-radius: 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 11px; font-weight: 700;
  color: #8b949e; cursor: pointer; font-family: inherit;
  transition: opacity 150ms;
}
.nt-btn-primary:hover, .nt-btn-secondary:hover { opacity: 0.85; }
.nt-sev-critical .nt-btn-primary { background: #f85149; }
.nt-sev-urgent   .nt-btn-primary { background: #e3b341; }
.nt-sev-plan     .nt-btn-primary { background: #58a6ff; }
.nt-sev-approved .nt-btn-primary { background: #3fb950; }
.nt-sev-info     .nt-btn-primary { background: rgba(139,148,158,0.2); color: #e6edf3; }

/* Progress bar */
.nt-progress {
  position: absolute; bottom: 0; right: 0; left: 0;
  height: 2px; border-radius: 0 0 16px 16px; overflow: hidden;
}
.nt-progress-fill {
  height: 100%; border-radius: 2px;
  animation: nt-progress linear forwards;
}
@keyframes nt-progress {
  from { width: 100%; }
  to   { width: 0%; }
}
.nt-sev-critical .nt-progress-fill { background: #f85149; }
.nt-sev-urgent   .nt-progress-fill { background: #e3b341; }
.nt-sev-plan     .nt-progress-fill { background: #58a6ff; }
.nt-sev-approved .nt-progress-fill { background: #3fb950; }
.nt-sev-info     .nt-progress-fill { background: #8b949e; }

/* Critical pulse ring */
.nt-pulse-ring {
  position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid rgba(248,81,73,0.5);
  animation: nt-pulse 1.5s ease-out infinite;
  pointer-events: none;
}
@keyframes nt-pulse {
  0%   { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.8); opacity: 0; }
}

/* History card accent bar */
.notif-history-item { position: relative; overflow: hidden; }
.notif-history-item::after {
  content: '';
  position: absolute; right: 0; top: 0; bottom: 0;
  width: 3px; border-radius: 0 14px 14px 0;
}
.notif-critical::after  { background: #f85149; }
.notif-urgent::after    { background: #e3b341; }
.notif-plan::after      { background: #58a6ff; }
.notif-approved::after  { background: #3fb950; }
.notif-info::after      { background: #8b949e; }
```

- [ ] **Step 3: Commit**

```bash
git add driver/app.js
git commit -m "feat(notifications): CSS for rich toast system with severity animations"
```

---

## Task 6: Fix renderNotifHistory — complete data fields + active CTAs

**Files:**
- Modify: `driver/app.js` — `renderNotifHistory` function (~line 2063)

### Context
The history cards currently show: vehicleId, requestNumber, reasonLabel, originalDescription, managerNote, and partial fuel chips. Missing: testDate, daysLeft, appointmentDate/Time, garageInfo, kmLeft, nextKm, estKm, daysSinceUpdate. Also: clicking a card only expands — no active navigation.

- [ ] **Step 1: Find the `metaRows` building block in `renderNotifHistory` (~line 2107)**

Find the block that starts:
```javascript
    if (n.vehicleId)     metaRows.push(['רכב', _escHtml(n.vehicleId)]);
```

Replace the entire `metaRows` building block with:

```javascript
    var metaRows = [];
    if (n.vehicleId) metaRows.push(['רכב', _escHtml(n.vehicleId)]);
    if (n.requestNumber) metaRows.push(['בקשה', '#' + _escHtml(n.requestNumber)]);
    switch (type) {
      case 'overdue': case 'urgent': case 'plan':
        if (n.kmLeft != null && n.kmLeft !== '') metaRows.push(['נותר', _escHtml(String(n.kmLeft)) + ' ק"מ']);
        if (n.nextKm != null && n.nextKm !== '') metaRows.push(['הבא לטיפול', _escHtml(String(n.nextKm))]);
        if (n.estKm  != null && n.estKm  !== '') metaRows.push(['צפי', _escHtml(String(n.estKm))]);
        break;
      case 'km_update':
        if (n.daysSinceUpdate != null && n.daysSinceUpdate !== '') metaRows.push(['לפני', _escHtml(String(n.daysSinceUpdate)) + ' ימים']);
        break;
      case 'test_due': case 'test_urgent':
        if (n.testDate) metaRows.push(['תאריך טסט', _escHtml(n.testDate)]);
        if (n.daysLeft != null && n.daysLeft !== '') metaRows.push(['נותרו', _escHtml(String(n.daysLeft)) + ' ימים']);
        break;
      case 'garage_approved':
        if (n.garageInfo) metaRows.push(['מוסך מאושר', _escHtml(n.garageInfo)]);
        break;
      case 'garage_rejected':
        if (n.reasonLabel) metaRows.push(['סיבה', _escHtml(n.reasonLabel)]);
        break;
      case 'garage_appointment_set': case 'garage_appointment_cancelled':
        if (n.appointmentDate) metaRows.push(['תאריך', _escHtml(n.appointmentDate)]);
        if (n.appointmentTime) metaRows.push(['שעה', _escHtml(n.appointmentTime)]);
        if (n.garageInfo) metaRows.push(['מוסך', _escHtml(n.garageInfo)]);
        break;
      case 'fuel_high':
        if (n.fuelConsumption != null && n.fuelConsumption !== '') metaRows.push(['צריכה', _escHtml(String(n.fuelConsumption)) + ' ל׳/100ק"מ']);
        if (n.threshold != null && n.threshold !== '') metaRows.push(['סף', _escHtml(String(n.threshold)) + ' ל׳']);
        if (n.fleetAverage != null && n.fleetAverage !== '') metaRows.push(['ממוצע ציי', _escHtml(String(n.fleetAverage)) + ' ל׳']);
        break;
      case 'fuel_km_high':
        if (n.costPerKm != null && n.costPerKm !== '') metaRows.push(['עלות לק"מ', '₪' + _escHtml(String(n.costPerKm))]);
        if (n.fleetAverage != null && n.fleetAverage !== '') metaRows.push(['ממוצע ציי', '₪' + _escHtml(String(n.fleetAverage))]);
        break;
    }
    if (n.originalDescription) metaRows.push(['תיאור', _escHtml(n.originalDescription)]);
    if (n.managerNote) metaRows.push(['הערת מנהל', _escHtml(n.managerNote)]);
```

- [ ] **Step 2: Add active CTA per type inside the expand body**

Find this line in the `nh-expand-body` block:
```javascript
        (n.body ? '<div class="nh-body-text">' + _escHtml(n.body) + '</div>' : '') +
```

After this line (before `metaRowsHtml`), insert:

```javascript
      var ctaHtml = '';
      var ctaLabel = '';
      var ctaAttr = '';
      switch (type) {
        case 'overdue': case 'urgent':
          ctaLabel = 'בקש מוסך'; ctaAttr = 'onclick="navigateForAlertType(\'' + type + '\',{});event.stopPropagation()"'; break;
        case 'km_update':
          ctaLabel = 'עדכן ק"מ'; ctaAttr = 'onclick="navigateForAlertType(\'km_update\',{});event.stopPropagation()"'; break;
        case 'garage_approved':
          ctaLabel = 'קבע מועד'; ctaAttr = 'onclick="APP.helpGarage && APP.helpGarage();event.stopPropagation()"'; break;
        case 'fuel_high': case 'fuel_km_high':
          ctaLabel = 'דוח צריכה'; ctaAttr = 'onclick="navigateForAlertType(\'' + type + '\',{});event.stopPropagation()"'; break;
      }
      if (ctaLabel) {
        ctaHtml = '<button class="nh-cta-btn" ' + ctaAttr + '>' + ctaLabel + '</button>';
      }
```

Then add `ctaHtml +` before `metaRowsHtml` in the template string.

- [ ] **Step 3: Add `.nh-cta-btn` to CSS (append to notif styles block)**

```css
.nh-cta-btn {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 10px; padding: 8px 14px;
  border-radius: 8px; border: none;
  font-size: 11px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: opacity 150ms;
  background: rgba(88,166,255,0.12); color: #58a6ff;
}
.nh-cta-btn:hover { opacity: 0.85; }
.notif-critical .nh-cta-btn { background: rgba(248,81,73,0.12); color: #f85149; }
.notif-urgent   .nh-cta-btn { background: rgba(227,179,65,0.12); color: #e3b341; }
.notif-approved .nh-cta-btn { background: rgba(63,185,80,0.12);  color: #3fb950; }
```

- [ ] **Step 4: Commit**

```bash
git add driver/app.js
git commit -m "feat(notifications): history cards show full data fields and active CTAs per type"
```

---

## Task 7: Deploy and verify

**Files:**
- Run: `push_content.py`

- [ ] **Step 1: Run pre-deploy scan for string escape issues**

```powershell
Select-String -Path "driver\app.js" -Pattern "font-family:'" -SimpleMatch
Select-String -Path "driver\app.js" -Pattern 'onclick="[^"]*'"'"  -SimpleMatch
```

If any hits → fix the quote escaping before deploying.

- [ ] **Step 2: Scan for double-listener verification**

```powershell
Select-String -Path "driver\app.js" -Pattern "serviceWorker.addEventListener.*message" -SimpleMatch
Select-String -Path "driver\index.html" -Pattern "serviceWorker.addEventListener.*message" -SimpleMatch
```

Expected: exactly 1 match in app.js, 0 matches in index.html.

- [ ] **Step 3: Deploy**

```bash
cd "C:\Users\Uzi\Downloads\Projects Claude\Fleet manager"
python push_content.py
```

- [ ] **Step 4: Manual smoke test — in-app notification**

Open driver app in Chrome → DevTools → Application → Service Workers → send push with payload:
```json
{"notification":{"title":"⚠️ טיפול באיחור","body":"הרכב עבר מועד הטיפול"},"data":{"alertType":"overdue","kmLeft":1200,"nextKm":86140,"estKm":87340}}
```
Expected: ONE toast appears with chips (נותר: 1200 ק"מ, הבא לטיפול: 86140), CTA "בקש מוסך", progress bar.

- [ ] **Step 5: Manual smoke test — OS notification**

Close driver app → send push → expected: OS notification appears in status bar with correct title and body. Tap → app opens, toast shows.

- [ ] **Step 6: Manual smoke test — dismiss OS notification**

Close app → send push → notification appears → swipe dismiss on OS → reopen app → expected: NO toast replay.

- [ ] **Step 7: Verify history screen**

Go to Alerts screen → expected: each card shows type-specific meta chips, active CTA button where applicable.

- [ ] **Step 8: Final git commit**

```bash
git add -A
git commit -m "deploy: notifications redesign complete — rich toasts, history cards, OS fix, double-listener removed"
```

---

## Task 8: Write QA doc

**Files:**
- Create: `driver/docs/qa/2026-05-24-notifications-redesign-qa.md`

- [ ] **Step 1: Create QA document**

Document:
- Bug: Double toast / double sound on every push → Root: Two SW message listeners (index.html + app.js) → Fix: Removed index.html Mechanism A
- Bug: OS notification not appearing → Root: empty push → GAS fetch for non-existent endpoint → generic fallback → Fix: removed GAS fetch, empty push = no-op
- Bug: Dismissed OS notification replays as toast → Root: notificationclose never cleared _pendingNotifs → Fix: added notificationclose listener
- Bug: garage_appointment_set/cancelled shown with wrong severity → Root: missing from SEVERITY_MAP → Fix: added entries
- Bug: appointmentDate/Time/garageInfo/fuel fields not shown in history → Root: not saved in saveNotifToHistory → Fix: added all 14 missing fields
- Bug: History cards non-navigable → Root: click only expanded, no CTA → Fix: added type-specific CTA buttons

- [ ] **Step 2: Commit QA doc**

```bash
git add driver/docs/qa/
git commit -m "docs: notifications redesign QA document"
```

---

## Completion checklist

- [ ] All 8 tasks completed
- [ ] Zero double-listener (verified by grep)
- [ ] All 12 notification types show correct severity, chips, CTA
- [ ] OS notification appears when app is closed
- [ ] Dismissed OS notification does NOT replay
- [ ] History screen shows full data per type
- [ ] QA doc written
