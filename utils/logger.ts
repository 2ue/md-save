/**
 * 结构化日志系统
 * 提供统一的日志接口，支持开发/生产环境区分
 */

// 判断是否为开发环境
const isDev = import.meta.env.MODE === 'development';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogOptions {
  level?: LogLevel;
  prefix?: string;
  data?: any;
}

class Logger {
  private prefix: string;
  private minLevel: LogLevel;

  constructor(prefix: string = 'MD-Save', minLevel: LogLevel = LogLevel.DEBUG) {
    this.prefix = prefix;
    this.minLevel = isDev ? LogLevel.DEBUG : LogLevel.WARN;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    let msg = `[${timestamp}] [${this.prefix}] [${level}] ${message}`;
    return msg;
  }

  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = { ...data };

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '***';
      }
    }

    return sanitized;
  }

  debug(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const msg = this.formatMessage('DEBUG', message);
    if (data) {
      console.log(msg, this.sanitizeData(data));
    } else {
      console.log(msg);
    }
  }

  info(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const msg = this.formatMessage('INFO', message);
    if (data) {
      console.info(msg, this.sanitizeData(data));
    } else {
      console.info(msg);
    }
  }

  warn(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const msg = this.formatMessage('WARN', message);
    if (data) {
      console.warn(msg, this.sanitizeData(data));
    } else {
      console.warn(msg);
    }
  }

  error(message: string, error?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const msg = this.formatMessage('ERROR', message);
    if (error) {
      console.error(msg, error);
    } else {
      console.error(msg);
    }
  }

  /**
   * 创建子logger，用于特定模块
   */
  child(prefix: string): Logger {
    return new Logger(`${this.prefix}:${prefix}`, this.minLevel);
  }
}

// 导出默认logger
export const logger = new Logger('MD-Save');

// 导出模块专用logger
export const webdavLogger = logger.child('WebDAV');
export const contentLogger = logger.child('Content');
export const backgroundLogger = logger.child('Background');
export const popupLogger = logger.child('Popup');
