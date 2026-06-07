// ==================== SERVICE WORKER POUR PWA ====================
const CACHE_NAME = 'chat-supabase-v1';
const STATIC_CACHE_NAME = 'chat-static-v1';
const DYNAMIC_CACHE_NAME = 'chat-dynamic-v1';

// Fichiers à mettre en cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdn.socket.io/4.5.4/socket.io.min.js'
];

// Installation du Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Installation');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('[SW] Mise en cache des fichiers statiques');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Forcer l'activation du nouveau SW
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Erreur d\'installation:', error);
            })
    );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
    console.log('[SW] Activation');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Supprimer les anciens caches
                    if (cacheName !== STATIC_CACHE_NAME && 
                        cacheName !== DYNAMIC_CACHE_NAME) {
                        console.log('[SW] Suppression de l\'ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Prendre le contrôle de tous les clients
            return self.clients.claim();
        })
    );
});

// Stratégie de cache: Network First avec fallback
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Ne pas mettre en cache les appels API
    if (requestUrl.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.log('[SW] API hors ligne:', error);
                    return new Response(
                        JSON.stringify({ 
                            success: false, 
                            message: 'Mode hors ligne - Connexion perdue' 
                        }),
                        { 
                            headers: { 'Content-Type': 'application/json' },
                            status: 503
                        }
                    );
                })
        );
        return;
    }
    
    // Ne pas mettre en cache les websockets
    if (requestUrl.protocol === 'ws:' || requestUrl.protocol === 'wss:') {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Pour les fichiers statiques (CSS, JS, etc.)
    if (STATIC_ASSETS.includes(event.request.url) || 
        event.request.url.includes('.css') || 
        event.request.url.includes('.js')) {
        
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request)
                        .then(response => {
                            const responseClone = response.clone();
                            caches.open(STATIC_CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                            return response;
                        });
                })
        );
        return;
    }
    
    // Pour les autres ressources (images, etc.) - Strategy: Cache First
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then(response => {
                        // Mettre en cache les images et autres ressources
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(DYNAMIC_CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return response;
                    })
                    .catch(error => {
                        console.log('[SW] Ressource non disponible:', event.request.url);
                        
                        // Fallback pour les pages HTML
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('/index.html');
                        }
                        
                        return new Response('Ressource non disponible hors ligne', {
                            status: 404,
                            statusText: 'Not Found'
                        });
                    });
            })
    );
});

// Gestion des notifications push
self.addEventListener('push', event => {
    console.log('[SW] Push reçu:', event);
    
    let data = {
        title: 'ChatSupabase',
        body: 'Nouveau message reçu',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [200, 100, 200],
        tag: 'chat-message'
    };
    
    if (event.data) {
        try {
            data = Object.assign(data, event.data.json());
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            vibrate: data.vibrate,
            tag: data.tag,
            requireInteraction: true,
            data: {
                url: data.url || '/'
            }
        })
    );
});

// Gestion du clic sur notification
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification click:', event);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // Vérifier si une fenêtre est déjà ouverte
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Sinon ouvrir une nouvelle fenêtre
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});

// Synchronisation en arrière-plan (pour les messages hors ligne)
self.addEventListener('sync', event => {
    console.log('[SW] Sync:', event);
    
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    console.log('[SW] Synchronisation des messages...');
    
    // Récupérer les messages en attente depuis IndexedDB
    const pendingMessages = await getPendingMessages();
    
    for (const message of pendingMessages) {
        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': message.sessionId
                },
                body: JSON.stringify({
                    conversationId: message.conversationId,
                    message: message.text
                })
            });
            
            if (response.ok) {
                await deletePendingMessage(message.id);
                console.log('[SW] Message synchronisé:', message.id);
            }
        } catch (error) {
            console.error('[SW] Erreur sync message:', error);
        }
    }
}

// Fonctions IndexedDB pour la synchronisation hors ligne
async function getPendingMessages() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ChatSyncDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['pending_messages'], 'readonly');
            const store = transaction.objectStore('pending_messages');
            const getAll = store.getAll();
            
            getAll.onsuccess = () => resolve(getAll.result);
            getAll.onerror = () => reject(getAll.error);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending_messages')) {
                db.createObjectStore('pending_messages', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function deletePendingMessage(id) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ChatSyncDB', 1);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['pending_messages'], 'readwrite');
            const store = transaction.objectStore('pending_messages');
            const deleteRequest = store.delete(id);
            
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
    });
}

// Gestion des erreurs
self.addEventListener('error', event => {
    console.error('[SW] Erreur:', event.error);
});

self.addEventListener('unhandledrejection', event => {
    console.error('[SW] Promise non gérée:', event.reason);
});