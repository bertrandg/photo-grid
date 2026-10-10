const locale = typeof navigator === 'undefined' ? 'fr-FR' : navigator.language || 'fr-FR';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const monthFormat = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonthFormat = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayYearFormat = new Intl.DateTimeFormat(locale, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' });

const utc = (localDate: string) => new Date(`${localDate.length === 10 ? `${localDate}T00:00:00` : localDate}Z`);

export const formatMonthTitle = (year: number, month: number) => capitalize(monthFormat.format(Date.UTC(year, month - 1, 1)));

export const formatShortMonth = (year: number, month: number) => shortMonthFormat.format(Date.UTC(year, month - 1, 1));

export function formatDayTitle(day: string) {
  const sameYear = Number(day.slice(0, 4)) === new Date().getFullYear();
  return capitalize((sameYear ? dayFormat : dayYearFormat).format(utc(day)));
}

export const formatDateTime = (localDateTime: string) => capitalize(fullFormat.format(utc(localDateTime)));
