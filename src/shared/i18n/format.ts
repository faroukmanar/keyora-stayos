export type SupportedLocale = 'en' | 'fr' | 'ar';

export const propertyTimeZone = 'Africa/Casablanca';
export const isRtl = (locale: SupportedLocale) => locale === 'ar';

/** Operational dates are interpreted in the property's timezone; locale only controls presentation. */
export function formatOperationalDate(value: string | Date, locale: SupportedLocale, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(locale, { timeZone: propertyTimeZone, year: 'numeric', month: 'short', day: 'numeric', ...options }).format(new Date(value));
}

export function formatOperationalTime(value: string | Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { timeZone: propertyTimeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
