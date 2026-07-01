// SW build: 2026-07-01T20:41:36Z // v259
/* ════════════════════════════════════════════════════════════════════
   Main service worker for the עלה driver PWA.
   Firebase SDK removed — uses direct W3C Web Push API.
   Push events: handles both payload-bearing and empty pushes
   (empty → fetch latest pending notification from GAS).
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   Cache / offline
   ════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'aleh-driver-v259';

// Pending notifications buffer — survives until client collects them (max 60s)
let _pendingNotifs = [];

/* קבצים שנשמרים לoffline — fonts בלבד (לא משתנים) */
const PRECACHE = [
  'version.json',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  /* cross-origin (GAS, Google APIs, gstatic firebase) — תמיד רשת, ללא התערבות */
  if (!url.startsWith(self.location.origin)) return;

  /* FCM scope endpoint — חייב להיות תמיד רשת טרייה */
  if (url.includes('firebase-cloud-messaging-push-scope')) return;

  /* index.html + app.js — network-first: תמיד מנסה רשת, fallback לcache */
  const isAppFile = url.endsWith('/') || url.includes('index.html') || url.includes('app.js') || url.includes('manifest.json');
  if (isAppFile) {
    e.respondWith(
      fetch(new Request(e.request.url, { cache: 'no-cache' }))
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  /* שאר קבצים (icons וכו') — cache-first */
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => {}))
  );
});

/* ════════════════════════════════════════════════════════════════════
   Web Push (raw push event — when payload arrives without FCM SDK route)
   ════════════════════════════════════════════════════════════════════ */

self.GAS_URL = self.GAS_URL || '';

self.addEventListener('message', e => {
  if (!e.data) return;
  // Activate a freshly-installed SW right away (sent by the page on statechange)
  if (e.data.type === 'skip-waiting') {
    self.skipWaiting();
    return;
  }
  if (e.data.type === 'set-gas-url' && typeof e.data.url === 'string') {
    self.GAS_URL = e.data.url;
  }
  // Client asks for the active cache/build version (for footer display)
  if (e.data.type === 'GET_VERSION' && e.ports && e.ports[0]) {
    e.ports[0].postMessage(CACHE_NAME);
    return;
  }
  // Client asks for buffered notifications (on app open)
  if (e.data.type === 'get-pending-notifs' && e.source) {
    e.source.postMessage({ type: 'pending-notifs', notifs: _pendingNotifs });
    _pendingNotifs = [];
  }
  // Client cleared notification history — drop buffer so it can't replay
  if (e.data.type === 'clear-pending-notifs') {
    _pendingNotifs = [];
  }
});

const BADGE_ICON = './icons/notif-badge.png';

const TYPE_CONFIG = {
  overdue:                      { vibrate: [400,100,400,100,400], requireInteraction: true  },
  urgent:                       { vibrate: [300,100,300],         requireInteraction: false },
  plan:                         { vibrate: [200],                 requireInteraction: false },
  km_update:                    { vibrate: [150],                 requireInteraction: false },
  test_due:                     { vibrate: [300,100,300],         requireInteraction: false },
  test_urgent:                  { vibrate: [400,100,400,100,400], requireInteraction: true  },
  garage_approved:              { vibrate: [200,100,200],         requireInteraction: true  },
  garage_rejected:              { vibrate: [400,100,400],         requireInteraction: true  },
  garage_appointment_set:       { vibrate: [200,100,200,100,200], requireInteraction: true  },
  garage_appointment_cancelled: { vibrate: [300,100,300],         requireInteraction: false },
  fuel_high:                    { vibrate: [300,100,300],         requireInteraction: false },
  fuel_km_high:                 { vibrate: [150],                 requireInteraction: false }
};

// Per-type OS notification visuals. Each alert category maps to a coloured icon
// (96x96, shown left of the title) + a wide banner image (shown below the body on
// Chrome for Android, the biggest visual upgrade available to PWAs) + a
// type-specific primary action label.
// approved=green, danger=red, reminder=blue, warning=orange, info=purple.
const NOTIF_VISUAL = {
  garage_approved:              { cat: 'approved', action: 'קבע תור'       },
  garage_rejected:              { cat: 'danger',   action: 'שלח בקשה חדשה' },
  garage_appointment_set:       { cat: 'reminder', action: 'הוסף ליומן'    },
  garage_appointment_cancelled: { cat: 'danger',   action: 'קבע תור חדש'   },
  plan:                         { cat: 'approved', action: 'תכנן טיפול'     },
  overdue:                      { cat: 'danger',   action: 'תאם מוסך עכשיו' },
  urgent:                       { cat: 'warning',  action: 'תאם מוסך'       },
  km_update:                    { cat: 'reminder', action: 'עדכן ק"מ'       },
  test_due:                     { cat: 'reminder', action: 'פרטי טסט'       },
  test_urgent:                  { cat: 'danger',   action: 'תאם טסט דחוף'   },
  fuel_high:                    { cat: 'warning',  action: 'צפה בדוח'       },
  fuel_km_high:                 { cat: 'warning',  action: 'צפה בדוח'       }
};
function notifVisual(alertType) {
  const v = NOTIF_VISUAL[alertType] || { cat: 'info', action: 'פתח עכשיו' };
  return {
    icon:   './icons/notif-' + v.cat + '.png',
    image:  './icons/notif-banner-' + v.cat + '.png',
    action: v.action
  };
}

/* ════════════════════════════════════════════════════════════════════
   OS notification content builder — per-type title + body with real data
   ════════════════════════════════════════════════════════════════════ */

function _buildOsNotifContent(type, m, fallback) {
  var id  = m.vehicleId ? 'רכב ' + m.vehicleId : '';
  var dash = id ? ' — ' + id : '';

  var builders = {
    overdue: function() {
      return {
        title: 'טיפול דחוף' + dash,
        body:  'חריגה של ' + (m.kmLeft || '?') + ' ק"מ מהמועד. יש לתאם מוסך מיידית.'
      };
    },
    urgent: function() {
      return {
        title: 'טיפול בקרוב' + dash,
        body:  'נותרו ' + (m.kmLeft || '?') + ' ק"מ עד הטיפול הבא.'
      };
    },
    plan: function() {
      return {
        title: 'תכנן טיפול' + dash,
        body:  'נותרו ' + (m.kmLeft || '?') + ' ק"מ. כדאי להתחיל לתכנן.'
      };
    },
    km_update: function() {
      return {
        title: 'עדכון קילומטרז׳ נדרש' + dash,
        body:  'לא עודכן ' + (m.daysSinceUpdate || '?') + ' ימים. ק"מ אחרון: ' + (m.lastKm || '?') + '.'
      };
    },
    test_due: function() {
      return {
        title: 'טסט רכב בקרוב' + dash,
        body:  'הטסט לפני ' + (m.testDate || '?') + '. נותרו ' + (m.daysLeft || '?') + ' ימים.'
      };
    },
    test_urgent: function() {
      return {
        title: 'טסט רכב — דחוף!' + dash,
        body:  'הטסט חייב להתבצע לפני ' + (m.testDate || '?') + '. נותרו ' + (m.daysLeft || '?') + ' ימים בלבד.'
      };
    },
    garage_approved: function() {
      var garage = m.garageInfo ? ' ב' + m.garageInfo : '';
      return {
        title: 'בקשת מוסך אושרה',
        body:  (id || 'הבקשה') + ' אושרה. ניתן לקבוע תור' + garage + '.'
      };
    },
    garage_rejected: function() {
      return {
        title: 'בקשת מוסך נדחתה',
        body:  (id ? id + ' — ' : '') + 'ניתן לשלוח בקשה חדשה.'
      };
    },
    garage_appointment_set: function() {
      var when = m.appointmentDate || '';
      var time = m.appointmentTime ? ' · ' + m.appointmentTime : '';
      var garage = m.garageInfo ? ' · ' + m.garageInfo : '';
      return {
        title: 'תור מוסך נקבע' + (when ? ' — ' + when : ''),
        body:  (id || '') + time + garage + '.'
      };
    },
    garage_appointment_cancelled: function() {
      var when = m.appointmentDate || '';
      return {
        title: 'תור מוסך בוטל' + (when ? ' — ' + when : ''),
        body:  (id ? id + ' — ' : '') + 'ניתן לקבוע מועד חדש.'
      };
    },
    fuel_high: function() {
      var pct = (m.fuelConsumption && m.fleetAverage)
        ? ' (' + Math.round((m.fuelConsumption / m.fleetAverage - 1) * 100) + '% מעל הממוצע)'
        : '';
      return {
        title: 'צריכת דלק חריגה' + dash,
        body:  (m.fuelConsumption || '?') + ' ל׳/100ק"מ' + pct + '.'
      };
    },
    fuel_km_high: function() {
      return {
        title: 'עלות דלק חריגה' + dash,
        body:  (m.costPerKm || '?') + ' ₪/ק"מ — ממוצע ציי: ' + (m.fleetAverage || '?') + ' ₪/ק"מ.'
      };
    }
  };

  var builder = builders[type];
  if (builder) {
    var built = builder();
    return {
      title: built.title || fallback.title || 'עלה — התראה',
      body:  built.body  || fallback.body  || 'פתח את האפליקציה לפרטים'
    };
  }
  return {
    title: fallback.title || 'עלה — התראה',
    body:  fallback.body  || 'פתח את האפליקציה לפרטים'
  };
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let payload = null;
    try { if (e.data) payload = e.data.json(); } catch(_) {}

    let notif = null, meta = {};
    if (payload) {
      notif = payload.notification || (payload.title ? payload : null);
      meta  = payload.data || {};
    }

    // No payload — silent no-op (empty pushes are FCM keep-alives, not real notifications)
    if (!notif) return;

    const alertType = meta.alertType || '';
    const cfg = TYPE_CONFIG[alertType] || { vibrate: [200], requireInteraction: false };

    // Buffer the notification so app can collect it on next open
    const relayPayload = {
      notification: { title: notif.title || 'עלה', body: notif.body || '' },
      data: meta,
      ts: Date.now()
    };
    _pendingNotifs.push(relayPayload);
    setTimeout(() => {
      _pendingNotifs = _pendingNotifs.filter(n => Date.now() - n.ts < 300000);
    }, 300000);

    // Relay to any currently open driver clients
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
    for (const c of openClients) {
      c.postMessage({ type: 'push-foreground', payload: relayPayload });
    }

    // App is in foreground (focused) — in-app card handles it, skip OS notification
    // When app is in BACKGROUND (open but not focused), show OS notification too so
    // the pull-down panel notifies the user properly.
    const focusedClients = openClients.filter(c => c.focused);
    if (focusedClients.length > 0) return;

    // Build OS-optimised title + body with relevant data per alert type
    const osContent = _buildOsNotifContent(alertType, meta, notif);
    const visual = notifVisual(alertType);

    return self.registration.showNotification(osContent.title, {
      body:  osContent.body,
      icon:  visual.icon,
      image: visual.image,
      badge: BADGE_ICON,
      dir:   'rtl',
      lang:  'he',
      tag:   'aleh-' + (alertType || 'notif') + '-' + (meta.vehicleId || ''),
      renotify:            true,
      vibrate:             cfg.vibrate,
      requireInteraction:  cfg.requireInteraction,
      silent:              false,
      timestamp:           Date.now(),
      data: Object.assign({}, meta, { _pushTs: relayPayload.ts }),
      actions: [
        { action: 'open',    title: visual.action },
        { action: 'dismiss', title: 'סגור' }
      ]
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const meta = e.notification.data || {};
  // Preserve original push timestamp so clearedAt guard in saveNotifToHistory works correctly.
  // _pushTs was embedded in the notification data at showNotification time.
  const fullPayload = {
    notification: { title: e.notification.title || 'עלה', body: e.notification.body || '' },
    data: meta,
    ts: meta._pushTs || Date.now()
  };
  // Encode notification in URL so app always receives it — reliable even after SW restart
  const notifParam = encodeURIComponent(JSON.stringify(fullPayload));
  const url = './index.html?_notif=' + notifParam;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/driver/') && 'focus' in c) {
          // App already open — postMessage directly
          c.postMessage({ type: 'push-received', payload: fullPayload });
          c.postMessage({ type: 'notification-click', data: meta });
          return c.focus();
        }
      }
      // App closed — open with notif data in URL
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('notificationclose', e => {
  const tag = e.notification.tag;
  if (tag) {
    _pendingNotifs = _pendingNotifs.filter(n => {
      if (!n.data) return true;
      const nTag = 'aleh-' + (n.data.alertType || 'notif') + '-' + (n.data.vehicleId || '');
      return nTag !== tag;
    });
  }
});
