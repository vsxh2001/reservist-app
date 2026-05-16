/**
 * sw-push.js — secondary service worker for web push notifications.
 *
 * Registered alongside the VitePWA-managed worker. This file is served
 * from /sw-push.js (static, in public/) so it is not processed by Vite
 * and does not interfere with the offline/precache worker.
 *
 * iOS PWA push requires the app to be installed to the home screen AND
 * running on HTTPS. It also requires iOS 16.4+. Android Chrome works on
 * dev HTTPS (self-signed cert after manual trust) from Chrome 50+.
 */

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Reservist', {
      body: data.body ?? '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/'));
});

/**
 * Message handler for local test pushes (no server round-trip).
 * The SettingsScreen "Test" button posts { type: 'TEST_PUSH' } to this worker.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'TEST_PUSH') {
    self.registration.showNotification('Reservist — test', {
      body: 'Push notifications are working correctly.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: '/' },
    });
  }
});
