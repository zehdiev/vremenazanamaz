// Service worker: пази приложението в устройството, за да работи без интернет.
// При всяка нова версия на файловете сменете номера тук (напр. v2 → v3).
const VERSION = 'namaz-v23';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png', './badge-96.png'];
const FONTS = 'namaz-fonts';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS && k !== 'namaz-notify').map((k) => caches.delete(k))))
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

// --- Тихи известия: обновяване и при затворено приложение (където браузърът позволява) ---
async function showNextPrayer() {
    const cache = await caches.open('namaz-notify');
    const res = await cache.match('./__notify.json');
    if (!res) return;
    const s = await res.json();
    if (!s.on || !s.list) return;
    const now = Date.now(), i = s.list.findIndex((p) => p.t > now);
    if (i < 0) return;
    const next = s.list[i], after = s.list[i + 1];
    const sig = `${next.t}|${next.name}|${next.time}|${s.loc}`;
    if (sig === s.shown) return;
    await self.registration.showNotification(`Следва: ${next.name} в ${next.time}`, {
        body: `📍 ${s.loc}` + (after ? ` · после ${after.name} ${after.time}` : ''),
        tag: 'namaz-next', silent: true, renotify: false, icon: 'icon-192.png', badge: 'badge-96.png', timestamp: next.t, data: { url: './' }
    });
    s.shown = sig;
    await cache.put('./__notify.json', new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } }));
}
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'namaz-notify') event.waitUntil(showNextPrayer());
});
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        for (const w of wins) { if ('focus' in w) return w.focus(); }
        return self.clients.openWindow('./');
    }));
});
