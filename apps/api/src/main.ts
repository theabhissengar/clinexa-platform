import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import {
  defaultLogLevel,
  isAppLogLevel,
  nestLogLevelsAt,
  type AppLogLevel,
} from './config/log-level.util';

function resolveBootstrapLogLevel(): AppLogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured && isAppLogLevel(configured)) {
    return configured;
  }
  return defaultLogLevel(process.env.NODE_ENV ?? 'development');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: nestLogLevelsAt(resolveBootstrapLogLevel()),
  });
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('app.port');
  const swaggerPath = configService.getOrThrow<string>('swagger.path');
  const logger = new Logger('Bootstrap');

  await app.listen(port);

  logger.log(`Clinexa API listening on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/${swaggerPath}`);
}

void bootstrap();
