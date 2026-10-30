const CACHE_NAME = 'maple-v2';
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
        }).then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(event.request).then((cacheRes) => {
            return cacheRes || fetch(event.request).catch(() => {
                if (event.request.url.includes('.html') || event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
