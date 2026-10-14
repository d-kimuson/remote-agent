import type { AcpPermissionOption } from '../../../../shared/acp.ts';

export const PERMISSION_HANDLING_MODES = ['ask', 'allow_all'] as const;

export type PermissionHandlingMode = (typeof PERMISSION_HANDLING_MODES)[number];

export const DEFAULT_PERMISSION_HANDLING_MODE: PermissionHandlingMode = 'ask';

export const isPermissionHandlingMode = (value: unknown): value is PermissionHandlingMode =>
  typeof value === 'string' && (PERMISSION_HANDLING_MODES as readonly string[]).includes(value);

export const permissionHandlingStorageKey = (projectId: string): string =>
  `remote-agent.permission-handling.${projectId}`;

/**
 * Prefer durable allow when present, otherwise one-shot allow.
 * Returns null when the request has no allow option (leave it for manual UI).
 */
export const pickAutoAllowPermissionOptionId = (
  options: readonly AcpPermissionOption[],
): string | null => {
  const allowAlways = options.find((option) => option.kind === 'allow_always');
  if (allowAlways !== undefined) {
    return allowAlways.id;
  }
  const allowOnce = options.find((option) => option.kind === 'allow_once');
  if (allowOnce !== undefined) {
    return allowOnce.id;
  }
  return null;
};
