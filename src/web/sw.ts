/// <reference lib="webworker" />

import { object, parse, pipe, string, trim } from 'valibot';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const notificationDataSchema = object({
  url: pipe(string(), trim()),
});

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const nextUrl = (() => {
    try {
      return parse(notificationDataSchema, event.notification.data).url;
    } catch {
      return '/';
    }
  })();
  const nextPathname = new URL(nextUrl, self.location.origin).pathname;

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      const matchedClient = clients.find((client) => new URL(client.url).pathname === nextPathname);

      if (matchedClient !== undefined) {
        return matchedClient.focus();
      }

      return self.clients.openWindow(nextUrl);
    }),
  );
});
