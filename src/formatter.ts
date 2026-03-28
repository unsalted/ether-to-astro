export function formatInTimezone(date: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  };

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function formatDateOnly(date: Date, timezone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  return new Intl.DateTimeFormat('en-US', options).format(date);
}
