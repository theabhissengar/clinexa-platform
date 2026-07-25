import {
  BadRequestException,
  HttpStatus,
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

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => ({}),
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get(AllExceptionsFilter);
    statusCode = 0;
    jsonBody = undefined;
  });

  it('maps ValidationPipe string messages to 422 ERR-VAL envelope', () => {
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      }),
      mockHost as never,
    );

    expect(statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonBody).toEqual({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: 'Validation failed',
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
      mockHost as never,
    );

    expect(statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(jsonBody).toMatchObject({
      code: ErrorCodes.VAL_UNKNOWN_FIELD,
      message: 'Validation failed',
    });
  });

  it('maps NotFoundException to ERR-RES-001', () => {
    filter.catch(new NotFoundException('Missing'), mockHost as never);

    expect(statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(jsonBody).toEqual({
      code: ErrorCodes.RES_NOT_FOUND,
      message: 'Missing',
    });
  });

  it('maps unknown errors to 500 ERR-SYS-001 without stack in body', () => {
    filter.catch(new Error('boom'), mockHost as never);

    expect(statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonBody).toEqual({
      code: ErrorCodes.SYS_UNEXPECTED,
      message: 'An unexpected error occurred',
    });
    expect(jsonBody).not.toHaveProperty('stack');
  });
});
