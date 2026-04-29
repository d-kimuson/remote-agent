type RequestAuthInput = {
  readonly apiKey: string | undefined;
  readonly authorizationHeader: string | null;
  readonly queryToken?: string | null;
};

export const isAuthorizedRequest = ({
  apiKey,
  authorizationHeader,
  queryToken = null,
}: RequestAuthInput): boolean => {
  if (apiKey === undefined || apiKey.length === 0) {
    return true;
  }
  if (queryToken === apiKey) {
    return true;
  }
  if (authorizationHeader === null) {
    return false;
  }

  const [scheme, token] = authorizationHeader.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token === apiKey;
};

const normalizeIp = (value: string): string => {
  if (value.startsWith('::ffff:')) {
    return value.slice('::ffff:'.length);
  }
  return value;
};

export const requestIpFromHeaders = (headers: Headers): string | null => {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor !== null && forwardedFor.length > 0) {
    return normalizeIp(forwardedFor.split(',')[0]?.trim() ?? '');
  }

  const realIp = headers.get('x-real-ip');
  if (realIp !== null && realIp.length > 0) {
    return normalizeIp(realIp.trim());
  }

  return null;
};

export const isAllowedIp = ({
  allowedIps,
  requestIp,
}: {
  readonly allowedIps: readonly string[];
  readonly requestIp: string | null;
}): boolean => {
  if (allowedIps.length === 0) {
    return true;
  }
  if (requestIp === null || requestIp.length === 0) {
    return false;
  }
  return allowedIps.includes(normalizeIp(requestIp));
};
