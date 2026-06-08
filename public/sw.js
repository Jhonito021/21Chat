const CACHE_NAME = 'chat-link-v1';
const STATIC_CACHE = 'chat-static-v1';
const DYNAMIC_CACHE = 'chat-dynamic-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Installation
self.addEventListener('install', event => {
    console.log('[SW] Installation');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Mise en cache statique');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activation
self.addEventListener('activate', event => {
    console.log('[SW] Activation');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
                        console.log('[SW] Suppression ancien cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Ne pas intercepter les appels API
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'Mode hors ligne'
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }
    
    // Stratégie: Cache First pour les statiques
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    return cached;
                }
                
                return fetch(event.request)
                    .then(response => {
                        if (response.status === 200) {
                            const clone = response.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/index.html');
                        }
                        return new Response('Hors ligne', { status: 503 });
                    });
            })
    );
});

// Notifications push
self.addEventListener('push', event => {
    const data = event.data?.json() || {
        title: 'ChatLink',
        body: 'Nouveau message reçu',
        icon: '/icons/icon-192.png'
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: '/icons/icon-72.png',
            vibrate: [200, 100, 200],
            tag: 'chat-message',
            data: { url: data.url || '/' }
        })
    );
});

// Clic sur notification
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                if (clients.length > 0) {
                    return clients[0].focus();
                }
                return self.clients.openWindow(event.notification.data.url || '/');
            })
    );
});