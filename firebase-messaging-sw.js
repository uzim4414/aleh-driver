// Firebase Messaging service worker — handles BACKGROUND push notifications.
// Runs in its own scope alongside sw.js. Required by firebase-messaging.

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCG49bXyT8wZ7Z6tU-fM9zzAJoMmAPUfuA",
  authDomain: "aleh-fleet.firebaseapp.com",
  projectId: "aleh-fleet",
  storageBucket: "aleh-fleet.firebasestorage.app",
  messagingSenderId: "247079131404",
  appId: "1:247079131404:web:68816ccdf27667cdc39129"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  console.log('FCM bg:', payload);
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

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
