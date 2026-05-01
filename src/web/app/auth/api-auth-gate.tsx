import { useCallback, useEffect, useState, type FC, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/web/components/ui/label.tsx';
import { Button } from '@/web/components/ui/button.tsx';
import { Input } from '@/web/components/ui/input.tsx';
import {
  apiAuthRequiredEvent,
  isApiAuthRequired,
  persistApiConfig,
  storedApiKey,
  storedApiUrl,
} from '@/web/lib/api/client.ts';

const trimmedOrNull = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

export const ApiAuthGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [isAuthRequired, setIsAuthRequired] = useState(() => isApiAuthRequired());
  const [apiUrl, setApiUrl] = useState(() => storedApiUrl());
  const [apiKey, setApiKey] = useState(() => storedApiKey() ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setApiUrl(storedApiUrl());
    setApiKey(storedApiKey() ?? '');
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      setApiUrl(storedApiUrl());
      setApiKey(storedApiKey() ?? '');
      setIsAuthRequired(true);
    };
    window.addEventListener(apiAuthRequiredEvent, onAuthRequired);
    return () => {
      window.removeEventListener(apiAuthRequiredEvent, onAuthRequired);
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedApiUrl = trimmedOrNull(apiUrl) ?? storedApiUrl();
      const trimmedApiKey = trimmedOrNull(apiKey);

      if (trimmedApiKey === null) {
        setFormError(t('apiAuth.apiKeyRequired'));
        return;
      }

      setIsSubmitting(true);
      setFormError(null);
      persistApiConfig({ apiKey: trimmedApiKey, apiUrl: trimmedApiUrl });
      window.location.reload();
    },
    [apiKey, apiUrl, t],
  );

  if (!isAuthRequired) {
    return children;
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-background/90 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t('apiAuth.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('apiAuth.description')}</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="api-auth-api-url">{t('apiAuth.apiUrlLabel')}</Label>
            <Input
              id="api-auth-api-url"
              autoComplete="off"
              name="apiUrl"
              onChange={(event) => {
                setApiUrl(event.currentTarget.value);
              }}
              placeholder={storedApiUrl()}
              type="text"
              value={apiUrl}
            />
            <p className="text-xs text-muted-foreground">{t('apiAuth.apiUrlHelp')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-auth-api-key">{t('apiAuth.apiKeyLabel')}</Label>
            <Input
              id="api-auth-api-key"
              autoComplete="off"
              name="apiKey"
              onChange={(event) => {
                setApiKey(event.currentTarget.value);
              }}
              placeholder={t('apiAuth.apiKeyPlaceholder')}
              type="password"
              value={apiKey}
            />
          </div>
          {formError === null ? null : <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button disabled={isSubmitting} type="submit" className="min-w-24">
              {isSubmitting ? t('apiAuth.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
