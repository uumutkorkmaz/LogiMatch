import { cookies } from 'next/headers';
import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { DISPLAY_TIME_ZONE } from '@logimatch/shared';
import { LOCALE_COOKIE, resolveLocale } from './config';

// URL'de locale öneki yok; dil tercihi cookie'de tutulur (varsayılan: tr).
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };
  return { locale, messages: messages.default, timeZone: DISPLAY_TIME_ZONE };
});
