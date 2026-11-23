const CACHE_NAME = 'homebuddy-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('homebuddy-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin requests (including Supabase/auth/realtime).
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')))
    );
    return;
  }

  // Cache only versioned app assets and the small set of public PWA files.
  const isAppAsset = url.pathname.startsWith('/assets/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/icon.svg';
  if (!isAppAsset) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        await caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
  );
});


// Display server-sent Web Push messages while the PWA is in the background or closed.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch { payload = { title: 'HomeBuddy', body: event.data?.text() || 'You have a new household update.' }; }
  const title = payload.title || 'HomeBuddy';
  const options = {
    body: payload.body || 'You have a new household update.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || payload.notificationId || 'homebuddy-notification',
    data: { url: payload.url || '/', notificationId: payload.notificationId || null },
    renotify: false,
    timestamp: Date.now()
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
