export type NotificationClickClient = {
  readonly url: string;
};

const toSameOriginUrl = (value: string, origin: string): URL | null => {
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
};

const routeKey = (url: URL): string => `${url.pathname}${url.search}${url.hash}`;

export const notificationClickTargetUrl = (value: string, origin: string): string => {
  return toSameOriginUrl(value, origin)?.href ?? new URL('/', origin).href;
};

export const findReusableNotificationClientIndex = (
  clients: readonly NotificationClickClient[],
  targetUrlValue: string,
  origin: string,
): number | null => {
  const targetUrl = toSameOriginUrl(targetUrlValue, origin);

  if (targetUrl === null) {
    return null;
  }

  const sameOriginClients = clients.flatMap((client, index) => {
    const clientUrl = toSameOriginUrl(client.url, origin);
    return clientUrl === null ? [] : [{ clientUrl, index }];
  });

  const exactMatch = sameOriginClients.find(
    ({ clientUrl }) => routeKey(clientUrl) === routeKey(targetUrl),
  );

  if (exactMatch !== undefined) {
    return exactMatch.index;
  }

  return sameOriginClients.at(0)?.index ?? null;
};
