import type { FC } from 'react';

import { Toaster, type ToasterProps } from 'sonner';

import { useTheme } from '../lib/theme.tsx';

const toasterThemes = {
  light: 'light',
  dark: 'dark',
} as const satisfies Record<string, ToasterProps['theme']>;

export const AppToaster: FC<Pick<ToasterProps, 'position' | 'richColors'>> = (props) => {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      className="toaster group"
      theme={toasterThemes[resolvedTheme]}
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  );
};
