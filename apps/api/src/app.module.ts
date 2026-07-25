import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configurations, validateEnv } from './config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: configurations,
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
