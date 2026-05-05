import { parse } from 'valibot';

import { acpSseEventSchema, type AcpSseEvent } from '../../../shared/acp.ts';

const subscribers = new Set<(line: string) => void>();
let nextSequence = 1;

export const nextAcpSseSequence = (): number => {
  const sequence = nextSequence;
  nextSequence += 1;
  return sequence;
};

export const subscribeAcpSse = (onLine: (line: string) => void): (() => void) => {
  subscribers.add(onLine);
  return () => {
    subscribers.delete(onLine);
  };
};

export const emitAcpSse = (input: AcpSseEvent): void => {
  const line = JSON.stringify(parse(acpSseEventSchema, input));
  for (const notify of subscribers) {
    notify(line);
  }
};
