import { format } from '@std/datetime';

export class TimeFormatter {
  static formatInTimezone(date: Date, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    };
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
  
  static formatDateOnly(date: Date, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}
