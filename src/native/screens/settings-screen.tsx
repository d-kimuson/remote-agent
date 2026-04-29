import { useState, type FC } from 'react';

import {
  connectionSettingsReady,
  normalizeConnectionSettings,
  type ConnectionSettings,
} from '../../shared/connection-settings.pure.ts';
import {
  BodyText,
  Button,
  FieldLabel,
  Panel,
  Screen,
  ScreenScroll,
  TextField,
} from '../components/native-shell.tsx';

export const SettingsScreen: FC<{
  readonly initialSettings: ConnectionSettings | null;
  readonly onCancel?: () => void;
  readonly onSave: (settings: ConnectionSettings) => Promise<void>;
}> = ({ initialSettings, onCancel, onSave }) => {
  const [serverUrl, setServerUrl] = useState(initialSettings?.serverUrl ?? '');
  const [apiKey, setApiKey] = useState(initialSettings?.apiKey ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = normalizeConnectionSettings({ serverUrl, apiKey });
  const canSave = connectionSettingsReady(settings) && !saving;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(settings);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Remote Agent">
      <ScreenScroll>
        <Panel>
          <BodyText>接続する Remote Agent server の URL と API key を設定してください。</BodyText>
          <FieldLabel>Server URL</FieldLabel>
          <TextField
            onChangeText={setServerUrl}
            placeholder="https://remote-agent.example.com"
            value={serverUrl}
          />
          <FieldLabel>API key</FieldLabel>
          <TextField
            onChangeText={setApiKey}
            placeholder="Optional bearer token"
            secureTextEntry
            value={apiKey}
          />
          {error !== null ? <BodyText>{error}</BodyText> : null}
          <Button
            disabled={!canSave}
            onPress={() => {
              void handleSave();
            }}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
          {onCancel !== undefined ? (
            <Button disabled={saving} onPress={onCancel} variant="secondary">
              Cancel
            </Button>
          ) : null}
        </Panel>
      </ScreenScroll>
    </Screen>
  );
};
