// Service worker: пази приложението в устройството, за да работи без интернет.
// При всяка нова версия на файловете сменете номера тук (напр. v2 → v3).
const VERSION = 'namaz-v6';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png'];
const FONTS = 'namaz-fonts';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Шрифтове от Google: пазят се след първото зареждане, после идват от устройството
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(caches.open(FONTS).then(async (cache) => {
            const hit = await cache.match(req);
            if (hit) return hit;
            try {
                const res = await fetch(req);
                if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
                return res;
            } catch (e) {
                return new Response('', { status: 504 });
            }
        }));
        return;
    }

    if (url.origin !== self.location.origin) return;

    // Страницата: веднага от устройството, а при интернет — тихо обновяване за следващото отваряне
    if (req.mode === 'navigate') {
        const network = fetch(req).then(async (res) => {
            if (res.ok) { const copy = res.clone(); const cache = await caches.open(VERSION); await cache.put('./index.html', copy); }
            return res;
        }).catch(() => null);
        event.waitUntil(network);
        event.respondWith(caches.match('./index.html').then((cached) =>
            cached || network.then((res) => res || new Response('Няма връзка', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
        return;
    }

    // Останалите файлове: от устройството, ако ги няма — от мрежата
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((cache) => cache.put(req, copy)); }
        return res;
    })));
});
