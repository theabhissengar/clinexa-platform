import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import {
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterDto,
} from './dto/register.dto';
import { SessionUserDto } from './dto/session-user.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Patient self-registration (API-003); creates Patient role only',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.authService.register(
      dto.email,
      dto.password,
      {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      res,
      { firstName: dto.firstName, lastName: dto.lastName },
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.authService.login(
      dto.email,
      dto.password,
      {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
      res,
    );
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset (API-006)' })
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
  ): Promise<{ success: true; resetToken?: string }> {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm password reset (API-007)' })
  async confirmPasswordReset(
    @Body() dto: PasswordResetConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    return this.authService.confirmPasswordReset(dto.token, dto.password, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a new access token when a valid refresh credential is present. Browser clients send credentials automatically.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensDto> {
    return this.authService.refresh(this.extractRefreshToken(req), res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true }> {
    await this.authService.logout(user, res);
    return { success: true };
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return the current authenticated identity',
    description:
      'Returns identity plus roles and permissions resolved server-side. No permission decorator — authenticated access only.',
  })
  session(@CurrentUser() user: AuthenticatedUser): SessionUserDto {
    return this.authService.getSession(user);
  }

  private extractRefreshToken(req: Request): string | undefined {
    const cookieName = this.configService.getOrThrow<string>(
      'auth.refreshCookieName',
    );
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[cookieName];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
