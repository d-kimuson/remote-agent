import type { FC } from 'react';

import { useQuery } from '@tanstack/react-query';

import type { Project } from '../../shared/acp.ts';
import type { NativeAcpApi } from '../api/acp.ts';

import {
  BodyText,
  Button,
  ErrorState,
  LoadingState,
  Panel,
  Screen,
  ScreenScroll,
} from '../components/native-shell.tsx';

export const ProjectsScreen: FC<{
  readonly api: NativeAcpApi;
  readonly onOpenProject: (project: Project) => void;
  readonly onOpenProviders: () => void;
  readonly onOpenRoutines: () => void;
  readonly onOpenSettings: () => void;
}> = ({ api, onOpenProject, onOpenProviders, onOpenRoutines, onOpenSettings }) => {
  const projectsQuery = useQuery({
    queryKey: ['native', 'projects'],
    queryFn: api.fetchProjects,
  });

  if (projectsQuery.isLoading) {
    return <LoadingState label="Projects を読み込んでいます" />;
  }

  if (projectsQuery.error !== null) {
    return (
      <Screen
        action={
          <Button onPress={onOpenSettings} variant="ghost">
            Settings
          </Button>
        }
        title="Projects"
      >
        <ScreenScroll>
          <ErrorState
            message={projectsQuery.error.message}
            onRetry={() => {
              void projectsQuery.refetch();
            }}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  const projects = projectsQuery.data?.projects ?? [];

  return (
    <Screen
      action={
        <Button onPress={onOpenSettings} variant="ghost">
          Settings
        </Button>
      }
      title="Projects"
    >
      <ScreenScroll>
        <Panel>
          <BodyText muted>Native client settings and provider availability.</BodyText>
          <Button onPress={onOpenProviders} variant="secondary">
            Providers
          </Button>
          <Button onPress={onOpenRoutines} variant="secondary">
            Routines
          </Button>
          <Button onPress={onOpenSettings} variant="secondary">
            Connection settings
          </Button>
        </Panel>
        {projects.map((project) => (
          <Panel key={project.id}>
            <BodyText>{project.name}</BodyText>
            <BodyText muted>{project.workingDirectory}</BodyText>
            <Button
              onPress={() => {
                onOpenProject(project);
              }}
              variant="secondary"
            >
              Open
            </Button>
          </Panel>
        ))}
        {projects.length === 0 ? (
          <Panel>
            <BodyText muted>No projects found.</BodyText>
          </Panel>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
};
