import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

/**
 * Password hashing abstraction. Argon2id is the current algorithm;
 * call sites depend on this service, not on argon2 directly.
 */
@Injectable()
export class PasswordHasher {
  constructor(private readonly configService: ConfigService) {}

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.configService.getOrThrow<number>(
        'auth.argon2.memoryCost',
      ),
      timeCost: this.configService.getOrThrow<number>('auth.argon2.timeCost'),
      parallelism: this.configService.getOrThrow<number>(
        'auth.argon2.parallelism',
      ),
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
