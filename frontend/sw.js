const CACHE_NAME = 'chatapp-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/chat.html',
  '/style.css',
  '/script.js',
  '/chat.js',
  '/local-api.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.socket.io/4.6.1/socket.io.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Ancien cache supprimé :', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});