import { generateOpaqueToken, hashToken, secureCompare } from './token.util';

describe('token.util', () => {
  it('generates opaque base64url tokens', () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
  });

  it('hashes tokens deterministically with a pepper', () => {
    const a = hashToken('token', 'pepper');
    const b = hashToken('token', 'pepper');
    const c = hashToken('token', 'other');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('compares equal strings securely', () => {
    expect(secureCompare('abc', 'abc')).toBe(true);
    expect(secureCompare('abc', 'abd')).toBe(false);
    expect(secureCompare('abc', 'abcd')).toBe(false);
  });
});
