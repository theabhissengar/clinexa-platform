import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';
import swaggerConfig from './swagger.config';

export { validateEnv } from './env.validation';
export type { EnvConfig } from './env.validation';
export { parseCorsOrigins } from './app.config';
export { parseDurationToSeconds } from './auth.config';

export { appConfig, authConfig, databaseConfig, swaggerConfig };

/** Config factories registered with ConfigModule.forRoot({ load }) */
export const configurations = [
  appConfig,
  authConfig,
  databaseConfig,
  swaggerConfig,
];
