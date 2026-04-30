import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import * as v from 'valibot';

import { buildTailscaleHttpsUrl } from './tailscale.pure.ts';

const execFileAsync = promisify(execFile);

const tailscaleStatusSchema = v.object({
  BackendState: v.optional(v.string()),
  HaveNodeKey: v.optional(v.boolean()),
  AuthURL: v.optional(v.string()),
  CurrentTailnet: v.optional(
    v.object({
      MagicDNSEnabled: v.optional(v.boolean()),
    }),
  ),
  Self: v.optional(
    v.object({
      DNSName: v.optional(v.string()),
    }),
  ),
});

type TailscaleServeConfig = {
  readonly publicPort: number;
  readonly localPort: number;
};

type TailscaleServeResult = {
  readonly publicUrl: string;
};

export type TailscaleStatus = v.InferOutput<typeof tailscaleStatusSchema>;

const errorOutput = (error: unknown, options?: { readonly includeOutput?: boolean }): string => {
  if (options?.includeOutput === false) {
    return '';
  }
  if (typeof error !== 'object' || error === null) {
    return '';
  }

  const outputs: string[] = [];
  if ('stdout' in error && typeof error.stdout === 'string' && error.stdout.trim().length > 0) {
    outputs.push(error.stdout.trim());
  }
  if ('stderr' in error && typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
    outputs.push(error.stderr.trim());
  }
  return outputs.length === 0 ? '' : `\n${outputs.join('\n')}`;
};

const execCommand = async (
  command: string,
  args: readonly string[],
  options?: { readonly includeErrorOutput?: boolean },
): Promise<string> => {
  try {
    const { stdout } = await execFileAsync(command, [...args], {
      encoding: 'utf8',
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${command} ${args.join(' ')} failed: ${message}${errorOutput(error, {
        includeOutput: options?.includeErrorOutput,
      })}`,
    );
  }
};

const execTailscale = async (
  args: readonly string[],
  options?: { readonly includeErrorOutput?: boolean },
): Promise<string> => {
  return execCommand('tailscale', args, options);
};

const execSudoTailscale = async (
  args: readonly string[],
  options?: { readonly includeErrorOutput?: boolean },
): Promise<string> => {
  return execCommand('sudo', ['tailscale', ...args], options);
};

export const readTailscaleStatus = async (): Promise<TailscaleStatus> => {
  const stdout = await execTailscale(['status', '--json']);
  const parsedJson: unknown = JSON.parse(stdout);
  return v.parse(tailscaleStatusSchema, parsedJson);
};

const readTailscaleDnsName = async (): Promise<string> => {
  const status = await readTailscaleStatus();
  const dnsName = status.Self?.DNSName?.trim();
  if (dnsName === undefined || dnsName.length === 0) {
    throw new Error(
      'Tailscale DNS name was not found. Check that Tailscale is up and MagicDNS is enabled.',
    );
  }
  return dnsName;
};

export const ensureTailscaleCommandAvailable = async (): Promise<void> => {
  try {
    await execTailscale(['version'], { includeErrorOutput: false });
  } catch {
    throw new Error(
      [
        'Tailscale CLI was not found or is not executable.',
        'Install Tailscale and log in before using --tailscale:',
        '  https://tailscale.com/download',
      ].join('\n'),
    );
  }
};

export const runTailscaleUp = async (): Promise<void> => {
  try {
    await execTailscale(['up'], { includeErrorOutput: true });
  } catch {
    await execSudoTailscale(['up'], { includeErrorOutput: true });
  }
};

export const startTailscaleServe = async (
  config: TailscaleServeConfig,
): Promise<TailscaleServeResult> => {
  const args = [
    'serve',
    '--bg',
    `--https=${config.publicPort}`,
    `http://127.0.0.1:${config.localPort}`,
  ] as const;

  try {
    await execTailscale(args, { includeErrorOutput: false });
  } catch {
    await execSudoTailscale(args);
  }

  const dnsName = await readTailscaleDnsName();
  return {
    publicUrl: buildTailscaleHttpsUrl(dnsName, config.publicPort),
  };
};

export const stopTailscaleServe = async (publicPort: number): Promise<void> => {
  const args = ['serve', `--https=${publicPort}`, 'off'] as const;
  try {
    await execTailscale(args, { includeErrorOutput: false });
  } catch {
    await execSudoTailscale(args);
  }
};

export const renderTerminalQrCode = async (text: string): Promise<string> => {
  return QRCode.toString(text, {
    type: 'terminal',
    small: true,
  });
};
