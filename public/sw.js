/* ============================================================
   BASELINE - Service Worker
   Caches shell assets for offline support and fast loads.
   ============================================================ */

var CACHE_NAME = 'baseline-v1';
var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/generator.js',
  '/scores.js',
  '/workouts.js',
  '/library.js',
  '/create-workout.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Network first for API calls, cache first for shell assets
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        return response;
      });
    })
  );
});
