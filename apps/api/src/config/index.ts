import appConfig from './app.config';
import databaseConfig from './database.config';
import swaggerConfig from './swagger.config';

export { validateEnv } from './env.validation';
export type { EnvConfig } from './env.validation';
export { parseCorsOrigins } from './app.config';

export { appConfig, databaseConfig, swaggerConfig };

/** Config factories registered with ConfigModule.forRoot({ load }) */
export const configurations = [appConfig, databaseConfig, swaggerConfig];
