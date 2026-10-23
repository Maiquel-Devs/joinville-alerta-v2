// Service Worker: cache primeiro para tudo que é do próprio app, atualizando em segundo plano.
// Suba a versão sempre que mudar qualquer arquivo da lista (inclusive data/*.geojson).
const VERSAO = 'v6';
const CACHE_NAME = `joinville-alerta-v2-${VERSAO}`;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pip.js',
  './manifest.json',
  './data/geojson/mare_cachoeira_1_6m.geojson',
  './data/geojson/mare_cachoeira_2_5m.geojson',
  './data/geojson/inundacao_vila_nova.geojson',
  './data/geojson/inundacao_itaum.geojson',
  './data/ruas_risco.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Só intercepta GET do mesmo domínio. A API (Render) e os tiles do mapa passam direto:
// o app guarda o último estado da API por conta própria e os tiles ficam fora do cache (3.4).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const emCache = await cache.match(req, { ignoreSearch: true });
      const rede = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (emCache) {
        event.waitUntil(rede); // atualiza em segundo plano
        return emCache;
      }
      const res = await rede;
      if (res) return res;
      // Sem rede e sem cache: navegação cai na página principal
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    })
  );
});
