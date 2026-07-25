import { LogLevel } from '@nestjs/common';

const NEST_LOG_LEVELS: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export type AppLogLevel = (typeof NEST_LOG_LEVELS)[number];

export function isAppLogLevel(value: string): value is AppLogLevel {
  return (NEST_LOG_LEVELS as string[]).includes(value);
}

/**
 * Nest enables every level up to and including `level`.
 */
export function nestLogLevelsAt(level: AppLogLevel): LogLevel[] {
  const index = NEST_LOG_LEVELS.indexOf(level);
  return NEST_LOG_LEVELS.slice(0, index + 1);
}

export function defaultLogLevel(nodeEnv: string): AppLogLevel {
  return nodeEnv === 'development' ? 'debug' : 'log';
}
