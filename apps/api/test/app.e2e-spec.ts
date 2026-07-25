import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap/configure-app';
import { CORRELATION_ID_HEADER } from './../src/common/constants/http-headers';
import type { ApiErrorResponse } from './../src/common/interfaces/api-error-response.interface';
import type { ApiSuccessResponse } from './../src/common/interfaces/api-success-response.interface';
import { HealthResponseDto } from './../src/health/dto/health-response.dto';
import { ObservabilityProbeController } from './helpers/observability-probe.controller';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ObservabilityProbeController],
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

  it('/health generates X-Correlation-Id when missing', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.headers[CORRELATION_ID_HEADER]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      });
  });

  it('/health echoes a valid client X-Correlation-Id', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set(CORRELATION_ID_HEADER, 'test-id-123')
      .expect(200)
      .expect((res) => {
        expect(res.headers[CORRELATION_ID_HEADER]).toBe('test-id-123');
      });
  });

  it('/health rejects invalid X-Correlation-Id and issues a UUID', () => {
    const tooLong = 'x'.repeat(129);

    return request(app.getHttpServer())
      .get('/health')
      .set(CORRELATION_ID_HEADER, tooLong)
      .expect(200)
      .expect((res) => {
        expect(res.headers[CORRELATION_ID_HEADER]).not.toBe(tooLong);
        expect(res.headers[CORRELATION_ID_HEADER]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      });
  });

  it('preserves client correlation id across header, success meta, and error body', async () => {
    const correlationId = 'client-corr-e2e-001';

    const success = await request(app.getHttpServer())
      .get('/v1/observability-probe')
      .set(CORRELATION_ID_HEADER, correlationId)
      .expect(200);

    expect(success.headers[CORRELATION_ID_HEADER]).toBe(correlationId);
    const successBody = success.body as ApiSuccessResponse<{ ok: true }>;
    expect(successBody.data).toEqual({ ok: true });
    expect(successBody.meta.correlationId).toBe(correlationId);

    const failure = await request(app.getHttpServer())
      .get('/v1/does-not-exist')
      .set(CORRELATION_ID_HEADER, correlationId)
      .expect(404);

    expect(failure.headers[CORRELATION_ID_HEADER]).toBe(correlationId);
    const errorBody = failure.body as ApiErrorResponse;
    expect(errorBody.correlationId).toBe(correlationId);
    expect(errorBody.code).toBeDefined();
    expect(errorBody.message).toBeDefined();
  });
});
