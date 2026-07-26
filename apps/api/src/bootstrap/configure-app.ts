import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from '../common/interceptors/http-logging.interceptor';
import { TransformResponseInterceptor } from '../common/interceptors/transform-response.interceptor';

/**
 * Applies shared HTTP adapter configuration used by production bootstrap and e2e.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const httpApp = app as NestExpressApplication;

  httpApp.use(helmet());
  httpApp.disable('x-powered-by');
  httpApp.use(cookieParser());

  const corsOrigins = configService.getOrThrow<string[]>('app.corsOrigins');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  if (apiPrefix) {
    app.setGlobalPrefix(apiPrefix);
  }

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(configService),
    new TransformResponseInterceptor(reflector),
  );

  const swaggerPath = configService.getOrThrow<string>('swagger.path');
  const swaggerTitle = configService.getOrThrow<string>('swagger.title');
  const swaggerDescription = configService.getOrThrow<string>(
    'swagger.description',
  );
  const swaggerVersion = configService.getOrThrow<string>('swagger.version');

  const swaggerDocumentConfig = new DocumentBuilder()
    .setTitle(swaggerTitle)
    .setDescription(
      `${swaggerDescription}\n\nVersioned REST surface is rooted at \`/v1\`. ` +
        `Operational health checks remain unversioned at \`/health\`. ` +
        `Success responses use \`{ data, meta }\`; errors use \`{ code, message, details?, correlationId }\`. ` +
        `Authenticated requests use the \`Authorization: Bearer\` scheme. ` +
        `Request correlation IDs are accepted or generated via \`X-Correlation-Id\`.`,
    )
    .setVersion(swaggerVersion)
    .addServer('/v1', 'Versioned API')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerDocumentConfig);
  SwaggerModule.setup(swaggerPath, app, document);
}
