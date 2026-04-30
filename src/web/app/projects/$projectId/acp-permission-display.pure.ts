import type { AcpPermissionOption } from '../../../../shared/acp.ts';

export const formatAcpPermissionOptionLabel = (option: AcpPermissionOption): string =>
  option.kind === 'allow_always' ? 'Allow and remember choice' : option.name;
