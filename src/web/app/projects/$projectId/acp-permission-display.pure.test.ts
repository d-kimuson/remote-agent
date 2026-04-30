import { describe, expect, test } from 'vitest';

import type { AcpPermissionOption } from '../../../../shared/acp.ts';

import {
  formatAcpPermissionOptionLabel,
  permissionRequestVisualInputText,
} from './acp-permission-display.pure.ts';

const option = (input: AcpPermissionOption): AcpPermissionOption => input;

describe('formatAcpPermissionOptionLabel', () => {
  test('uses ACP wording for allow_always options', () => {
    expect(
      formatAcpPermissionOptionLabel(
        option({
          id: 'allow-always',
          kind: 'allow_always',
          name: 'Always Allow',
        }),
      ),
    ).toBe('Allow and remember choice');
  });

  test('preserves provider labels for other option kinds', () => {
    expect(
      formatAcpPermissionOptionLabel(
        option({
          id: 'allow-once',
          kind: 'allow_once',
          name: 'Allow',
        }),
      ),
    ).toBe('Allow');
  });
});

describe('permissionRequestVisualInputText', () => {
  test('rawInputText を優先する', () => {
    expect(
      permissionRequestVisualInputText({
        rawInputText: '{"command":"date"}',
        title: '`date`',
      }),
    ).toBe('{"command":"date"}');
  });

  test('rawInputText がないとき inline code の title を visual 入力に使う', () => {
    expect(
      permissionRequestVisualInputText({
        rawInputText: null,
        title: '`date`',
      }),
    ).toBe('`date`');
  });

  test('rawInputText がない通常 title は visual 入力にしない', () => {
    expect(
      permissionRequestVisualInputText({
        rawInputText: null,
        title: 'Preview Request',
      }),
    ).toBeNull();
  });
});
