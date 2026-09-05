/* eslint-env serviceworker */
// WordMaster 应用壳 Service Worker：
// - 预缓存应用壳，导航请求网络优先、失败回退离线页
// - 静态资源缓存优先
// - /api/ 请求一律走网络，离线语义由应用层事件队列处理
const CACHE_NAME = 'wordmaster-shell-v1';
const APP_SHELL = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/wordmaster-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached || caches.match('/offline.html')).then((fallback) => fallback || caches.match('/offline.html')),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined);
        return response;
      });
    }),
  );
});
