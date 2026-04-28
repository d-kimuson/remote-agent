import type { AcpSseEvent } from '../../../shared/acp.ts';

export const ACP_SSE_BROWSER_EVENT = 'acp:sse-event';

export const dispatchAcpSseBrowserEvent = (event: AcpSseEvent): void => {
  window.dispatchEvent(new CustomEvent<AcpSseEvent>(ACP_SSE_BROWSER_EVENT, { detail: event }));
};
