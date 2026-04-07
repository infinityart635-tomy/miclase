const APP_VERSION = '__APP_VERSION__';
const SHELL_CACHE = `miclase-shell-${APP_VERSION}`;
const DATA_CACHE = `miclase-data-${APP_VERSION}`;
const CONTENT_CACHE = `miclase-content-${APP_VERSION}`;
const SHELL_PATHS = ['/', '/index.html', '/styles.css', '/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_PATHS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, DATA_CACHE, CONTENT_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = Array.isArray(event.data.urls) ? event.data.urls.filter(Boolean) : [];
    event.waitUntil(cacheUrls(urls));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (url.pathname.startsWith('/files/') && url.searchParams.get('download') === '1') {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname === '/api/session' || url.pathname === '/api/data') {
    event.respondWith(networkFirstWithCache(request, DATA_CACHE));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/files/')
    || request.destination === 'image'
    || request.destination === 'document'
  ) {
    event.respondWith(cacheFirstWithRefresh(request, CONTENT_CACHE));
    return;
  }

  if (
    url.pathname === '/'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.png')
    || url.pathname.endsWith('.jpg')
    || url.pathname.endsWith('.jpeg')
    || url.pathname.endsWith('.webp')
    || url.pathname.endsWith('.gif')
    || url.pathname.endsWith('.svg')
  ) {
    event.respondWith(networkFirstWithCache(request, SHELL_CACHE));
  }
});

async function cacheUrls(urls) {
  if (!urls.length) return;
  const shellCache = await caches.open(SHELL_CACHE);
  const dataCache = await caches.open(DATA_CACHE);
  const contentCache = await caches.open(CONTENT_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response || !response.ok) return;
        const targetCache = url.startsWith('/api/')
          ? dataCache
          : (url.startsWith('/files/') ? contentCache : shellCache);
        await targetCache.put(url, response.clone());
      } catch (_) {
        // Ignore cache warm failures and keep the app working.
      }
    })
  );
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    if (response && response.ok) {
      cache.put(request, response.clone());
      cache.put('/', response.clone());
    }
    return response;
  } catch (_) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(request)) || (await cache.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkPromise || fetch(request);
}

async function cacheFirstWithRefresh(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => null);
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw _;
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (_) {
    const cache = await caches.open(DATA_CACHE);
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw _;
  }
}
