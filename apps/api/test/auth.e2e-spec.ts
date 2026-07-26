import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap/configure-app';
import { ErrorCodes } from './../src/common/constants/error-codes';
import type { ApiErrorResponse } from './../src/common/interfaces/api-error-response.interface';
import type { ApiSuccessResponse } from './../src/common/interfaces/api-success-response.interface';
import type { AuthTokensDto } from './../src/modules/auth/dto/auth-tokens.dto';
import type { SessionUserDto } from './../src/modules/auth/dto/session-user.dto';
import { PrismaService } from './../src/infrastructure/prisma/prisma.service';
import { PasswordHasher } from './../src/modules/auth/password.hasher';
import { UserStatus } from '../generated/prisma';

/**
 * Auth e2e tests require a reachable PostgreSQL instance with migrations applied.
 * They create and clean up a dedicated user per run.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHasher: PasswordHasher;

  const testEmail = `auth-e2e-${Date.now()}@example.com`;
  const testPassword = 'e2e-password-12';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    passwordHasher = app.get(PasswordHasher);

    try {
      await prisma.$connect();
    } catch {
      // Database unavailable — tests will fail with clear connection errors
    }

    const passwordHash = await passwordHasher.hash(testPassword);
    await prisma.user.upsert({
      where: { email: testEmail },
      create: {
        email: testEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        status: UserStatus.ACTIVE,
        tokenVersion: 0,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.session.deleteMany({
        where: { user: { email: testEmail } },
      });
      await prisma.user.deleteMany({ where: { email: testEmail } });
    }
    await app.close();
  });

  it('rejects invalid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: testEmail, password: 'wrong-password' })
      .expect(401);

    const body = res.body as ApiErrorResponse;
    expect(body.code).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
  });

  it('logs in, returns session, refreshes, and logs out', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(200);

    const loginBody = loginRes.body as ApiSuccessResponse<AuthTokensDto>;
    expect(loginBody.data.accessToken).toBeTruthy();
    expect(loginBody.data.user.email).toBe(testEmail);

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const sessionRes = await request(app.getHttpServer())
      .get('/v1/auth/session')
      .set('Authorization', `Bearer ${loginBody.data.accessToken}`)
      .expect(200);

    const sessionBody = sessionRes.body as ApiSuccessResponse<SessionUserDto>;
    expect(sessionBody.data.email).toBe(testEmail);
    expect(sessionBody.data.sessionId).toBeTruthy();

    const refreshRes = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('Cookie', cookies as string[])
      .expect(200);

    const refreshBody = refreshRes.body as ApiSuccessResponse<AuthTokensDto>;
    expect(refreshBody.data.accessToken).toBeTruthy();
    expect(refreshBody.data.accessToken).not.toBe(loginBody.data.accessToken);

    const refreshCookies = refreshRes.headers['set-cookie'];

    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${refreshBody.data.accessToken}`)
      .set('Cookie', (refreshCookies as string[]) ?? (cookies as string[]))
      .expect(200);

    await request(app.getHttpServer())
      .get('/v1/auth/session')
      .set('Authorization', `Bearer ${refreshBody.data.accessToken}`)
      .expect(401);
  });

  it('rejects unauthenticated session access', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/auth/session')
      .expect(401);

    const body = res.body as ApiErrorResponse;
    expect(body.code).toBe(ErrorCodes.AUTH_UNAUTHENTICATED);
  });
});
