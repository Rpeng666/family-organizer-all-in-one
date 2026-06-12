const CACHE_VERSION = 'family-organizer-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const APP_SHELL_URLS = [
    OFFLINE_URL,
    '/manifest.json',
    '/icon-192x192.png',
    '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(APP_SHELL_CACHE)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)));
            await self.clients.claim();
        })()
    );
});

function isSameOriginGet(request) {
    return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isStaticAsset(pathname) {
    return (
        pathname.startsWith('/_next/static/') ||
        pathname.startsWith('/_next/image') ||
        /\.(?:js|css|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|ico|json)$/.test(pathname)
    );
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!isSameOriginGet(request)) return;

    const url = new URL(request.url);

    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkResponse = await fetch(request);
                    const cache = await caches.open(RUNTIME_CACHE);
                    cache.put(request, networkResponse.clone()).catch(() => {});
                    return networkResponse;
                } catch {
                    const cachedPage = await caches.match(request);
                    if (cachedPage) return cachedPage;
                    const offlineFallback = await caches.match(OFFLINE_URL);
                    return (
                        offlineFallback ||
                        new Response('Offline', {
                            status: 503,
                            headers: { 'content-type': 'text/plain' },
                        })
                    );
                }
            })()
        );
        return;
    }

    if (isStaticAsset(url.pathname)) {
        event.respondWith(
            (async () => {
                const cached = await caches.match(request);
                if (cached) {
                    event.waitUntil(
                        fetch(request)
                            .then(async (resp) => {
                                const cache = await caches.open(RUNTIME_CACHE);
                                await cache.put(request, resp.clone());
                            })
                            .catch(() => {})
                    );
                    return cached;
                }

                const networkResponse = await fetch(request);
                const cache = await caches.open(RUNTIME_CACHE);
                cache.put(request, networkResponse.clone()).catch(() => {});
                return networkResponse;
            })()
        );
    }
});
