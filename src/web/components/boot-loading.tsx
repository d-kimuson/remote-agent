import type { FC } from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Visible boot/route fallback — avoids a blank white screen during Suspense. */
export const BootLoading: FC<{ readonly label?: string }> = ({ label }) => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-4 text-muted-foreground">
      <Loader2 aria-hidden className="size-6 animate-spin" />
      <p className="text-sm">{label ?? t('common.loading')}</p>
    </div>
  );
};
