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
  // clients.openWindow() alone opens a new window on Chrome, but on iOS
  // Safari it instead focuses an already-open matching window/tab WITHOUT
  // navigating it — leaving it on whatever page it was already showing.
  // Explicitly navigating an existing client first (falling back to
  // openWindow only when none exists) makes the destination URL honored
  // on both. (The URL itself is always same-origin by the time it reaches
  // here — see push-open.html for how a cross-origin destination bounces
  // through a same-origin redirect first.)
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ('navigate' in clientList[i]) {
          return clientList[i].navigate(url).then(function(client) { return client.focus(); });
        }
      }
      return clients.openWindow(url);
    })
  );
});