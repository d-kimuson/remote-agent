import inquirer from 'inquirer';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCliProgram, type ServeOptions } from './cli-program.pure.ts';
import { applyServeEnvOverrides } from './serve-options.pure.ts';
import { parseTcpPort } from './tailscale.pure.ts';

const generateApiKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
};

const getAvailablePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
          return;
        }
        reject(new Error('Failed to allocate an available local port.'));
      });
    });
  });
};

const confirmPrompt = async (message: string): Promise<boolean> => {
  const { confirmed } = await inquirer.prompt<{
    readonly confirmed: boolean;
  }>([
    {
      type: 'confirm',
      name: 'confirmed',
      default: true,
      message,
    },
  ]);
  return confirmed;
};

const logCheck = (message: string): void => {
  console.log(`✅ ${message}`);
};

const serve = async (options: ServeOptions): Promise<void> => {
  applyServeEnvOverrides(process.env, options);
  const [{ envService }, { startServer }] = await Promise.all([
    import('../server/env.ts'),
    import('../server/server.ts'),
  ]);
  const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
  const clientBuildDirectory = path.resolve(cliDirectory, 'client');
  const parsedLocalPort =
    options.port === undefined ? undefined : parseTcpPort(options.port, '--port');

  if (options.tailscale === undefined) {
    startServer({
      port: parsedLocalPort ?? envService.getEnv('PORT'),
      clientBuildDirectory: options.serverOnly === true ? undefined : clientBuildDirectory,
    });
    return;
  }

  const publicPort = parseTcpPort(options.tailscale, '--tailscale');
  const localPort = parsedLocalPort ?? (await getAvailablePort());
  const {
    ensureTailscaleCommandAvailable,
    readTailscaleStatus,
    renderTerminalQrCode,
    runTailscaleUp,
    startTailscaleServe,
    stopTailscaleServe,
  } = await import('./tailscale.ts');
  await ensureTailscaleCommandAvailable();
  logCheck('tailscale cli is installed');

  let tailscaleStatus = await readTailscaleStatus().catch(() => null);
  const shouldRunTailscaleUp =
    tailscaleStatus === null ||
    tailscaleStatus.BackendState !== 'Running' ||
    tailscaleStatus.HaveNodeKey !== true;

  if (shouldRunTailscaleUp) {
    const confirmed = await confirmPrompt(
      [
        'Tailscale is not ready for remote-agent.',
        'Run `tailscale up` now? If that fails, remote-agent will retry with sudo.',
      ].join('\n'),
    );
    if (!confirmed) {
      console.log('Canceled. Tailscale was not changed.');
      return;
    }
    await runTailscaleUp();
    tailscaleStatus = await readTailscaleStatus();
    logCheck('tailscale up completed');
  }

  logCheck('tailscale backend is running');
  logCheck('tailscale node key is available');

  const dnsName = tailscaleStatus?.Self?.DNSName?.trim();
  if (
    tailscaleStatus?.CurrentTailnet?.MagicDNSEnabled === false ||
    dnsName === undefined ||
    dnsName.length === 0
  ) {
    throw new Error(
      [
        'Tailscale MagicDNS is not ready.',
        'Enable MagicDNS in the Tailscale admin console, then rerun this command:',
        '  https://login.tailscale.com/admin/dns',
      ].join('\n'),
    );
  }
  logCheck('tailscale MagicDNS is enabled');
  const normalizedDnsName = dnsName.replace(/\.$/, '');
  logCheck(`tailscale DNS name is ${normalizedDnsName}`);

  const shouldConfigureTailscale = await confirmPrompt(
    [
      'Configure Tailscale Serve for remote-agent?',
      `This will run: tailscale serve --bg --https=${publicPort} http://127.0.0.1:${localPort}`,
    ].join('\n'),
  );

  if (!shouldConfigureTailscale) {
    console.log('Canceled. Tailscale Serve was not changed.');
    return;
  }

  const runningServer = startServer({
    port: localPort,
    hostname: '127.0.0.1',
    clientBuildDirectory: options.serverOnly === true ? undefined : clientBuildDirectory,
  });

  try {
    const { publicUrl } = await startTailscaleServe({ publicPort, localPort });
    const qrCode = await renderTerminalQrCode(publicUrl);

    console.log('');
    console.log('Tailscale connection ready');
    console.log(`  Local:     http://127.0.0.1:${localPort}`);
    console.log(`  Tailscale: ${publicUrl}`);
    console.log('');
    console.log('Open from another device in your tailnet:');
    console.log(`  ${publicUrl}`);
    console.log('');
    console.log(qrCode);

    const cleanUp = async (): Promise<void> => {
      console.log('');
      console.log('Cleaning up remote-agent...');
      runningServer.cleanUp();
      console.log('✅ remote-agent server stopped');
      try {
        await stopTailscaleServe(publicPort);
        console.log(`✅ tailscale serve --https=${publicPort} stopped`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to stop Tailscale Serve: ${message}`);
      }
    };

    const handleSignal = (_signal: NodeJS.Signals): void => {
      void cleanUp().finally(() => {
        process.exit(0);
      });
    };

    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
  } catch (error) {
    runningServer.cleanUp();
    try {
      await stopTailscaleServe(publicPort);
    } catch {
      // Ignore cleanup failures after a failed setup; the original setup error is more useful.
    }
    throw error;
  }
};

await createCliProgram({ generateApiKey, serve }).parseAsync();
