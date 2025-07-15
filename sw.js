// Service Worker for URL to App Converter
const CACHE_NAME = 'url-to-app-converter-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://script.google.com/macros/s/AKfycbzrZSWYT6n70Lw8tMYrMrTWidJEVeng6GMObOvEAosR1Pdysgmroqpw7FcQ4gikGv4gjA/exec'
];

// Install event - cache resources
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching files');
                return cache.addAll(urlsToCache.filter(url => !url.includes('script.google.com')));
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch(error => {
                console.log('[SW] Installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Special handling for Google Apps Script URLs
    if (requestUrl.hostname === 'script.google.com') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Clone response before using it
                    const responseClone = response.clone();
                    
                    // Only cache successful responses
                    if (response.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    
                    return response;
                })
                .catch(() => {
                    // Return cached version if network fails
                    return caches.match(event.request).then(cachedResponse => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // Return offline page for main app
                        return new Response(`
                            <!DOCTYPE html>
                            <html lang="th">
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <title>ออฟไลน์ - URL to App Converter</title>
                                <style>
                                    body {
                                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        margin: 0;
                                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                        color: white;
                                        text-align: center;
                                        padding: 20px;
                                    }
                                    .offline-container {
                                        max-width: 400px;
                                    }
                                    .offline-icon {
                                        font-size: 80px;
                                        margin-bottom: 20px;
                                    }
                                    .retry-btn {
                                        background: white;
                                        color: #667eea;
                                        border: none;
                                        padding: 15px 30px;
                                        border-radius: 25px;
                                        font-size: 16px;
                                        font-weight: bold;
                                        cursor: pointer;
                                        margin-top: 20px;
                                        transition: opacity 0.3s;
                                    }
                                    .retry-btn:hover {
                                        opacity: 0.8;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="offline-container">
                                    <div class="offline-icon">📡</div>
                                    <h1>ออฟไลน์</h1>
                                    <p>ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้</p>
                                    <p>กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง</p>
                                    <button class="retry-btn" onclick="window.location.reload()">
                                        ลองใหม่
                                    </button>
                                </div>
                            </body>
                            </html>
                        `, {
                            headers: {
                                'Content-Type': 'text/html',
                            },
                        });
                    });
                })
        );
        return;
    }
    
    // Handle other requests with cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached version if found
                if (response) {
                    console.log('[SW] Serving from cache:', event.request.url);
                    
                    // Update cache in background
                    fetch(event.request).then(networkResponse => {
                        if (networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                    }).catch(() => {
                        // Network failed, but we have cache
                    });
                    
                    return response;
                }
                
                // Not in cache, fetch from network
                console.log('[SW] Fetching from network:', event.request.url);
                return fetch(event.request).then(networkResponse => {
                    // Don't cache non-successful responses
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    
                    // Clone the response
                    const responseToCache = networkResponse.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return networkResponse;
                });
            })
            .catch(() => {
                // Both cache and network failed
                if (event.request.destination === 'document') {
                    // Return offline page for document requests
                    return caches.match('/offline.html') || 
                           caches.match('/') ||
                           new Response('Offline', { status: 503 });
                }
                
                // For other resources, return generic error
                return new Response('Resource not available offline', { 
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            })
    );
});

// Background sync for when connectivity is restored
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(
            // Update cache when online
            updateCache()
        );
    }
});

// Push notification handling
self.addEventListener('push', event => {
    console.log('[SW] Push received');
    
    if (event.data) {
        const options = {
            body: event.data.text(),
            icon: '/icon-192.png',
            badge: '/icon-72.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: 1
            },
            actions: [
                {
                    action: 'explore',
                    title: 'เปิดแอป',
                    icon: '/icon-72.png'
                },
                {
                    action: 'close',
                    title: 'ปิด'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification('URL to App Converter', options)
        );
    }
});

// Notification click handling
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification click:', event.action);
    
    event.notification.close();
    
    if (event.action === 'explore') {
        // Open app
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
        // Just close notification
        return;
    } else {
        // Default action - open app
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handling from main app
self.addEventListener('message', event => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});

// Helper function to update cache
async function updateCache() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();
        
        const updatePromises = requests.map(request => {
            return fetch(request).then(response => {
                if (response.status === 200) {
                    return cache.put(request, response);
                }
            }).catch(error => {
                console.log('[SW] Failed to update cache for:', request.url, error);
            });
        });
        
        await Promise.all(updatePromises);
        console.log('[SW] Cache updated successfully');
    } catch (error) {
        console.log('[SW] Cache update failed:', error);
    }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
    if (event.tag === 'content-sync') {
        event.waitUntil(updateCache());
    }
});

console.log('[SW] Service Worker loaded successfully');
