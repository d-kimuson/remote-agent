import { useCallback, useEffect, useState, type ComponentProps, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/web/components/ui/button.tsx';
import { Input } from '@/web/components/ui/input.tsx';
import { Label } from '@/web/components/ui/label.tsx';
import { persistApiConfig, storedApiKey, storedApiUrl } from '@/web/lib/api/client.ts';

const trimmedOrNull = (value: string): string | null => {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
};

type FormSubmitHandler = NonNullable<ComponentProps<'form'>['onSubmit']>;

export const ApiAuthForm: FC<{
  readonly buttonClassName?: string;
  readonly onSaved: () => void;
}> = ({ buttonClassName, onSaved }) => {
  const { t } = useTranslation();
  const [apiUrl, setApiUrl] = useState(() => storedApiUrl());
  const [apiKey, setApiKey] = useState(() => storedApiKey() ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setApiUrl(storedApiUrl());
    setApiKey(storedApiKey() ?? '');
  }, []);

  const handleSubmit = useCallback(
    ((event) => {
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
      onSaved();
    }) satisfies FormSubmitHandler,
    [apiKey, apiUrl, onSaved, t],
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
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
        <Button className={buttonClassName} disabled={isSubmitting} type="submit">
          {isSubmitting ? t('apiAuth.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
};
