import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserStatus } from '../../../generated/prisma';
import type { AuthTokensDto } from './dto/auth-tokens.dto';
import type { SessionUserDto } from './dto/session-user.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordHasher } from './password.hasher';
import { generateOpaqueToken, hashToken } from './utils/token.util';

export type LoginContext = {
  userAgent?: string;
  ip?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    context: LoginContext,
    res: Response,
  ): Promise<AuthTokensDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw this.invalidCredentials();
    }

    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Account is disabled',
      });
    }

    const passwordValid = await this.passwordHasher.verify(
      user.passwordHash,
      password,
    );
    if (!passwordValid) {
      throw this.invalidCredentials();
    }

    const now = new Date();
    const absoluteExpiresAt = this.computeAbsoluteExpiry(now);
    const refreshToken = generateOpaqueToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        absoluteExpiresAt,
        lastSeenAt: now,
        userAgent: context.userAgent,
        ip: context.ip,
      },
    });

    const accessToken = await this.signAccessToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion,
    });

    this.setRefreshCookie(res, refreshToken, absoluteExpiresAt);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.getOrThrow<number>(
        'auth.jwtAccessTtlSeconds',
      ),
      user: { id: user.id, email: user.email },
    };
  }

  async refresh(
    refreshToken: string | undefined,
    res: Response,
  ): Promise<AuthTokensDto> {
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Refresh token required',
      });
    }

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Invalid refresh token',
      });
    }

    const expiryReason = this.getSessionExpiryReason(session);
    if (expiryReason) {
      await this.revokeSession(session.id);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_SESSION_EXPIRED,
        message: expiryReason,
      });
    }

    if (session.user.status === UserStatus.DISABLED) {
      await this.revokeSession(session.id);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Account is disabled',
      });
    }

    const now = new Date();
    const newRefreshToken = generateOpaqueToken();
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastSeenAt: now,
      },
    });

    const accessToken = await this.signAccessToken({
      userId: session.user.id,
      sessionId: session.id,
      tokenVersion: session.user.tokenVersion,
    });

    this.setRefreshCookie(res, newRefreshToken, session.absoluteExpiresAt);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.getOrThrow<number>(
        'auth.jwtAccessTtlSeconds',
      ),
      user: { id: session.user.id, email: session.user.email },
    };
  }

  async logout(user: AuthenticatedUser, res: Response): Promise<void> {
    await this.revokeSession(user.sessionId);
    this.clearRefreshCookie(res);
  }

  getSession(user: AuthenticatedUser): SessionUserDto {
    return {
      id: user.id,
      email: user.email,
      sessionId: user.sessionId,
    };
  }

  /**
   * Validates JWT payload against the Session table (revocation authority).
   */
  async validateAccessTokenPayload(
    payload: JwtPayload,
  ): Promise<AuthenticatedUser | null> {
    const userId = payload.userId ?? payload.sub;
    if (!userId || !payload.sessionId) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.userId !== userId) {
      return null;
    }

    if (session.user.tokenVersion !== payload.tokenVersion) {
      return null;
    }

    if (session.user.status === UserStatus.DISABLED) {
      return null;
    }

    const expiryReason = this.getSessionExpiryReason(session);
    if (expiryReason) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      id: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      tokenVersion: session.user.tokenVersion,
    };
  }

  setRefreshCookie(
    res: Response,
    token: string,
    absoluteExpiresAt: Date,
  ): void {
    const maxAgeMs = Math.max(0, absoluteExpiresAt.getTime() - Date.now());
    res.cookie(this.refreshCookieName(), token, {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('auth.cookieSecure'),
      sameSite: this.configService.getOrThrow<'lax'>('auth.cookieSameSite'),
      path: this.configService.getOrThrow<string>('auth.cookiePath'),
      maxAge: maxAgeMs,
    });
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie(this.refreshCookieName(), {
      httpOnly: true,
      secure: this.configService.getOrThrow<boolean>('auth.cookieSecure'),
      sameSite: this.configService.getOrThrow<'lax'>('auth.cookieSameSite'),
      path: this.configService.getOrThrow<string>('auth.cookiePath'),
    });
  }

  private async signAccessToken(params: {
    userId: string;
    sessionId: string;
    tokenVersion: number;
  }): Promise<string> {
    const payload: JwtPayload = {
      sub: params.userId,
      userId: params.userId,
      sessionId: params.sessionId,
      tokenVersion: params.tokenVersion,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('auth.jwtAccessSecret'),
      expiresIn: this.configService.getOrThrow<number>(
        'auth.jwtAccessTtlSeconds',
      ),
    });
  }

  private hashRefreshToken(token: string): string {
    return hashToken(
      token,
      this.configService.getOrThrow<string>('auth.jwtRefreshSecret'),
    );
  }

  private computeAbsoluteExpiry(from: Date): Date {
    const hours = this.configService.getOrThrow<number>(
      'auth.absoluteTimeoutHours',
    );
    return new Date(from.getTime() + hours * 60 * 60 * 1000);
  }

  private getSessionExpiryReason(session: {
    absoluteExpiresAt: Date;
    lastSeenAt: Date;
  }): string | null {
    const now = Date.now();
    if (session.absoluteExpiresAt.getTime() <= now) {
      return 'Session absolute lifetime exceeded';
    }

    const idleMinutes = this.configService.getOrThrow<number>(
      'auth.idleTimeoutMinutes',
    );
    const idleMs = idleMinutes * 60 * 1000;
    if (session.lastSeenAt.getTime() + idleMs <= now) {
      return 'Session idle timeout exceeded';
    }

    return null;
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private refreshCookieName(): string {
    return this.configService.getOrThrow<string>('auth.refreshCookieName');
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    });
  }
}
