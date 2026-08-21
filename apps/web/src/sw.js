import { precacheAndRoute } from 'workbox-precaching';

// Precache all assets compiled by Vite
precacheAndRoute(self.__WB_MANIFEST || []);

// Listen for push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.message,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: {
          url: payload.url,
        },
      })
    );
  } catch (err) {
    console.error('Push event error:', err);
  }
});

// Handle notification click to navigate or focus windows
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window client is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then((focusedClient) => {
            if ('navigate' in focusedClient) {
              return focusedClient.navigate(urlToOpen);
            }
          });
        }
      }
      // If not, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
