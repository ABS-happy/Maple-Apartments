const CACHE_NAME = 'maple-v11';
const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/admin-dashboard.html',
    '/user-dashboard.html',
    '/payment-demo.html',
    '/dashboard.css'
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
    // Only handle GET requests and valid http/https schemes
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // Bypass API requests completely
    if (url.pathname.startsWith('/api/')) return;

    // For navigation requests (page loads): Network first, then fallback to cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request).then((cached) => {
                    return cached || caches.match('/') || caches.match('/index.html');
                });
            })
        );
        return;
    }

    // For static assets: Stale-while-revalidate or Cache-first
    event.respondWith(
        caches.match(event.request).then((cacheRes) => {
            if (cacheRes) {
                fetch(event.request).then((networkRes) => {
                    if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                        const resToCache = networkRes.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resToCache));
                    }
                }).catch(() => {});
                return cacheRes;
            }
            return fetch(event.request).then((networkRes) => {
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                    const resToCache = networkRes.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resToCache));
                }
                return networkRes;
            }).catch(() => cacheRes);
        })
    );
});
