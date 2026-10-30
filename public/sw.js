/* CutLocal service worker — offline support.
 *
 * Two things are cached:
 *  1. the app shell, so the tool opens without a connection
 *  2. the AI engine files from staticimgly.com, so once the model has
 *     downloaded, background removal keeps working offline
 *
 * No analytics, no tracking, no image data ever passes through here.
 */
const VERSION = 'cutlocal-v1';
const SHELL = `${VERSION}-shell`;
const ENGINE = `${VERSION}-engine`;

const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];
const ENGINE_HOSTS = new Set(['staticimgly.com', 'cdn.staticimgly.com']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Model + runtime files: cache first, they never change for a version.
  if (ENGINE_HOSTS.has(url.hostname) || url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(ENGINE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/index.html')))
    );
    return;
  }

  // Assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
