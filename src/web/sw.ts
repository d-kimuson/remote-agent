/// <reference lib="webworker" />

import { object, parse, pipe, string, trim } from 'valibot';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

import {
  findReusableNotificationClientIndex,
  notificationClickTargetUrl,
} from './pwa/notification-click.pure.ts';

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
  const targetUrl = notificationClickTargetUrl(nextUrl, self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(async (clients) => {
      const reusableClientIndex = findReusableNotificationClientIndex(
        clients,
        targetUrl,
        self.location.origin,
      );

      if (reusableClientIndex !== null) {
        const reusableClient = clients.at(reusableClientIndex);

        if (reusableClient !== undefined) {
          const targetClient =
            reusableClient.url === targetUrl
              ? reusableClient
              : await reusableClient.navigate(targetUrl);
          return (targetClient ?? reusableClient).focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
