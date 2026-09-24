export const locales = ['tr', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function resolveLocale(value: string | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? '') ? (value as Locale) : defaultLocale;
}
