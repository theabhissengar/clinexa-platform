import { BadRequestException } from '@nestjs/common';

import {
  assertIdempotencyKey,
  assertSupportedCurrency,
  assertValidMinorUnitAmount,
  currencyExponent,
  SUPPORTED_CURRENCY_EXPONENTS,
} from './money';

describe('money (Phase 6B)', () => {
  it('maps exponents for JPY, USD, KWD', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('usd')).toBe(2);
    expect(currencyExponent('KWD')).toBe(3);
    expect(SUPPORTED_CURRENCY_EXPONENTS.EUR).toBe(2);
  });

  it('rejects unsupported currencies', () => {
    expect(() => assertSupportedCurrency('XXX')).toThrow(BadRequestException);
    expect(() => assertSupportedCurrency('')).toThrow(BadRequestException);
  });

  it('validates minor-unit amounts', () => {
    expect(assertValidMinorUnitAmount('USD', 1099)).toBe(1099);
    expect(assertValidMinorUnitAmount('JPY', 1000)).toBe(1000);
    expect(assertValidMinorUnitAmount('KWD', 1234)).toBe(1234);
    expect(() => assertValidMinorUnitAmount('USD', 1.5)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidMinorUnitAmount('USD', -1)).toThrow(
      BadRequestException,
    );
  });

  it('validates Idempotency-Key format', () => {
    expect(assertIdempotencyKey('order:abc-123')).toBe('order:abc-123');
    expect(() => assertIdempotencyKey('')).toThrow(BadRequestException);
    expect(() => assertIdempotencyKey('bad key!')).toThrow(BadRequestException);
    expect(() => assertIdempotencyKey('a'.repeat(129))).toThrow(
      BadRequestException,
    );
  });
});
