// Firebase Cloud Messaging Background Service Worker
// Automatically handled by browsers for background push notifications

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBZy_DnvfXrWp7YWuoiKavp6YwzGYQGqag",
  authDomain: "dashboard-d5e6f.firebaseapp.com",
  projectId: "dashboard-d5e6f",
  storageBucket: "dashboard-d5e6f.firebasestorage.app",
  messagingSenderId: "659200340796",
  appId: "1:659200340796:web:734a594885dc44fabb2439",
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background push notification received:', payload);
    const notificationTitle = payload.notification?.title || payload.data?.title || 'AMI Pallikkuth Alert';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'You have an important madrasa update.',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: payload.data?.type || 'ami-notification',
      data: payload.data || {},
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (error) {
  console.warn('[firebase-messaging-sw.js] Messaging init note:', error);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
