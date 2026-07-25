import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from 'class-validator';

import type { ApiErrorResponse } from '../interfaces/api-error-response.interface';
import { ErrorCodes } from '../constants/error-codes';
import {
  isValidationExceptionResponse,
  mapValidationErrors,
} from '../utils/validation-exception.util';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const body = this.toErrorResponse(exception);
    const status = this.resolveStatus(exception, body);

    if (status >= 500) {
      this.logger.error(
        body.message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private resolveStatus(exception: unknown, body: ApiErrorResponse): number {
    if (body.code.startsWith('ERR-VAL-')) {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }

    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toErrorResponse(exception: unknown): ApiErrorResponse {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      code: ErrorCodes.SYS_UNEXPECTED,
      message: 'An unexpected error occurred',
    };
  }

  private fromHttpException(exception: HttpException): ApiErrorResponse {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (status === 400 && isValidationExceptionResponse(exceptionResponse)) {
      return this.fromValidationResponse(exceptionResponse.message);
    }

    if (typeof exceptionResponse === 'string') {
      return {
        code: this.codeForStatus(status),
        message: exceptionResponse,
      };
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const payload = exceptionResponse as Record<string, unknown>;
      const code =
        typeof payload.code === 'string'
          ? payload.code
          : this.codeForStatus(status);
      const message = this.extractMessage(payload, exception.message);
      const details = payload.details;

      const body: ApiErrorResponse = { code, message };
      if (details !== undefined) {
        body.details = details;
      }
      return body;
    }

    return {
      code: this.codeForStatus(status),
      message: exception.message || 'Request failed',
    };
  }

  private fromValidationResponse(
    message: ValidationError[] | string[] | string,
  ): ApiErrorResponse {
    if (Array.isArray(message) && message.length > 0) {
      if (typeof message[0] === 'object') {
        return mapValidationErrors(message as ValidationError[]);
      }

      const stringMessages = message as string[];
      const details = stringMessages.map((msg) => ({
        field: this.inferFieldFromMessage(msg),
        messages: [msg],
      }));

      const joined = stringMessages.join(' ').toLowerCase();
      let code: string = ErrorCodes.VAL_INVALID_FORMAT;

      if (joined.includes('should not exist')) {
        code = ErrorCodes.VAL_UNKNOWN_FIELD;
      } else if (
        joined.includes('should not be empty') ||
        joined.includes('is required')
      ) {
        code = ErrorCodes.VAL_MISSING_FIELD;
      }

      return {
        code,
        message: 'Validation failed',
        details,
      };
    }

    return {
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: typeof message === 'string' ? message : 'Validation failed',
    };
  }

  private inferFieldFromMessage(message: string): string {
    const match = /^(?:property )?([^\s]+) /i.exec(message);
    return match?.[1] ?? 'unknown';
  }

  private extractMessage(
    payload: Record<string, unknown>,
    fallback: string,
  ): string {
    const { message } = payload;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
      return message.join('; ');
    }
    return fallback || 'Request failed';
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 404:
        return ErrorCodes.RES_NOT_FOUND;
      case 400:
      case 422:
        return ErrorCodes.VAL_INVALID_FORMAT;
      default:
        return ErrorCodes.SYS_UNEXPECTED;
    }
  }
}
