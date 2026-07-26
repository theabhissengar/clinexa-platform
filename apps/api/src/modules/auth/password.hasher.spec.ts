import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { PasswordHasher } from './password.hasher';

describe('PasswordHasher', () => {
  let hasher: PasswordHasher;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, number> = {
          'auth.argon2.memoryCost': 16384,
          'auth.argon2.timeCost': 2,
          'auth.argon2.parallelism': 1,
        };
        return map[key];
      }),
    };

    hasher = new PasswordHasher(configService as unknown as ConfigService);
  });

  it('hashes and verifies a password with Argon2id', async () => {
    const hash = await hasher.hash('secure-password-12');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, 'secure-password-12')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('returns false for malformed hashes', async () => {
    await expect(hasher.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('can verify hashes produced by argon2 directly', async () => {
    const hash = await argon2.hash('secure-password-12', {
      type: argon2.argon2id,
      memoryCost: 16384,
      timeCost: 2,
      parallelism: 1,
    });
    await expect(hasher.verify(hash, 'secure-password-12')).resolves.toBe(true);
  });
});
