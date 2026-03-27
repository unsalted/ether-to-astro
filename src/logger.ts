import { LogLevel, LogLevelType, ErrorCategory, ErrorCategoryType } from './constants.js';

export interface LogEntry {
  timestamp: string;
  level: LogLevelType;
  message: string;
  context?: Record<string, unknown>;
}

export interface ErrorLogEntry extends LogEntry {
  level: typeof LogLevel.ERROR;
  category: ErrorCategoryType;
  error?: Error;
  stack?: string;
}

class Logger {
  private shouldLog(level: LogLevelType): boolean {
    const minLevel = process.env.LOG_LEVEL || LogLevel.INFO;
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(minLevel as LogLevelType);
  }

  private formatEntry(entry: LogEntry | ErrorLogEntry): string {
    const base = `[${entry.timestamp}] ${entry.level}: ${entry.message}`;
    
    if ('category' in entry) {
      return `${base} (${entry.category})${entry.context ? ' ' + JSON.stringify(entry.context) : ''}`;
    }
    
    return `${base}${entry.context ? ' ' + JSON.stringify(entry.context) : ''}`;
  }

  private log(entry: LogEntry | ErrorLogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    
    const output = this.formatEntry(entry);
    
    // MCP servers use stderr for logging (stdout is for protocol)
    console.error(output);
    
    if ('error' in entry && entry.error) {
      console.error(entry.error);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      message,
      context,
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message,
      context,
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      message,
      context,
    });
  }

  error(
    message: string,
    category: ErrorCategoryType,
    error?: Error,
    context?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      category,
      message,
      error,
      stack: error?.stack,
      context,
    });
  }

  // Special handler for Swiss Ephemeris warnings (not actual errors)
  ephemerisWarning(warning: string): void {
    // Only log Moshier fallback at debug level since it's expected
    if (warning.includes('using Moshier')) {
      this.debug('Using Moshier ephemeris (high-precision data files not found)', {
        warning,
      });
    } else {
      this.warn('Swiss Ephemeris warning', { warning });
    }
  }
}

export const logger = new Logger();
