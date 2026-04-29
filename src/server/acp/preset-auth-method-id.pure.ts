const AUTH_METHOD_ID_BY_PRESET_ID: Readonly<Record<string, string>> = {
  codex: 'chatgpt',
};

export const resolveAuthMethodIdForPresetId = (presetId: string | null | undefined) => {
  if (presetId === null || presetId === undefined || presetId.length === 0) {
    return undefined;
  }
  return AUTH_METHOD_ID_BY_PRESET_ID[presetId];
};
