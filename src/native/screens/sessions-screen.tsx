import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FC } from 'react';

import type { Project, SessionSummary } from '../../shared/acp.ts';
import type { NativeAcpApi } from '../api/acp.ts';

import {
  BodyText,
  Button,
  ErrorState,
  FieldLabel,
  LoadingState,
  Panel,
  Screen,
  ScreenScroll,
  TextField,
} from '../components/native-shell.tsx';
import { worktreeRequestFromDraft } from '../session-options.pure.ts';

const sessionTimestamp = (session: SessionSummary): string =>
  session.updatedAt ?? session.createdAt;

const sortedProjectSessions = (
  sessions: readonly SessionSummary[],
  projectId: string,
): readonly SessionSummary[] =>
  sessions
    .filter((session) => session.projectId === projectId)
    .sort((left, right) => sessionTimestamp(right).localeCompare(sessionTimestamp(left)));

export const SessionsScreen: FC<{
  readonly api: NativeAcpApi;
  readonly project: Project;
  readonly onBack: () => void;
  readonly onOpenChat: (session: SessionSummary | null, cwdOverride: string | null) => void;
  readonly onOpenSettings: () => void;
}> = ({ api, onBack, onOpenChat, onOpenSettings, project }) => {
  const [createWorktree, setCreateWorktree] = useState(false);
  const [worktreeName, setWorktreeName] = useState('');
  const [worktreeBranchName, setWorktreeBranchName] = useState('');
  const [worktreeBaseRef, setWorktreeBaseRef] = useState('');
  const sessionsQuery = useQuery({
    queryKey: ['native', 'sessions'],
    queryFn: api.fetchSessions,
  });
  const worktreeMutation = useMutation({
    mutationFn: ({
      projectId,
      request,
    }: {
      readonly projectId: string;
      readonly request: NonNullable<ReturnType<typeof worktreeRequestFromDraft>>;
    }) => api.createProjectWorktree(projectId, request),
  });

  const handleNewSession = async (): Promise<void> => {
    if (!createWorktree) {
      onOpenChat(null, null);
      return;
    }
    const request = worktreeRequestFromDraft({
      name: worktreeName,
      branchName: worktreeBranchName,
      baseRef: worktreeBaseRef,
    });
    if (request === null) {
      return;
    }
    const response = await worktreeMutation.mutateAsync({
      projectId: project.id,
      request,
    });
    onOpenChat(null, response.worktree.path);
  };

  if (sessionsQuery.isLoading) {
    return <LoadingState label="Sessions を読み込んでいます" />;
  }

  if (sessionsQuery.error !== null) {
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
        title={project.name}
      >
        <ScreenScroll>
          <ErrorState
            message={sessionsQuery.error.message}
            onRetry={() => {
              void sessionsQuery.refetch();
            }}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  const projectSessions = sortedProjectSessions(sessionsQuery.data?.sessions ?? [], project.id);

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
      title={project.name}
    >
      <ScreenScroll>
        <Panel>
          <BodyText muted>{project.workingDirectory}</BodyText>
          <Button
            onPress={() => {
              void handleNewSession();
            }}
            disabled={worktreeMutation.isPending}
          >
            {worktreeMutation.isPending ? 'Creating...' : 'New session'}
          </Button>
          <Button
            onPress={() => {
              setCreateWorktree(!createWorktree);
            }}
            variant="secondary"
          >
            {createWorktree ? 'Use project directory' : 'Create worktree'}
          </Button>
          {createWorktree ? (
            <>
              <FieldLabel>Worktree name</FieldLabel>
              <TextField
                onChangeText={setWorktreeName}
                placeholder="feature-x"
                value={worktreeName}
              />
              <FieldLabel>Branch name</FieldLabel>
              <TextField
                onChangeText={setWorktreeBranchName}
                placeholder="Optional"
                value={worktreeBranchName}
              />
              <FieldLabel>Base ref</FieldLabel>
              <TextField
                onChangeText={setWorktreeBaseRef}
                placeholder="Optional"
                value={worktreeBaseRef}
              />
            </>
          ) : null}
          {worktreeMutation.error !== null ? (
            <BodyText>{worktreeMutation.error.message}</BodyText>
          ) : null}
        </Panel>
        {projectSessions.map((session) => (
          <Panel key={session.sessionId}>
            <BodyText>
              {session.title ?? session.firstUserMessagePreview ?? session.sessionId}
            </BodyText>
            <BodyText muted>{session.cwd}</BodyText>
            <BodyText muted>{session.status}</BodyText>
            <Button
              onPress={() => {
                onOpenChat(session, null);
              }}
              variant="secondary"
            >
              Open chat
            </Button>
          </Panel>
        ))}
        {projectSessions.length === 0 ? (
          <Panel>
            <BodyText muted>No sessions yet.</BodyText>
          </Panel>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
};
