const CACHE_NAME = 'aleh-driver-v56';

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
  const title = (data.notification && data.notification.title) || 'עלה — התראה';
  const body  = (data.notification && data.notification.body)  || '';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: data.data || {}
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./index.html'));
});
