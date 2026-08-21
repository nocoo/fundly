#!/usr/bin/env bun
import { runRestore } from '../src/backup/run.ts';
import { logger } from '../src/utils/logger.ts';

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const result = await runRestore({
  id: opt('--id'),
  to: opt('--to'),
  force: process.argv.includes('--force'),
});
logger.info('backup restored', result);
