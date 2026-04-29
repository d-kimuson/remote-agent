import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';

import type { ChatMessage, Project, SessionSummary } from '../../shared/acp.ts';
import type { NativeAcpApi } from '../api/acp.ts';

import {
  BodyText,
  Button,
  ErrorState,
  FieldLabel,
  LoadingState,
  Panel,
  RowButton,
  Screen,
  ScreenScroll,
  TextField,
} from '../components/native-shell.tsx';
import {
  defaultPresetId,
  enabledProviderPresets,
  optionDisplayName,
  preferredModeIds,
  preferredModelIds,
  resolveSelectableOptionId,
} from '../session-options.pure.ts';

const messageLabel = (message: ChatMessage): string => (message.role === 'user' ? 'You' : 'Agent');

export const ChatScreen: FC<{
  readonly api: NativeAcpApi;
  readonly initialSession: SessionSummary | null;
  readonly initialCwd: string | null;
  readonly project: Project;
  readonly onBack: () => void;
  readonly onOpenSettings: () => void;
}> = ({ api, initialCwd, initialSession, onBack, onOpenSettings, project }) => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionSummary | null>(initialSession);
  const [prompt, setPrompt] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    initialSession?.presetId ?? null,
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    initialSession?.currentModelId ?? null,
  );
  const [selectedModeId, setSelectedModeId] = useState<string | null>(
    initialSession?.currentModeId ?? null,
  );
  const providersQuery = useQuery({
    queryKey: ['native', 'providers'],
    queryFn: api.fetchAgentProviders,
  });
  const projectSettingsQuery = useQuery({
    queryKey: ['native', 'project-settings', project.id],
    queryFn: () => api.fetchProjectSettings(project.id),
  });
  const enabledPresets = useMemo(
    () => enabledProviderPresets(providersQuery.data?.providers ?? []),
    [providersQuery.data?.providers],
  );
  const activePresetId =
    session?.presetId ?? selectedPresetId ?? defaultPresetId(enabledPresets) ?? null;
  const activePreset =
    activePresetId === null
      ? null
      : (enabledPresets.find((preset) => preset.id === activePresetId) ?? null);
  const catalogQuery = useQuery({
    enabled: activePresetId !== null,
    queryKey: ['native', 'agent-model-catalog', project.id, activePresetId ?? ''],
    queryFn: () =>
      activePresetId === null
        ? Promise.resolve({
            availableModels: [],
            availableModes: [],
            currentModelId: null,
            currentModeId: null,
            lastError: null,
          })
        : api.fetchAgentModelCatalog({ projectId: project.id, presetId: activePresetId }),
  });
  const messagesQuery = useQuery({
    enabled: session !== null,
    queryKey: ['native', 'session-messages', session?.sessionId ?? 'draft'],
    queryFn: () =>
      session === null
        ? Promise.resolve({ messages: [] })
        : api.fetchSessionMessages(session.sessionId),
  });
  const messages = messagesQuery.data?.messages ?? [];
  const modelOptions =
    session !== null && session.availableModels.length > 0
      ? session.availableModels
      : (catalogQuery.data?.availableModels ?? []);
  const modeOptions =
    session !== null && session.availableModes.length > 0
      ? session.availableModes
      : (catalogQuery.data?.availableModes ?? []);
  const effectiveModelId = resolveSelectableOptionId({
    explicitId: selectedModelId,
    currentId: session?.currentModelId ?? catalogQuery.data?.currentModelId ?? null,
    preferredIds: preferredModelIds(
      projectSettingsQuery.data?.settings.modelPreferences ?? [],
      activePresetId,
    ),
    options: modelOptions,
  });
  const effectiveModeId = resolveSelectableOptionId({
    explicitId: selectedModeId,
    currentId: session?.currentModeId ?? catalogQuery.data?.currentModeId ?? null,
    preferredIds: preferredModeIds(
      projectSettingsQuery.data?.settings.modePreferences ?? [],
      activePresetId,
    ),
    options: modeOptions,
  });

  const createSessionMutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (response) => {
      setSession(response.session);
      void queryClient.invalidateQueries({ queryKey: ['native', 'sessions'] });
    },
  });
  const updateSessionMutation = useMutation({
    mutationFn: ({
      modelId,
      modeId,
      targetSessionId,
    }: {
      readonly targetSessionId: string;
      readonly modelId?: string | null;
      readonly modeId?: string | null;
    }) => api.updateSession(targetSessionId, { modelId, modeId }),
    onSuccess: (response) => {
      setSession(response.session);
      void queryClient.invalidateQueries({ queryKey: ['native', 'sessions'] });
    },
  });
  const sendPromptMutation = useMutation({
    mutationFn: ({
      nextPrompt,
      targetSession,
    }: {
      readonly nextPrompt: string;
      readonly targetSession: SessionSummary;
    }) =>
      api.sendPrompt(targetSession.sessionId, {
        prompt: nextPrompt,
        attachmentIds: [],
        modelId: effectiveModelId,
        modeId: effectiveModeId,
      }),
    onSuccess: (response) => {
      setSession(response.session);
      setPrompt('');
      void queryClient.invalidateQueries({ queryKey: ['native', 'sessions'] });
      void queryClient.invalidateQueries({
        queryKey: ['native', 'session-messages', response.session.sessionId],
      });
    },
  });

  const handleSend = async () => {
    const nextPrompt = prompt.trim();
    if (nextPrompt.length === 0 || activePresetId === null) {
      return;
    }

    const targetSession =
      session ??
      (
        await createSessionMutation.mutateAsync({
          projectId: project.id,
          presetId: activePresetId,
          command: null,
          argsText: '',
          cwd: initialCwd ?? project.workingDirectory,
          modelId: effectiveModelId,
          modeId: effectiveModeId,
        })
      ).session;

    await sendPromptMutation.mutateAsync({ nextPrompt, targetSession });
  };

  const handleSelectModel = (modelId: string): void => {
    setSelectedModelId(modelId);
    if (activePresetId !== null) {
      api
        .updateProjectModelPreference(project.id, {
          presetId: activePresetId,
          modelId,
          markLastUsed: true,
        })
        .then((response) => {
          queryClient.setQueryData(['native', 'project-settings', project.id], response);
        })
        .catch(() => undefined);
    }
    if (session?.isActive === true) {
      updateSessionMutation.mutate({ targetSessionId: session.sessionId, modelId });
    }
  };

  const handleSelectMode = (modeId: string): void => {
    setSelectedModeId(modeId);
    if (activePresetId !== null) {
      api
        .updateProjectModePreference(project.id, {
          presetId: activePresetId,
          modeId,
          markLastUsed: true,
        })
        .then((response) => {
          queryClient.setQueryData(['native', 'project-settings', project.id], response);
        })
        .catch(() => undefined);
    }
    if (session?.isActive === true) {
      updateSessionMutation.mutate({ targetSessionId: session.sessionId, modeId });
    }
  };

  const isBusy =
    createSessionMutation.isPending ||
    sendPromptMutation.isPending ||
    updateSessionMutation.isPending;
  const canSend = prompt.trim().length > 0 && activePresetId !== null && !isBusy;
  const error =
    providersQuery.error?.message ??
    catalogQuery.error?.message ??
    messagesQuery.error?.message ??
    createSessionMutation.error?.message ??
    updateSessionMutation.error?.message ??
    sendPromptMutation.error?.message ??
    catalogQuery.data?.lastError ??
    null;

  if (providersQuery.isLoading || (session !== null && messagesQuery.isLoading)) {
    return <LoadingState label="Chat を読み込んでいます" />;
  }

  return (
    <Screen
      action={
        <>
          <Button onPress={onOpenSettings} variant="ghost">
            Settings
          </Button>
          <Button onPress={onBack} variant="ghost">
            Back
          </Button>
        </>
      }
      title={session?.title ?? session?.firstUserMessagePreview ?? 'New session'}
    >
      <ScreenScroll>
        {error !== null ? <ErrorState message={error} /> : null}
        <Panel>
          <BodyText muted>{activePreset?.label ?? 'No enabled provider'}</BodyText>
          <BodyText muted>{session?.cwd ?? initialCwd ?? project.workingDirectory}</BodyText>
          {session === null ? (
            <>
              <FieldLabel>Provider</FieldLabel>
              {enabledPresets.map((preset) => (
                <RowButton
                  detail={preset.description}
                  key={preset.id}
                  label={preset.label}
                  onPress={() => {
                    setSelectedPresetId(preset.id);
                    setSelectedModelId(null);
                    setSelectedModeId(null);
                  }}
                  selected={preset.id === activePresetId}
                />
              ))}
            </>
          ) : null}
          {modelOptions.length > 0 ? (
            <>
              <FieldLabel>{activePreset?.modelSelectLabel ?? 'Model'}</FieldLabel>
              {modelOptions.map((model) => (
                <RowButton
                  detail={model.description ?? model.id}
                  key={model.id}
                  label={optionDisplayName(model)}
                  onPress={() => {
                    handleSelectModel(model.id);
                  }}
                  selected={model.id === effectiveModelId}
                />
              ))}
            </>
          ) : null}
          {modeOptions.length > 0 ? (
            <>
              <FieldLabel>{activePreset?.modeSelectLabel ?? 'Mode'}</FieldLabel>
              {modeOptions.map((mode) => (
                <RowButton
                  detail={mode.description ?? mode.id}
                  key={mode.id}
                  label={optionDisplayName(mode)}
                  onPress={() => {
                    handleSelectMode(mode.id);
                  }}
                  selected={mode.id === effectiveModeId}
                />
              ))}
            </>
          ) : null}
          {session !== null ? (
            <Button
              onPress={() => {
                void messagesQuery.refetch();
              }}
              variant="secondary"
            >
              Refresh messages
            </Button>
          ) : null}
        </Panel>
        {messages.map((message) => (
          <Panel key={message.id}>
            <BodyText>{messageLabel(message)}</BodyText>
            <BodyText muted>{message.text}</BodyText>
          </Panel>
        ))}
        {messages.length === 0 ? (
          <Panel>
            <BodyText muted>下の欄に入力して会話を始められます。</BodyText>
          </Panel>
        ) : null}
        <Panel>
          <FieldLabel>Prompt</FieldLabel>
          <TextField
            multiline
            onChangeText={setPrompt}
            placeholder="Ask the agent..."
            value={prompt}
          />
          <Button
            disabled={!canSend}
            onPress={() => {
              void handleSend();
            }}
          >
            {isBusy ? 'Sending...' : 'Send'}
          </Button>
        </Panel>
      </ScreenScroll>
    </Screen>
  );
};
