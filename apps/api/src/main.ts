import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('app.port');
  const swaggerPath = configService.getOrThrow<string>('swagger.path');

  await app.listen(port);

  console.log(`Clinexa API listening on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/${swaggerPath}`);
}

void bootstrap();
