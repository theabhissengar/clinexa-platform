import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorCodes } from '../constants/error-codes';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let statusCode: number;
  let jsonBody: unknown;

  const mockResponse = {
    status: (code: number) => {
      statusCode = code;
      return mockResponse;
    },
    json: (body: unknown) => {
      jsonBody = body;
      return mockResponse;
    },
  };

  const createHost = (): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ correlationId: 'corr-filter-1' }),
      }),
    }) as ArgumentsHost;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get(AllExceptionsFilter);
    statusCode = 0;
    jsonBody = undefined;

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps ValidationPipe string messages to 422 ERR-VAL envelope', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      }),
      createHost(),
    );

    expect(statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonBody).toEqual({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: 'Validation failed',
      correlationId: 'corr-filter-1',
      details: [{ field: 'email', messages: ['email must be an email'] }],
    });
  });

  it('maps forbidNonWhitelisted messages to ERR-VAL-001', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['property unexpected should not exist'],
        error: 'Bad Request',
      }),
      createHost(),
    );

    expect(statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonBody).toMatchObject({
      code: ErrorCodes.VAL_UNKNOWN_FIELD,
      message: 'Validation failed',
      correlationId: 'corr-filter-1',
    });
  });

  it('maps NotFoundException to ERR-RES-001', () => {
    filter.catch(new NotFoundException('Missing'), createHost());

    expect(statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(jsonBody).toEqual({
      code: ErrorCodes.RES_NOT_FOUND,
      message: 'Missing',
      correlationId: 'corr-filter-1',
    });
  });

  it('maps unknown errors to 500 ERR-SYS-001 without stack in body', () => {
    filter.catch(new Error('boom'), createHost());

    expect(statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonBody).toEqual({
      code: ErrorCodes.SYS_UNEXPECTED,
      message: 'An unexpected error occurred',
      correlationId: 'corr-filter-1',
    });
    expect(jsonBody).not.toHaveProperty('stack');
  });
});
