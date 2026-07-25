import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigins = configService.getOrThrow<string[]>('app.corsOrigins');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  if (apiPrefix) {
    app.setGlobalPrefix(apiPrefix);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerPath = configService.getOrThrow<string>('swagger.path');
  const swaggerTitle = configService.getOrThrow<string>('swagger.title');
  const swaggerDescription = configService.getOrThrow<string>(
    'swagger.description',
  );
  const swaggerVersion = configService.getOrThrow<string>('swagger.version');

  const swaggerDocumentConfig = new DocumentBuilder()
    .setTitle(swaggerTitle)
    .setDescription(swaggerDescription)
    .setVersion(swaggerVersion)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerDocumentConfig);
  SwaggerModule.setup(swaggerPath, app, document);

  const port = configService.getOrThrow<number>('app.port');
  await app.listen(port);

  console.log(`Clinexa API listening on http://localhost:${port}`);

  console.log(`Swagger docs at http://localhost:${port}/${swaggerPath}`);
}

void bootstrap();
