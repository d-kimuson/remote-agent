import type { AcpPermissionOption, AcpPermissionRequest } from '../../../../shared/acp.ts';

export const formatAcpPermissionOptionLabel = (option: AcpPermissionOption): string =>
  option.kind === 'allow_always' ? 'Allow and remember choice' : option.name;

const inlineCommandText = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2 ? trimmed : null;
};

export const permissionRequestVisualInputText = (
  request: Pick<AcpPermissionRequest, 'rawInputText' | 'title'>,
): string | null => request.rawInputText ?? inlineCommandText(request.title);
