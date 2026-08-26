const CACHE_NAME = 'erp-fini-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching App Shell');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome extension protocols
  if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Handle HTML navigation requests (Network-First, fallback to Cache for seamless offline app load)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || caches.match(request));
        })
    );
    return;
  }

  // Handle static assets (Cache First with Stale-While-Revalidate)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Push Event Handler
self.addEventListener('push', (event) => {
  let data = { title: 'GummyStock - Notificação de Estoque', body: 'Alerta do sistema de estoque.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'GummyStock', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || data.message || 'Nova atualização no sistema.',
    icon: data.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍬</text></svg>',
    badge: data.badge || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍬</text></svg>',
    vibrate: [100, 50, 100],
    tag: data.tag || 'gummystock-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      productId: data.productId,
      type: data.type
    },
    actions: [
      { action: 'open', title: 'Ver no ERP' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url || '/');
      }
    })
  );
});

// Client PostMessage Listener for Triggering Notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag, data } = event.data.payload || {};
    const options = {
      body: body || 'Alerta de Estoque GummyStock',
      icon: icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍬</text></svg>',
      vibrate: [150, 50, 150],
      tag: tag || 'gummystock-alert',
      renotify: true,
      data: data || { url: '/' },
      actions: [
        { action: 'open', title: 'Abrir ERP' }
      ]
    };

    self.registration.showNotification(title || 'GummyStock', options);
  }
});
