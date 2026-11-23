import { BadRequestException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';

/**
 * Phase 6B supported ISO 4217 subset.
 * `amountCents` DB columns store integer **minor units** for the currency
 * (not universally 1/100). Add currencies here + tests when enabling more.
 */
export const SUPPORTED_CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  KWD: 3,
};

export type SupportedCurrencyCode = keyof typeof SUPPORTED_CURRENCY_EXPONENTS;

export function normalizeCurrencyCode(code: string): string {
  return code.trim().toUpperCase();
}

export function currencyExponent(code: string): number {
  const normalized = normalizeCurrencyCode(code);
  const exp = SUPPORTED_CURRENCY_EXPONENTS[normalized];
  if (exp === undefined) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: `Unsupported currency: ${code}`,
    });
  }
  return exp;
}

export function assertSupportedCurrency(
  code: string | null | undefined,
): string {
  if (!code?.trim()) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_MISSING_FIELD,
      message: 'currency is required',
    });
  }
  const normalized = normalizeCurrencyCode(code);
  if (!(normalized in SUPPORTED_CURRENCY_EXPONENTS)) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: `Unsupported currency: ${code}`,
    });
  }
  return normalized;
}

/**
 * Validates an integer minor-unit amount for a supported currency.
 * Does not use floating-point arithmetic.
 */
export function assertValidMinorUnitAmount(
  currency: string,
  amount: number,
  options?: { min?: number },
): number {
  assertSupportedCurrency(currency);
  const min = options?.min ?? 0;
  if (!Number.isSafeInteger(amount) || amount < min) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message: `Amount must be a safe integer >= ${min} in minor units`,
    });
  }
  return amount;
}

/** Idempotency-Key for staff retry-payment: 1–128 of [A-Za-z0-9._:-] */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function assertIdempotencyKey(raw: string | undefined | null): string {
  const key = raw?.trim() ?? '';
  if (!key) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_MISSING_FIELD,
      message: 'Idempotency-Key is required',
    });
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException({
      code: ErrorCodes.VAL_INVALID_FORMAT,
      message:
        'Idempotency-Key must be 1–128 characters of A–Z a–z 0–9 . _ : -',
    });
  }
  return key;
}
