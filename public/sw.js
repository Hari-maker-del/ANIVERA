/**
 * ANIVERA — Production Service Worker (sw.js)
 * Version: 2.6.0
 * Handles offline shell caching, immutable species asset caching, and network-first auth isolation.
 */

const CACHE_NAME = 'anivera-shell-v2.6.0';

const PRECACHE_URLS = [
  './',
  './index.html',
  './dashboard.html',
  './styles.css',
  './app.js',
  './cloud-sync.js',
  './animals-data.js',
  './manifest.json',\n  './brand/anivera-logo.svg',
  './assets/species/snow-leopard.webp',
  './assets/species/bengal-tiger.webp',
  './assets/species/polar-bear.webp',
  './assets/species/african-bush-elephant.webp'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('ANIVERA SW precache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Security policy: Never cache Supabase auth or API calls
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets (images, fonts, stylesheets, scripts): Cache-First with fallback
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback placeholder if asset fetch fails
          return cachedResponse;
        });
      })
    );
    return;
  }

  // HTML Navigation: Network-First with Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const respCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, respCopy);
          });
        }
        return response;
      }).catch(() => {
        return caches.match('./index.html') || caches.match(event.request);
      })
    );
    return;
  }

  // Default: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});
