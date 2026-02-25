/**
 * Maestro Mobile Web Service Worker
 *
 * Provides offline capability for the mobile web interface.
 * When offline, displays a disconnected state to inform the user
 * that they cannot communicate with the Maestro desktop app.
 *
 * Strategy:
 * - Cache essential app shell (HTML, CSS, JS, icons) on install
 * - Network-first for API calls (they require live connection)
 * - Cache-first for static assets
 * - Show offline fallback when network unavailable
 */

const CACHE_NAME = 'maestro-mobile-v1';

// Assets to cache on install (app shell)
const PRECACHE_ASSETS = [
	'./',
	'./manifest.json',
	'./icons/icon-72x72.png',
	'./icons/icon-96x96.png',
	'./icons/icon-192x192.png',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
	console.log('[SW] Installing service worker...');

	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				console.log('[SW] Caching app shell...');
				// Use addAll for precaching, but don't fail install if some assets are missing
				return cache.addAll(PRECACHE_ASSETS).catch((err) => {
					console.warn('[SW] Some precache assets failed to cache:', err);
					// Still succeed install - we'll cache on fetch
				});
			})
			.then(() => {
				console.log('[SW] Installation complete');
				// Skip waiting to activate immediately
				return self.skipWaiting();
			})
	);
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[SW] Activating service worker...');

	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((name) => name.startsWith('maestro-') && name !== CACHE_NAME)
						.map((name) => {
							console.log('[SW] Deleting old cache:', name);
							return caches.delete(name);
						})
				);
			})
			.then(() => {
				console.log('[SW] Activation complete');
				// Take control of all pages immediately
				return self.clients.claim();
			})
	);
});

// Fetch event - handle requests with appropriate caching strategy
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') {
		return;
	}

	// Skip WebSocket connections
	if (url.protocol === 'ws:' || url.protocol === 'wss:') {
		return;
	}

	// API requests - network only, no caching (requires live connection)
	// Note: URLs include security token in path, e.g., /{TOKEN}/api/... or /{TOKEN}/ws/...
	if (url.pathname.includes('/api/') || url.pathname.includes('/ws/')) {
		event.respondWith(
			fetch(request).catch(() => {
				// Return a JSON error response for API requests when offline
				return new Response(
					JSON.stringify({
						error: 'offline',
						message: 'You are offline. Please reconnect to use Maestro.',
					}),
					{
						status: 503,
						statusText: 'Service Unavailable',
						headers: {
							'Content-Type': 'application/json',
						},
					}
				);
			})
		);
		return;
	}

	// Static assets - cache-first with network fallback
	if (isStaticAsset(url.pathname)) {
		event.respondWith(
			caches.match(request).then((cachedResponse) => {
				if (cachedResponse) {
					// Return cached version and update cache in background
					fetchAndCache(request);
					return cachedResponse;
				}
				// Not in cache, fetch from network and cache
				return fetchAndCache(request);
			})
		);
		return;
	}

	// HTML/main document - network-first with cache fallback
	event.respondWith(
		fetch(request)
			.then((response) => {
				// Clone response before caching
				if (response.ok) {
					const responseClone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseClone);
					});
				}
				return response;
			})
			.catch(async () => {
				// Network failed, try cache
				const cachedResponse = await caches.match(request);
				if (cachedResponse) {
					return cachedResponse;
				}
				// If no cached HTML, return offline fallback
				return caches.match('./');
			})
	);
});

/**
 * Check if URL is a static asset that should be cached
 */
function isStaticAsset(pathname) {
	return (
		pathname.endsWith('.js') ||
		pathname.endsWith('.css') ||
		pathname.endsWith('.png') ||
		pathname.endsWith('.jpg') ||
		pathname.endsWith('.jpeg') ||
		pathname.endsWith('.svg') ||
		pathname.endsWith('.ico') ||
		pathname.endsWith('.woff') ||
		pathname.endsWith('.woff2') ||
		pathname.endsWith('.json')
	);
}

/**
 * Fetch from network and update cache
 */
async function fetchAndCache(request) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		// Network failed, try cache as last resort
		const cached = await caches.match(request);
		if (cached) {
			return cached;
		}
		throw error;
	}
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
	if (event.data === 'skipWaiting') {
		self.skipWaiting();
	}

	// Allow main app to check if SW is active
	if (event.data === 'ping') {
		event.ports[0]?.postMessage('pong');
	}
});

// Broadcast connection status changes to all clients
async function broadcastToClients(message) {
	const clients = await self.clients.matchAll({ type: 'window' });
	clients.forEach((client) => {
		client.postMessage(message);
	});
}

// Listen for online/offline events and notify clients
self.addEventListener('online', () => {
	console.log('[SW] Online');
	broadcastToClients({ type: 'connection-change', online: true });
});

self.addEventListener('offline', () => {
	console.log('[SW] Offline');
	broadcastToClients({ type: 'connection-change', online: false });
});
