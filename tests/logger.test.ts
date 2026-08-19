import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { logger } from '../src/utils/logger.ts';

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

const captured: { log: string[]; warn: string[]; error: string[] } = {
  log: [],
  warn: [],
  error: [],
};

beforeAll(() => {
  console.log = (msg: string) => captured.log.push(msg);
  console.warn = (msg: string) => captured.warn.push(msg);
  console.error = (msg: string) => captured.error.push(msg);
});

afterAll(() => {
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
});

describe('logger', () => {
  test('info logs to console.log', () => {
    captured.log = [];
    logger.info('hello', { a: 1 });
    expect(captured.log.length).toBe(1);
    expect(captured.log[0]).toContain('INFO');
    expect(captured.log[0]).toContain('hello');
    expect(captured.log[0]).toContain('"a":1');
  });

  test('warn logs to console.warn', () => {
    captured.warn = [];
    logger.warn('danger');
    expect(captured.warn.length).toBe(1);
    expect(captured.warn[0]).toContain('WARN');
  });

  test('error logs to console.error', () => {
    captured.error = [];
    logger.error('boom', { code: 500 });
    expect(captured.error.length).toBe(1);
    expect(captured.error[0]).toContain('ERROR');
    expect(captured.error[0]).toContain('"code":500');
  });

  test('debug is filtered by default (level=info)', () => {
    captured.log = [];
    logger.debug('should be silent');
    // default level is 'info', debug should be filtered
    const debugLines = captured.log.filter((l) => l.includes('DEBUG'));
    expect(debugLines.length).toBe(0);
  });

  test('formats without ctx', () => {
    captured.log = [];
    logger.info('bare');
    expect(captured.log[0]).toContain('bare');
    expect(captured.log[0]).not.toContain('{}');
  });
});
