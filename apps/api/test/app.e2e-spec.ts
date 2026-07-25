import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap/configure-app';
import { HealthResponseDto } from './../src/health/dto/health-response.dto';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET) remains unversioned and unwrapped', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as unknown as HealthResponseDto;

        expect(body.status).toBe('ok');
        expect(body.service).toBe('clinexa-api');
        expect(typeof body.timestamp).toBe('string');
        expect(body).not.toHaveProperty('data');
        expect(body).not.toHaveProperty('meta');
      });
  });

  it('/health applies Helmet headers and hides X-Powered-By', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-powered-by']).toBeUndefined();
      });
  });

  it('/v1/health is not registered (version-neutral only)', () => {
    return request(app.getHttpServer()).get('/v1/health').expect(404);
  });
});
