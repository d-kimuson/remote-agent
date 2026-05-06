import { ACPLanguageModel } from '@mcpc-tech/acp-ai-provider';

const patchMarker = Symbol.for('remote-agent.acp-provider-process-error-patch');
const listenerMarker = Symbol.for('remote-agent.acp-provider-process-error-listener');

type ProcessErrorEmitter = {
  readonly on: (event: 'error', listener: (error: Error) => void) => unknown;
  readonly spawnfile?: unknown;
};

const isProcessErrorEmitter = (value: unknown): value is ProcessErrorEmitter => {
  return (
    value !== null && typeof value === 'object' && typeof Reflect.get(value, 'on') === 'function'
  );
};

const isPromiseLike = (value: unknown): value is Promise<unknown> => {
  return (
    value !== null && typeof value === 'object' && typeof Reflect.get(value, 'then') === 'function'
  );
};

const childProcessCommand = (childProcess: ProcessErrorEmitter): string => {
  const { spawnfile } = childProcess;
  if (typeof spawnfile === 'string' && spawnfile.length > 0) {
    return spawnfile;
  }
  return 'ACP provider process';
};

const toProcessStartError = (childProcess: ProcessErrorEmitter, error: Error): Error => {
  const message = `Failed to start ACP provider process: ${childProcessCommand(childProcess)}: ${error.message}`;
  const wrapped = new Error(message);
  wrapped.cause = error;
  return wrapped;
};

const attachProcessErrorRace = (model: unknown, promise: Promise<unknown>): Promise<unknown> => {
  if (model === null || typeof model !== 'object') {
    return promise;
  }
  const childProcess: unknown = Reflect.get(model, 'agentProcess');
  if (!isProcessErrorEmitter(childProcess)) {
    return promise;
  }
  if (Reflect.get(childProcess, listenerMarker) === true) {
    return promise;
  }

  Reflect.set(childProcess, listenerMarker, true);
  const processError = new Promise<never>((_, reject) => {
    childProcess.on('error', (error: Error) => {
      const wrapped = toProcessStartError(childProcess, error);
      console.error(wrapped.message);
      reject(wrapped);
    });
  });

  return Promise.race([promise, processError]);
};

export const installAcpProviderProcessErrorPatch = (): void => {
  const prototype = ACPLanguageModel.prototype;
  if (Reflect.get(prototype, patchMarker) === true) {
    return;
  }

  const original: unknown = Reflect.get(prototype, 'connectClient');
  if (typeof original !== 'function') {
    return;
  }

  Reflect.set(
    prototype,
    'connectClient',
    function patchedConnectClient(this: unknown, ...args: readonly unknown[]): unknown {
      const result: unknown = Reflect.apply(original, this, args);
      if (!isPromiseLike(result)) {
        return result;
      }
      return attachProcessErrorRace(this, result);
    },
  );
  Reflect.set(prototype, patchMarker, true);
};
