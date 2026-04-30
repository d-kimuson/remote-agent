import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';

import type {
  AgentProviderStatus,
  AgentPreset,
  SessionSummary,
  SessionsResponse,
} from '../../../../shared/acp.ts';

import { fetchResumableSessions, loadSessionRequest } from '../../../lib/api/acp.ts';
import { LoadSessionDialog } from './load-session-dialog.tsx';
import { isLoadableProviderPresetId } from './project-session-list.pure.ts';
import { sessionsQueryKey } from './queries.ts';

const selectableLoadProviders = (
  providers: readonly AgentProviderStatus[],
): readonly AgentPreset[] =>
  providers
    .filter((entry) => entry.enabled && isLoadableProviderPresetId(entry.preset.id))
    .map((entry) => entry.preset);

export const useLoadSessionDialog = ({
  projectId,
  providers,
  workingDirectory,
}: {
  readonly projectId: string;
  readonly providers: readonly AgentProviderStatus[];
  readonly workingDirectory: string;
}): {
  readonly canLoadSessions: boolean;
  readonly dialog: ReactNode;
  readonly openLoadSessionDialog: () => void;
} => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectablePresets = useMemo(() => selectableLoadProviders(providers), [providers]);
  const [isOpen, setIsOpen] = useState(false);
  const [loadPresetId, setLoadPresetId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const loadSessionMutation = useMutation({
    mutationFn: loadSessionRequest,
  });
  const discoverResumableSessionsMutation = useMutation({
    mutationFn: fetchResumableSessions,
  });

  const setSessionsData = (updater: (sessions: readonly SessionSummary[]) => SessionSummary[]) => {
    queryClient.setQueryData<SessionsResponse>(sessionsQueryKey, (current) =>
      current === undefined
        ? current
        : {
            sessions: updater(current.sessions),
          },
    );
  };

  const upsertSessionInCache = (session: SessionSummary) => {
    setSessionsData((currentSessions) =>
      currentSessions.some((entry) => entry.sessionId === session.sessionId)
        ? currentSessions.map((entry) => (entry.sessionId === session.sessionId ? session : entry))
        : [session, ...currentSessions],
    );
  };

  const closeLoadSessionDialog = () => {
    setIsOpen(false);
    setLoadPresetId(null);
    discoverResumableSessionsMutation.reset();
  };

  const openLoadSessionDialog = () => {
    setLoadPresetId(null);
    discoverResumableSessionsMutation.reset();
    setIsOpen(true);
  };

  const handleSelectLoadProvider = (presetId: string) => {
    setLoadPresetId(presetId);
    discoverResumableSessionsMutation.reset();
    discoverResumableSessionsMutation.mutate({
      projectId,
      presetId,
      cwd: workingDirectory,
    });
  };

  const handleLoadExistingSessions = async (
    selectedSessions: readonly {
      readonly sessionId: string;
      readonly title: string | null | undefined;
      readonly updatedAt: string | null | undefined;
    }[],
  ) => {
    if (loadPresetId === null || selectedSessions.length === 0) {
      return;
    }

    setIsLoadingSessions(true);
    try {
      for (const session of selectedSessions) {
        const response = await loadSessionMutation.mutateAsync({
          projectId,
          presetId: loadPresetId,
          sessionId: session.sessionId,
          cwd: workingDirectory,
          title: session.title ?? null,
          updatedAt: session.updatedAt ?? null,
        });

        upsertSessionInCache({
          ...response.session,
          sessionId: session.sessionId,
        });
      }

      const firstSession = selectedSessions[0];
      closeLoadSessionDialog();
      if (firstSession !== undefined) {
        void navigate({
          to: '/projects/$projectId',
          params: { projectId },
          search: { 'session-id': firstSession.sessionId },
          replace: true,
        });
      }
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  return {
    canLoadSessions: selectablePresets.length > 0,
    openLoadSessionDialog,
    dialog: isOpen ? (
      <LoadSessionDialog
        capability={
          loadPresetId === null
            ? null
            : (discoverResumableSessionsMutation.data?.capability ?? null)
        }
        error={
          discoverResumableSessionsMutation.error instanceof Error
            ? discoverResumableSessionsMutation.error
            : null
        }
        isLoading={discoverResumableSessionsMutation.isPending}
        isLoadingSession={loadSessionMutation.isPending || isLoadingSessions}
        onClose={closeLoadSessionDialog}
        onLoadSessions={(sessions) => {
          void handleLoadExistingSessions(sessions);
        }}
        onSelectProvider={handleSelectLoadProvider}
        providerPresets={selectablePresets}
        selectedProviderId={loadPresetId}
        sessions={
          loadPresetId === null ? [] : (discoverResumableSessionsMutation.data?.sessions ?? [])
        }
      />
    ) : null,
  };
};
