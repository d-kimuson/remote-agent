import { describe, expect, test } from 'vitest';

import type { AcpPermissionOption } from '../../../../shared/acp.ts';

import {
  isPermissionHandlingMode,
  permissionHandlingStorageKey,
  pickAutoAllowPermissionOptionId,
} from './permission-handling.pure.ts';

const option = (id: string, kind: AcpPermissionOption['kind']): AcpPermissionOption => ({
  id,
  kind,
  name: id,
});

describe('isPermissionHandlingMode', () => {
  test('accepts known modes', () => {
    expect(isPermissionHandlingMode('ask')).toBe(true);
    expect(isPermissionHandlingMode('allow_all')).toBe(true);
    expect(isPermissionHandlingMode('nope')).toBe(false);
  });
});

describe('permissionHandlingStorageKey', () => {
  test('scopes by project', () => {
    expect(permissionHandlingStorageKey('proj-1')).toBe('remote-agent.permission-handling.proj-1');
  });
});

describe('pickAutoAllowPermissionOptionId', () => {
  test('prefers allow_always over allow_once', () => {
    expect(
      pickAutoAllowPermissionOptionId([
        option('once', 'allow_once'),
        option('always', 'allow_always'),
      ]),
    ).toBe('always');
  });

  test('falls back to allow_once', () => {
    expect(pickAutoAllowPermissionOptionId([option('once', 'allow_once')])).toBe('once');
  });

  test('returns null when no allow option exists', () => {
    expect(
      pickAutoAllowPermissionOptionId([
        option('reject', 'reject_once'),
        option('reject-always', 'reject_always'),
      ]),
    ).toBeNull();
  });
});
