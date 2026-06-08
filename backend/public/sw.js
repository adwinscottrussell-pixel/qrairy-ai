// SW_LIFECYCLE_PATCH - install, activate, fetch handlers for iOS PWA reliability
self.addEventListener('install', function(e) {
  // New SW takes over immediately instead of waiting for all tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // Take control of any pages that loaded before the SW activated
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e) {
  // Network-first pass-through. The handler exists so iOS recognises the SW
  // as a navigation controller; we don't actually cache anything.
  e.respondWith(
    fetch(e.request).catch(function() {
      return new Response('', { status: 503, statusText: 'Offline' });
    })
  );
});

self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'New message', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'New message', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: { url: data.url || '/' },
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  e.waitUntil(clients.openWindow(url));
});