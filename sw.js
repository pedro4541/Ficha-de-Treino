/* Service worker compartilhado pelos apps que usam app/engine.js.
   Cada página registra este arquivo com escopo restrito a ela mesma
   (ex.: scope './treino_matheus.html'), então um app não interfere no outro
   nem em treinos.html / 5k.html.
   - Arquivos do site: rede primeiro (pega atualizações), cache se offline.
   - Chart.js e Google Fonts: cache primeiro.
   - Apps Script: nunca passa pelo cache. */
const VERSAO = 'v2';
const SCOPE = self.registration.scope;
const CACHE = 'treino-' + VERSAO + '|' + SCOPE;
const CORE = [SCOPE, './app/engine.js', './app/engine.css'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('nv-app-')) await caches.delete(k);                        // cache da versão antiga (v1.1)
      if (k.startsWith('treino-') && k.endsWith('|' + SCOPE) && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

const cacheFirst = async req => {
  const hit = await caches.match(req); if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') (await caches.open(CACHE)).put(req, r.clone());
  return r;
};
const networkFirst = async (req, key) => {
  try {
    const r = await fetch(req);
    if (r.ok) (await caches.open(CACHE)).put(key || req, r.clone());
    return r;
  } catch (err) {
    return (await caches.match(key || req, { ignoreSearch: true })) || Response.error();
  }
};

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, SCOPE)); return; }
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});
