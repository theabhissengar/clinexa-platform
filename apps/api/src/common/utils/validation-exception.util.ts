import { ValidationError } from 'class-validator';

import { ErrorCodes } from '../constants/error-codes';

export interface ValidationFieldDetail {
  field: string;
  messages: string[];
}

export interface MappedValidationError {
  code: string;
  message: string;
  details: ValidationFieldDetail[];
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationFieldDetail[] {
  const details: ValidationFieldDetail[] = [];

  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      details.push({
        field,
        messages: Object.values(error.constraints),
      });
    }

    if (error.children?.length) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }

  return details;
}

function resolveValidationCode(details: ValidationFieldDetail[]): string {
  const joined = details
    .flatMap((detail) => detail.messages)
    .join(' ')
    .toLowerCase();

  if (joined.includes('should not exist')) {
    return ErrorCodes.VAL_UNKNOWN_FIELD;
  }

  if (
    joined.includes('should not be empty') ||
    joined.includes('is required')
  ) {
    return ErrorCodes.VAL_MISSING_FIELD;
  }

  return ErrorCodes.VAL_INVALID_FORMAT;
}

/**
 * Maps class-validator ValidationError[] into the API error envelope fields.
 */
export function mapValidationErrors(
  errors: ValidationError[],
): MappedValidationError {
  const details = flattenValidationErrors(errors);
  const code = resolveValidationCode(details);

  return {
    code,
    message: 'Validation failed',
    details,
  };
}

/**
 * Detects Nest ValidationPipe BadRequestException payload shapes.
 */
export function isValidationExceptionResponse(
  response: unknown,
): response is { message: ValidationError[] | string[] | string } {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const message = (response as { message?: unknown }).message;

  if (Array.isArray(message) && message.length > 0) {
    const first: unknown = message[0];
    return (
      typeof first === 'string' ||
      (typeof first === 'object' &&
        first !== null &&
        'property' in first &&
        'constraints' in first)
    );
  }

  return false;
}
