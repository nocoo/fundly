#!/usr/bin/env bun
import { resolveEnvironment, runBackup } from '../src/backup/run.ts';
import { logger } from '../src/utils/logger.ts';

const created = await runBackup({ environment: resolveEnvironment() });
logger.info('backup uploaded', created);
