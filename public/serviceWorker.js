const CACHE_NAME = 'maple-v5';
const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/admin-dashboard.html',
    '/user-dashboard.html'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching app shell assets');
            return Promise.all(
                ASSETS.map((url) => {
                    return cache.add(url).catch((err) => {
                        console.warn(`[Service Worker] Failed to cache: ${url}`, err);
                    });
                })
            );
        })
    );
});

// Activate Event - Purge all older caches immediately
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => {
                    console.log(`[Service Worker] Deleting outdated cache: ${key}`);
                    return caches.delete(key);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Bypass API requests completely
    if (url.pathname.startsWith('/api/')) return;

    // For navigation requests (page loads): Network first, then fallback to cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request).then((cached) => {
                    return cached || caches.match('/index.html');
                });
            })
        );
        return;
    }

    // For static assets (CSS, JS, images): Stale-while-revalidate or Cache-first
    event.respondWith(
        caches.match(event.request).then((cacheRes) => {
            if (cacheRes) {
                // Fetch in background to update cache
                fetch(event.request).then((networkRes) => {
                    if (networkRes && networkRes.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes));
                    }
                }).catch(() => {});
                return cacheRes;
            }
            return fetch(event.request);
        })
    );
});
