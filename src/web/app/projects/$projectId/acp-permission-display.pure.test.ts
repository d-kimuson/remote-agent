import { describe, expect, test } from 'vitest';

import type { AcpPermissionOption } from '../../../../shared/acp.ts';

import { formatAcpPermissionOptionLabel } from './acp-permission-display.pure.ts';

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
