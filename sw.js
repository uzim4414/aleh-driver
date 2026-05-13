const CACHE_NAME = 'aleh-driver-v63';

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

  /* cross-origin (GAS, Google APIs) — תמיד רשת, ללא התערבות */
  if (!url.startsWith(self.location.origin)) return;

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

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const notif = data.notification || {};
  const meta  = data.data || {};

  const title = notif.title || 'עלה — התראה';
  const body  = notif.body  || '';
  const alertType = meta.alertType || '';

  const TYPE_CONFIG = {
    overdue:   { vibrate: [400,100,400,100,400], requireInteraction: true,  badge: './icons/badge-red.png' },
    urgent:    { vibrate: [300,100,300],         requireInteraction: false, badge: './icons/badge-amber.png' },
    plan:      { vibrate: [200],                 requireInteraction: false, badge: './icons/badge-blue.png' },
    km_update: { vibrate: [150],                 requireInteraction: false, badge: './icons/badge-violet.png' }
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
