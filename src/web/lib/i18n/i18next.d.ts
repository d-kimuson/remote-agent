import 'i18next';
import type { defaultLanguage, resources } from './resources.ts';

declare module 'i18next' {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)[typeof defaultLanguage]['translation'];
  }
}
