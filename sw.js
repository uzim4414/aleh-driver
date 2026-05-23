// SW build: 2026-05-21T14:00:00Z // v86
/* ════════════════════════════════════════════════════════════════════
   Main service worker for the עלה driver PWA.
   Firebase SDK removed — uses direct W3C Web Push API.
   Push events: handles both payload-bearing and empty pushes
   (empty → fetch latest pending notification from GAS).
   ════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════
   Cache / offline
   ════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'aleh-driver-v88';

// Pending notifications buffer — survives until client collects them (max 60s)
let _pendingNotifs = [];

/* קבצים שנשמרים לoffline — fonts בלבד (לא משתנים) */
const PRECACHE = [
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
  if (e.data.type === 'set-gas-url' && typeof e.data.url === 'string') {
    self.GAS_URL = e.data.url;
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

const TYPE_CONFIG = {
  overdue:     { vibrate: [400,100,400,100,400], requireInteraction: true,  badge: './icons/badge-red.png' },
  urgent:      { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
  plan:        { vibrate: [200],                 requireInteraction: false, badge: './icons/badge-blue.png' },
  km_update:   { vibrate: [150],                 requireInteraction: false, badge: './icons/badge-violet.png' },
  test_due:        { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
  test_urgent:     { vibrate: [400,100,400,100,400], requireInteraction: true,  badge: './icons/badge-red.png' },
  garage_approved:         { vibrate: [200,100,200],             requireInteraction: true,  badge: './icons/badge-blue.png' },
  garage_rejected:         { vibrate: [400,100,400],             requireInteraction: true,  badge: './icons/badge-red.png' },
  garage_appointment_set:  { vibrate: [200,100,200,100,200],     requireInteraction: true,  badge: './icons/badge-blue.png' },
  garage_appointment_cancelled: { vibrate: [300,100,300],            requireInteraction: false, badge: './icons/badge-blue.png' },
  fuel_high:       { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
  fuel_km_high:    { vibrate: [150],                 requireInteraction: false, badge: './icons/badge-violet.png' }
};

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

    const LABEL = {
      overdue:         '🔴 טיפול באיחור',
      urgent:          '🟠 טיפול דחוף',
      plan:            '🔵 תכנית טיפולים',
      km_update:       '🟣 עדכון קילומטרז\'',
      test_due:        '🟠 טסט בקרוב',
      test_urgent:     '🔴 טסט דחוף',
      garage_approved:        '✅ תור מוסך אושר',
      garage_rejected:        '❌ תור מוסך נדחה',
      garage_appointment_set: '📅 תור מוסך נקבע',
      garage_appointment_cancelled: '📅 תור בוטל',
      fuel_high:       '⛽ צריכת דלק חריגה',
      fuel_km_high:    '📊 עלות לקמ חריגה'
    };
    const notifTitle = notif.title || LABEL[alertType] || 'עלה — התראה';
    const notifBody  = notif.body  || 'פתח את האפליקציה לפרטים';

    return self.registration.showNotification(notifTitle, {
      body:  notifBody,
      icon:  './icons/icon-512.png',
      image: './icons/icon-512.png',
      badge: './icons/icon-192.png',
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
        { action: 'open',    title: '▶ פתח עכשיו' },
        { action: 'dismiss', title: 'הבנתי' }
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
      const nTag = 'aleh-' + ((n.data && n.data.alertType) || 'notif') + '-' + ((n.data && n.data.vehicleId) || '');
      return nTag !== tag;
    });
  }
});
