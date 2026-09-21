// ERP General — Service Worker (WP-B2)
const CACHE = 'erp-v1'
const PRECACHE = ['/', '/dashboard', '/tasks', '/notifications', '/me', '/manifest.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Network-first for Supabase RPC, auth, API routes
  if (url.pathname.startsWith('/rest/v1/rpc') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"ok":false,"code":"OFFLINE"}', { headers: { 'Content-Type': 'application/json' } })))
    return
  }
  // Stale-while-revalidate for navigation
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const network = fetch(e.request).then((res) => {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()))
          return res
        })
        return cached || network
      })
    )
    return
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res.ok && e.request.url.match(/\.(png|svg|ico|woff2|css|js)(\?|$)/)) {
        caches.open(CACHE).then((c) => c.put(e.request, res.clone()))
      }
      return res
    }))
  )
})

self.addEventListener('push', (e) => {
  let data = { title: 'ERP General', body: 'Bạn có thông báo mới', url: '/notifications' }
  try { if (e.data) data = { ...data, ...e.data.json() } } catch (_) { /**/ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/notifications' },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/notifications'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin))
      if (existing) { existing.navigate(url); return existing.focus() }
      return clients.openWindow(url)
    })
  )
})
