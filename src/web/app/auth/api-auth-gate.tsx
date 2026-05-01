import { CatchBoundary, ErrorComponent } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  apiAuthRequiredEvent,
  isApiAuthError,
  isApiAuthRequired,
  storedApiKey,
  storedApiUrl,
} from '@/web/lib/api/client.ts';

import { ApiAuthForm } from './api-auth-form.tsx';

export const ApiAuthGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [isAuthRequired, setIsAuthRequired] = useState(() => isApiAuthRequired());
  const [resetKey, setResetKey] = useState(() => `${storedApiUrl()}:${storedApiKey() ?? ''}`);

  const refreshResetKey = useCallback(() => {
    setResetKey(`${storedApiUrl()}:${storedApiKey() ?? ''}`);
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      refreshResetKey();
      setIsAuthRequired(true);
    };
    window.addEventListener(apiAuthRequiredEvent, onAuthRequired);
    return () => {
      window.removeEventListener(apiAuthRequiredEvent, onAuthRequired);
    };
  }, [refreshResetKey]);

  const handleSaved = useCallback(() => {
    refreshResetKey();
    setIsAuthRequired(false);
    window.location.reload();
  }, [refreshResetKey]);

  const handleAuthError = useCallback(() => {
    refreshResetKey();
    setIsAuthRequired(true);
  }, [refreshResetKey]);

  const authForm = (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-background/90 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t('apiAuth.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('apiAuth.description')}</p>
        <div className="mt-6">
          <ApiAuthForm buttonClassName="min-w-24" onSaved={handleSaved} />
        </div>
      </div>
    </div>
  );

  if (isAuthRequired) {
    return authForm;
  }

  const AuthErrorComponent: FC<{ readonly error: Error }> = ({ error }) => {
    return isApiAuthError(error) ? authForm : <ErrorComponent error={error} />;
  };

  return (
    <CatchBoundary
      getResetKey={() => `${String(isAuthRequired)}:${resetKey}`}
      onCatch={(error) => {
        if (isApiAuthError(error)) {
          handleAuthError();
        }
      }}
      errorComponent={AuthErrorComponent}
    >
      {children}
    </CatchBoundary>
  );
};
