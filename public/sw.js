/* ============================================================
   BASELINE - Service Worker
   Cache version updates automatically invalidate old caches.
   ============================================================ */

var CACHE_NAME = 'baseline-202606091744';
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
      return self.skipWaiting(); // activate immediately
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
      return self.clients.claim(); // take control immediately
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Always network-first for HTML and JS so updates reach users fast
  if (e.request.url.includes('/api/') ||
      e.request.destination === 'document' ||
      e.request.url.endsWith('.js') ||
      e.request.url.endsWith('.css')) {
    e.respondWith(
      fetch(e.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return response;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Cache-first for images and fonts
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
