import type {
  PermissionOption,
  PermissionOptionId,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';

import { parse } from 'valibot';

import {
  acpPermissionRequestsResponseSchema,
  type AcpPermissionOption,
  type AcpPermissionRequest,
  type AcpPermissionRequestsResponse,
} from '../../../shared/acp.ts';
import { emitAcpSse } from './sse-broadcast.ts';

type PendingPermissionRequest = {
  readonly request: AcpPermissionRequest;
  readonly resolve: (response: RequestPermissionResponse) => void;
};

const pendingRequests = new Map<string, PendingPermissionRequest>();

const toOption = (option: PermissionOption): AcpPermissionOption => ({
  id: option.optionId,
  kind: option.kind,
  name: option.name,
});

const rawInputTextFrom = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

const emitPermissionRequestsUpdated = (sessionId?: string): void => {
  emitAcpSse({
    type: 'permission_requests_updated',
    ...(sessionId !== undefined ? { sessionId } : {}),
  });
};

export const requestUserPermission = async (
  input: RequestPermissionRequest,
): Promise<RequestPermissionResponse> => {
  const id = crypto.randomUUID();
  const request: AcpPermissionRequest = {
    id,
    sessionId: input.sessionId,
    toolCallId: input.toolCall.toolCallId,
    title: input.toolCall.title ?? null,
    kind: input.toolCall.kind ?? null,
    rawInputText: rawInputTextFrom(input.toolCall.rawInput),
    options: input.options.map(toOption),
    createdAt: new Date().toISOString(),
  };

  return await new Promise<RequestPermissionResponse>((resolve) => {
    pendingRequests.set(id, { request, resolve });
    emitPermissionRequestsUpdated(input.sessionId);
  });
};

export const listPermissionRequests = (sessionId?: string): AcpPermissionRequestsResponse => {
  const requests = [...pendingRequests.values()]
    .map((entry) => entry.request)
    .filter((request) => sessionId === undefined || request.sessionId === sessionId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return parse(acpPermissionRequestsResponseSchema, { requests });
};

export const resolvePermissionRequest = ({
  optionId,
  requestId,
}: {
  readonly requestId: string;
  readonly optionId: PermissionOptionId | null;
}): boolean => {
  const entry = pendingRequests.get(requestId);
  if (entry === undefined) {
    return false;
  }

  pendingRequests.delete(requestId);
  const response: RequestPermissionResponse =
    optionId === null
      ? {
          outcome: {
            outcome: 'cancelled',
          },
        }
      : {
          outcome: {
            outcome: 'selected',
            optionId,
          },
        };
  entry.resolve(response);
  emitPermissionRequestsUpdated(entry.request.sessionId);
  return true;
};

export const cancelPermissionRequestsForSession = (sessionId: string): void => {
  const matching = [...pendingRequests.values()].filter(
    (entry) => entry.request.sessionId === sessionId,
  );

  for (const entry of matching) {
    pendingRequests.delete(entry.request.id);
    entry.resolve({
      outcome: {
        outcome: 'cancelled',
      },
    });
  }

  if (matching.length > 0) {
    emitPermissionRequestsUpdated(sessionId);
  }
};
