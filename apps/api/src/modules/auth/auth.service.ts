import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { UserStatus } from '../../../generated/prisma';
import { AuthorizationService } from '../rbac/authorization.service';
import { Roles } from '../rbac/constants/roles';
import { AUTH_ALLOWED_STATUSES } from './constants/auth-allowed-statuses';
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

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authorizationService: AuthorizationService,
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
      include: { accountSecurityState: true },
    });

    if (!user) {
      throw this.invalidCredentials();
    }

    if (
      user.accountSecurityState?.lockedUntil &&
      user.accountSecurityState.lockedUntil.getTime() > Date.now()
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_ACCOUNT_LOCKED,
        message: 'Account temporarily locked due to failed login attempts',
      });
    }

    if (!AUTH_ALLOWED_STATUSES.includes(user.status)) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Account is not allowed to sign in',
      });
    }

    const passwordValid = await this.passwordHasher.verify(
      user.passwordHash,
      password,
    );
    if (!passwordValid) {
      await this.recordFailedLogin(user.id);
      throw this.invalidCredentials();
    }

    await this.clearFailedLogins(user.id);

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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: now },
    });

    const accessToken = await this.signAccessToken({
      userId: user.id,
      sessionId: session.id,
      tokenVersion: user.tokenVersion,
    });

    this.setRefreshCookie(res, refreshToken, absoluteExpiresAt);

    const authorization =
      await this.authorizationService.loadPrincipalAuthorization(user.id);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.getOrThrow<number>(
        'auth.jwtAccessTtlSeconds',
      ),
      user: {
        id: user.id,
        email: user.email,
        roles: authorization.roles,
        permissions: authorization.permissions,
      },
    };
  }

  /**
   * Patient self-registration (API-003). Always creates Patient role only.
   * Staff never self-register via this path.
   */
  async register(
    email: string,
    password: string,
    context: LoginContext,
    res: Response,
    profile?: { firstName?: string; lastName?: string },
  ): Promise<AuthTokensDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.USR_EMAIL_CONFLICT,
        message: 'Email already registered',
      });
    }

    const patientRole = await this.prisma.role.findUnique({
      where: { code: Roles.PATIENT },
    });
    if (!patientRole) {
      throw new BadRequestException({
        code: ErrorCodes.SYS_UNEXPECTED,
        message: 'Patient role missing from catalog',
      });
    }

    const passwordHash = await this.passwordHasher.hash(password);
    await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        displayName:
          [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
          null,
        roleAssignments: {
          create: { roleId: patientRole.id },
        },
        accountSecurityState: { create: {} },
      },
    });

    return this.login(normalizedEmail, password, context, res);
  }

  /**
   * Password reset request (API-006). Always returns success shape to avoid enumeration.
   * In local/dev, resetToken is returned when AUTH_EXPOSE_RESET_TOKEN=true.
   */
  async requestPasswordReset(email: string): Promise<{
    success: true;
    resetToken?: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !AUTH_ALLOWED_STATUSES.includes(user.status)) {
      return { success: true };
    }

    return this.issuePasswordResetToken(user.id);
  }

  /**
   * Reset entry point for the Users editor: Users resolves the record, Auth
   * owns the credential. Unlike the public path this surfaces a missing user,
   * because the caller already holds an administrative permission.
   */
  async requestPasswordResetForUser(userId: string): Promise<{
    success: true;
    resetToken?: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'User not found',
      });
    }

    return this.issuePasswordResetToken(user.id);
  }

  private async issuePasswordResetToken(userId: string): Promise<{
    success: true;
    resetToken?: string;
  }> {
    const rawToken = generateOpaqueToken();
    const tokenHash = this.hashRefreshToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    const expose = process.env.AUTH_EXPOSE_RESET_TOKEN === 'true';

    return expose ? { success: true, resetToken: rawToken } : { success: true };
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
    res: Response,
  ): Promise<{ success: true }> {
    const tokenHash = this.hashRefreshToken(token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      throw new BadRequestException({
        code: ErrorCodes.AUTH_RESET_INVALID,
        message: 'Invalid or expired password reset token',
      });
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.clearRefreshCookie(res);
    return { success: true };
  }

  /**
   * Set a credential directly for the Users editor (no reset token). Bumps
   * tokenVersion and revokes sessions so existing access tokens stop resolving.
   */
  async setPasswordForUser(userId: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 12) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Password must be at least 12 characters',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'User not found',
      });
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
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

    if (!AUTH_ALLOWED_STATUSES.includes(session.user.status)) {
      await this.revokeSession(session.id);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException({
        code: ErrorCodes.AUTH_UNAUTHENTICATED,
        message: 'Account is not allowed to sign in',
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

    const authorization =
      await this.authorizationService.loadPrincipalAuthorization(
        session.user.id,
      );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.getOrThrow<number>(
        'auth.jwtAccessTtlSeconds',
      ),
      user: {
        id: session.user.id,
        email: session.user.email,
        roles: authorization.roles,
        permissions: authorization.permissions,
      },
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
      roles: user.roles,
      permissions: user.permissions,
    };
  }

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

    if (!AUTH_ALLOWED_STATUSES.includes(session.user.status)) {
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

    const authorization =
      await this.authorizationService.loadPrincipalAuthorization(
        session.user.id,
      );

    return {
      id: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      tokenVersion: session.user.tokenVersion,
      roles: authorization.roles,
      permissions: authorization.permissions,
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

  private async recordFailedLogin(userId: string): Promise<void> {
    const state = await this.prisma.accountSecurityState.upsert({
      where: { userId },
      create: {
        userId,
        failedLoginCount: 1,
        lastFailedLoginAt: new Date(),
      },
      update: {
        failedLoginCount: { increment: 1 },
        lastFailedLoginAt: new Date(),
      },
    });

    if (state.failedLoginCount + 1 >= MAX_FAILED_LOGINS) {
      await this.prisma.accountSecurityState.update({
        where: { userId },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
  }

  private async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.accountSecurityState.upsert({
      where: { userId },
      create: { userId, failedLoginCount: 0 },
      update: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastFailedLoginAt: null,
      },
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
