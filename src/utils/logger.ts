/**
 * 结构化日志（带时间戳、级别、上下文）
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.FUNDLY_LOG_LEVEL as LogLevel) ?? 'info';

function format(level: LogLevel, msg: string, ctx?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? ` ${JSON.stringify(ctx)}` : '';
  return `[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}${ctxStr}`;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

export const logger = {
  debug(msg: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('debug')) console.log(format('debug', msg, ctx));
  },
  info(msg: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('info')) console.log(format('info', msg, ctx));
  },
  warn(msg: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('warn')) console.warn(format('warn', msg, ctx));
  },
  error(msg: string, ctx?: Record<string, unknown>): void {
    if (shouldLog('error')) console.error(format('error', msg, ctx));
  },
};
