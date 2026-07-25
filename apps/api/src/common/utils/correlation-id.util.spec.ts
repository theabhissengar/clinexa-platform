import {
  isValidCorrelationId,
  resolveCorrelationId,
} from './correlation-id.util';
import { CORRELATION_ID_MAX_LENGTH } from '../constants/http-headers';

describe('correlation-id.util', () => {
  it('accepts printable ASCII within max length', () => {
    expect(isValidCorrelationId('test-id-123')).toBe(true);
    expect(isValidCorrelationId('a'.repeat(CORRELATION_ID_MAX_LENGTH))).toBe(
      true,
    );
  });

  it('rejects empty, whitespace-only, too long, and control characters', () => {
    expect(isValidCorrelationId('')).toBe(false);
    expect(isValidCorrelationId('   ')).toBe(false);
    expect(
      isValidCorrelationId('a'.repeat(CORRELATION_ID_MAX_LENGTH + 1)),
    ).toBe(false);
    expect(isValidCorrelationId('bad\nid')).toBe(false);
    expect(isValidCorrelationId('bad\tid')).toBe(false);
  });

  it('returns client value when valid', () => {
    expect(resolveCorrelationId('client-corr-1')).toBe('client-corr-1');
  });

  it('generates a UUID when missing or invalid', () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(resolveCorrelationId(undefined)).toMatch(uuidPattern);
    expect(resolveCorrelationId('')).toMatch(uuidPattern);
    expect(resolveCorrelationId('bad\nid')).toMatch(uuidPattern);
    expect(
      resolveCorrelationId('x'.repeat(CORRELATION_ID_MAX_LENGTH + 1)),
    ).toMatch(uuidPattern);
  });
});
