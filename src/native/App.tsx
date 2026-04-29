import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Project, SessionSummary } from '../shared/acp.ts';

import {
  connectionSettingsReady,
  type ConnectionSettings,
} from '../shared/connection-settings.pure.ts';
import { createNativeAcpApi } from './api/acp.ts';
import { LoadingState } from './components/native-shell.tsx';
import { ChatScreen } from './screens/chat-screen.tsx';
import { ProjectsScreen } from './screens/projects-screen.tsx';
import { ProvidersScreen } from './screens/providers-screen.tsx';
import { RoutinesScreen } from './screens/routines-screen.tsx';
import { SessionsScreen } from './screens/sessions-screen.tsx';
import { SettingsScreen } from './screens/settings-screen.tsx';
import {
  loadConnectionSettings,
  saveConnectionSettings,
} from './storage/connection-settings-storage.ts';

type AppState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'settings'; readonly settings: ConnectionSettings | null }
  | { readonly kind: 'projects'; readonly settings: ConnectionSettings }
  | { readonly kind: 'providers'; readonly settings: ConnectionSettings }
  | { readonly kind: 'routines'; readonly settings: ConnectionSettings }
  | { readonly kind: 'sessions'; readonly settings: ConnectionSettings; readonly project: Project }
  | {
      readonly kind: 'chat';
      readonly settings: ConnectionSettings;
      readonly project: Project;
      readonly session: SessionSummary | null;
      readonly cwdOverride: string | null;
    };

const queryClient = new QueryClient();

const AppContent: FC = () => {
  const [state, setState] = useState<AppState>({ kind: 'loading' });

  useEffect(() => {
    let ignore = false;
    void loadConnectionSettings()
      .then((settings) => {
        if (ignore) {
          return;
        }
        if (settings !== null && connectionSettingsReady(settings)) {
          setState({ kind: 'projects', settings });
          return;
        }
        setState({ kind: 'settings', settings });
      })
      .catch(() => {
        if (!ignore) {
          setState({ kind: 'settings', settings: null });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const settings = state.kind === 'loading' || state.kind === 'settings' ? null : state.settings;
  const api = useMemo(() => (settings === null ? null : createNativeAcpApi(settings)), [settings]);

  const handleSaveSettings = async (nextSettings: ConnectionSettings): Promise<void> => {
    const saved = await saveConnectionSettings(nextSettings);
    queryClient.clear();
    setState({ kind: 'projects', settings: saved });
  };

  if (state.kind === 'loading') {
    return <LoadingState label="設定を読み込んでいます" />;
  }

  if (state.kind === 'settings') {
    const existingSettings = state.settings;
    return (
      <SettingsScreen
        initialSettings={existingSettings}
        onCancel={
          existingSettings !== null && connectionSettingsReady(existingSettings)
            ? () => {
                setState({ kind: 'projects', settings: existingSettings });
              }
            : undefined
        }
        onSave={handleSaveSettings}
      />
    );
  }

  if (api === null) {
    return <SettingsScreen initialSettings={null} onSave={handleSaveSettings} />;
  }

  if (state.kind === 'projects') {
    return (
      <ProjectsScreen
        api={api}
        onOpenProject={(project) => {
          setState({ kind: 'sessions', project, settings: state.settings });
        }}
        onOpenProviders={() => {
          setState({ kind: 'providers', settings: state.settings });
        }}
        onOpenRoutines={() => {
          setState({ kind: 'routines', settings: state.settings });
        }}
        onOpenSettings={() => {
          setState({ kind: 'settings', settings: state.settings });
        }}
      />
    );
  }

  if (state.kind === 'providers') {
    return (
      <ProvidersScreen
        api={api}
        onBack={() => {
          setState({ kind: 'projects', settings: state.settings });
        }}
        onOpenSettings={() => {
          setState({ kind: 'settings', settings: state.settings });
        }}
      />
    );
  }

  if (state.kind === 'routines') {
    return (
      <RoutinesScreen
        api={api}
        onBack={() => {
          setState({ kind: 'projects', settings: state.settings });
        }}
        onOpenSettings={() => {
          setState({ kind: 'settings', settings: state.settings });
        }}
      />
    );
  }

  if (state.kind === 'sessions') {
    return (
      <SessionsScreen
        api={api}
        project={state.project}
        onBack={() => {
          setState({ kind: 'projects', settings: state.settings });
        }}
        onOpenSettings={() => {
          setState({ kind: 'settings', settings: state.settings });
        }}
        onOpenChat={(session, cwdOverride) => {
          setState({
            cwdOverride,
            kind: 'chat',
            project: state.project,
            session,
            settings: state.settings,
          });
        }}
      />
    );
  }

  return (
    <ChatScreen
      api={api}
      initialSession={state.session}
      initialCwd={state.cwdOverride}
      project={state.project}
      onBack={() => {
        setState({ kind: 'sessions', project: state.project, settings: state.settings });
      }}
      onOpenSettings={() => {
        setState({ kind: 'settings', settings: state.settings });
      }}
    />
  );
};

export const NativeApp: FC = () => (
  <QueryClientProvider client={queryClient}>
    <View style={styles.root}>
      <AppContent />
    </View>
  </QueryClientProvider>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default NativeApp;
