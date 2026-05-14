// SW build: 2026-05-14T00:00:00Z // v70
/* ════════════════════════════════════════════════════════════════════
   Main service worker for the עלה driver PWA.
   Merged with Firebase Cloud Messaging handler — there is only ONE
   service worker for this scope to avoid registration conflicts that
   cause firebase.messaging.getToken() to hang.
   Upgraded to Firebase v11.0.2 compat (client uses modular v11 ESM).
   ════════════════════════════════════════════════════════════════════ */

importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCG49bXyT8wZ7Z6tU-fM9zzAJoMmAPUfuA",
  authDomain: "aleh-fleet.firebaseapp.com",
  projectId: "aleh-fleet",
  storageBucket: "aleh-fleet.firebasestorage.app",
  messagingSenderId: "247079131404",
  appId: "1:247079131404:web:68816ccdf27667cdc39129"
});

const messaging = firebase.messaging();

/* Background FCM handler — fires when app is closed / backgrounded */
messaging.onBackgroundMessage(payload => {
  console.log('[SW] FCM bg:', payload);
  const notif = payload.notification || {};
  const data  = payload.data || {};

  const TYPE_CONFIG = {
    overdue:     { vibrate: [400,100,400,100,400], requireInteraction: true },
    urgent:      { vibrate: [300,100,300] },
    plan:        { vibrate: [200] },
    km_update:   { vibrate: [150] },
    test_due:    { vibrate: [300,100,300] },
    test_urgent: { vibrate: [400,100,400,100,400], requireInteraction: true }
  };
  const cfg = TYPE_CONFIG[data.alertType] || { vibrate: [200] };

  self.registration.showNotification(notif.title || 'עלה', {
    body: notif.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: 'maint-' + (data.vehicleId || 'general'),
    renotify: true,
    vibrate: cfg.vibrate,
    requireInteraction: !!cfg.requireInteraction,
    data: data,
    actions: [
      { action: 'open',    title: 'פתח באפליקציה' },
      { action: 'dismiss', title: 'הבנתי' }
    ]
  });
});

/* ════════════════════════════════════════════════════════════════════
   Cache / offline
   ════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'aleh-driver-v70';

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

self.addEventListener('push', e => {
  // If FCM SDK is handling it via onBackgroundMessage, this path may still
  // fire for non-FCM pushes. Keep it for resilience.
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) { return; }
  const notif = data.notification || {};
  const meta  = data.data || {};

  // If notification field is absent, assume FCM SDK already handled it.
  if (!notif.title && !notif.body) return;

  const title = notif.title || 'עלה — התראה';
  const body  = notif.body  || '';
  const alertType = meta.alertType || '';

  const TYPE_CONFIG = {
    overdue:   { vibrate: [400,100,400,100,400], requireInteraction: true,  badge: './icons/badge-red.png' },
    urgent:    { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
    plan:      { vibrate: [200],                 requireInteraction: false, badge: './icons/badge-blue.png' },
    km_update: { vibrate: [150],                 requireInteraction: false, badge: './icons/badge-violet.png' },
    test_due:    { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
    test_urgent: { vibrate: [400,100,400,100,400], requireInteraction: true,  badge: './icons/badge-red.png' }
  };
  const cfg = TYPE_CONFIG[alertType] || { vibrate: [200], requireInteraction: false };

  const opts = {
    body,
    icon: './icons/icon-192.png',
    badge: cfg.badge || './icons/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: 'maint-' + (meta.vehicleId || 'general'),
    renotify: true,
    vibrate: cfg.vibrate,
    requireInteraction: cfg.requireInteraction,
    data: meta,
    actions: alertType ? [
      { action: 'open',    title: 'פתח באפליקציה' },
      { action: 'dismiss', title: 'הבנתי' }
    ] : []
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const meta = e.notification.data || {};
  const hash = meta.click_action || '';
  const url  = './index.html' + (hash || '');
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/driver/') && 'focus' in c) {
          c.postMessage({ type: 'notification-click', data: meta });
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
