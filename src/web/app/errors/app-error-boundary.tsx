import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, type ErrorComponentProps } from '@tanstack/react-router';
import { AlertTriangle, Home } from 'lucide-react';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/web/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/web/components/ui/card.tsx';

import { ApiAuthForm } from '../auth/api-auth-form.tsx';

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
};

export const AppErrorBoundary: FC<ErrorComponentProps> = ({ error, reset }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const message = errorMessage(error, t('errorBoundary.unknownMessage'));

  const handleGoHome = useCallback(() => {
    queryClient.clear();
    reset?.();
    void navigate({ to: '/projects' });
  }, [navigate, queryClient, reset]);

  const handleApiConfigSaved = useCallback(() => {
    queryClient.clear();
    reset?.();
    window.location.reload();
  }, [queryClient, reset]);

  return (
    <div className="app-page">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <Card className="app-panel">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle>{t('errorBoundary.title')}</CardTitle>
                <CardDescription>{t('errorBoundary.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {message}
            </div>
            <Button onClick={handleGoHome} type="button">
              <Home className="size-4" />
              {t('errorBoundary.goHome')}
            </Button>
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardHeader>
            <CardTitle>{t('apiAuth.settingsTitle')}</CardTitle>
            <CardDescription>{t('errorBoundary.apiSettingsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ApiAuthForm onSaved={handleApiConfigSaved} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
