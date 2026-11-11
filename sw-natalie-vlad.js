/* Service worker do Treino Natalie & Vlad.
   Registrado com escopo restrito a treino_natalie_vlad.html — não afeta treinos.html nem 5k.html.
   Página: rede primeiro (pega atualizações), cache se estiver offline.
   Chart.js e ícones: cache primeiro. Apps Script: nunca passa pelo cache. */
const CACHE = 'nv-app-v1.1';
const PAGE = './treino_natalie_vlad.html';
const CORE = [PAGE, './treino_natalie_vlad.webmanifest', './icons/nv-192.png', './icons/nv-512.png'];
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    try { const r = await fetch(CDN, { mode: 'cors' }); if (r.ok) await c.put(CDN, r); } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('nv-app-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return; // sync sempre direto
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('.html'))) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put(PAGE, r.clone());
        return r;
      } catch (err) {
        return (await caches.match(PAGE)) || Response.error();
      }
    })());
    return;
  }
  if (req.url === CDN || url.origin === location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    })());
  }
});
