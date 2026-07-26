import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

import { UserStatus } from '../../../generated/prisma';
import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password.hasher';
import { hashToken } from './utils/token.util';

describe('AuthService', () => {
  const refreshSecret = 'test-refresh-secret-at-least-32-chars!!';
  let authService: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    session: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let passwordHasher: { verify: jest.Mock; hash: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  const configMap: Record<string, unknown> = {
    'auth.jwtAccessSecret': 'test-access-secret-at-least-32-chars!!!',
    'auth.jwtRefreshSecret': refreshSecret,
    'auth.jwtAccessTtlSeconds': 900,
    'auth.idleTimeoutMinutes': 30,
    'auth.absoluteTimeoutHours': 12,
    'auth.refreshCookieName': 'clinexa_refresh',
    'auth.cookieSecure': false,
    'auth.cookieSameSite': 'lax',
    'auth.cookiePath': '/v1/auth',
    'auth.argon2.memoryCost': 65536,
    'auth.argon2.timeCost': 3,
    'auth.argon2.parallelism': 4,
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      session: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    passwordHasher = {
      verify: jest.fn(),
      hash: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('access.jwt.token'),
    };
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (!(key in configMap)) {
          throw new Error(`Missing config ${key}`);
        }
        return configMap[key];
      }),
    };
    res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    authService = new AuthService(
      prisma as unknown as PrismaService,
      passwordHasher as unknown as PasswordHasher,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('rejects unknown users with ERR-AUTH-002', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login(
          'missing@example.com',
          'password12345',
          {},
          res as unknown as Response,
        ),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
        },
      });
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('rejects invalid passwords with ERR-AUTH-002', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'staff@example.com',
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        tokenVersion: 0,
      });
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        authService.login(
          'staff@example.com',
          'wrong-password',
          {},
          res as unknown as Response,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues access token and refresh cookie on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'staff@example.com',
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        tokenVersion: 0,
      });
      passwordHasher.verify.mockResolvedValue(true);
      prisma.session.create.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
      });

      const result = await authService.login(
        'staff@example.com',
        'password12345',
        { userAgent: 'jest', ip: '127.0.0.1' },
        res as unknown as Response,
      );

      expect(result.accessToken).toBe('access.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'staff@example.com',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'clinexa_refresh',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          path: '/v1/auth',
          sameSite: 'lax',
          secure: false,
        }),
      );
      expect(prisma.session.create).toHaveBeenCalled();
    });
  });

  describe('validateAccessTokenPayload', () => {
    it('returns null for revoked sessions', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        user: {
          id: 'user-1',
          email: 'staff@example.com',
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
        },
      });

      const result = await authService.validateAccessTokenPayload({
        sub: 'user-1',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenVersion: 0,
      });

      expect(result).toBeNull();
    });

    it('returns null when idle timeout exceeded', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        lastSeenAt: new Date(Date.now() - 31 * 60 * 1000),
        user: {
          id: 'user-1',
          email: 'staff@example.com',
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
        },
      });

      const result = await authService.validateAccessTokenPayload({
        sub: 'user-1',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenVersion: 0,
      });

      expect(result).toBeNull();
    });

    it('returns principal and touches lastSeenAt for valid sessions', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        lastSeenAt: new Date(),
        user: {
          id: 'user-1',
          email: 'staff@example.com',
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
        },
      });
      prisma.session.update.mockResolvedValue({});

      const result = await authService.validateAccessTokenPayload({
        sub: 'user-1',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenVersion: 0,
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'staff@example.com',
        sessionId: 'session-1',
        tokenVersion: 0,
      });
      expect(prisma.session.update).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rotates refresh token for an active session', async () => {
      const plainRefresh = 'plain-refresh-token-value';
      const refreshHash = hashToken(plainRefresh, refreshSecret);

      prisma.session.findFirst.mockResolvedValue({
        id: 'session-1',
        refreshTokenHash: refreshHash,
        revokedAt: null,
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        lastSeenAt: new Date(),
        user: {
          id: 'user-1',
          email: 'staff@example.com',
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
        },
      });
      prisma.session.update.mockResolvedValue({});

      const result = await authService.refresh(
        plainRefresh,
        res as unknown as Response,
      );

      expect(result.accessToken).toBe('access.jwt.token');
      expect(prisma.session.update).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the refresh cookie', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      await authService.logout(
        {
          id: 'user-1',
          email: 'staff@example.com',
          sessionId: 'session-1',
          tokenVersion: 0,
        },
        res as unknown as Response,
      );

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', revokedAt: null },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
          revokedAt: expect.any(Date),
        },
      });
      expect(res.clearCookie).toHaveBeenCalledWith(
        'clinexa_refresh',
        expect.objectContaining({ path: '/v1/auth' }),
      );
    });
  });
});
