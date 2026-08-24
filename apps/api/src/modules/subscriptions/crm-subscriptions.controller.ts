import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SubscriptionStatus } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { RequireAnyPermissions } from '../rbac/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  CrmAddSubscriptionNoteDto,
  CrmLifecycleReasonDto,
  CrmUpdateSubscriptionDto,
  parseSubscriptionStatusFilter,
} from './dto/crm-subscription.dto';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';
import { SubscriptionsService } from './subscriptions.service';

/**
 * CRM operational Subscriptions surface (P14c).
 * Never exposes Create or Class D delete/archive/restore/correct/override.
 */
@ApiTags('crm-subscriptions')
@ApiBearerAuth()
@Controller({ path: 'crm/subscriptions', version: '1' })
export class CrmSubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly renewalProcessor: SubscriptionsRenewalProcessor,
  ) {}

  @Get()
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'CRM staff subscription list (API-083)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('patientUserId') patientUserId?: string,
    @Query('nextRenewalFrom') nextRenewalFrom?: string,
    @Query('nextRenewalTo') nextRenewalTo?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const statusFilter = parseSubscriptionStatusFilter(status);
    if (status && status !== 'ALL' && statusFilter === undefined) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid status filter',
      });
    }

    return this.subscriptions.listSubscriptions({
      q,
      status: statusFilter ?? 'ALL',
      planId,
      patientUserId,
      nextRenewalFrom,
      nextRenewalTo,
      createdFrom,
      createdTo,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'CRM subscription detail (API-213)' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const subscription = await this.subscriptions.getById(id);
    return this.toCrmDetail(subscription);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SUB_EDIT)
  @ApiOperation({ summary: 'CRM ops edit (API-214) — allowlist only' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmUpdateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.subscriptions.updateFields({
      subscriptionId: id,
      context: 'crm',
      actorUserId: user.id,
      shippingPreferenceNotes: dto.shippingPreferenceNotes,
      opsFlags: dto.opsFlags,
    });
    return this.toCrmSummary(updated);
  }

  @Post(':id/pause')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause subscription (API-215)' })
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.subscriptions.pause({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'crm',
      reason: dto.reason ?? null,
    });
    return this.toCrmSummary(result);
  }

  @Post(':id/resume')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume subscription (API-216)' })
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.subscriptions.resume({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'crm',
      reason: dto.reason ?? null,
    });
    return this.toCrmSummary(result);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Policy cancel assist (API-217)' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.subscriptions.cancel({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'crm',
      reason: dto.reason ?? null,
    });
    return this.toCrmSummary(result);
  }

  @Get(':id/renewals')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Renewal attempt history (API-218)' })
  renewals(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listRenewalAttempts(id);
  }

  @Post(':id/renewals')
  @RequirePermissions(Permissions.SUB_RENEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manual renewal (API-219) — opens attempt, order, and payment',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Recommended (SUB-IDEM-006). Period-key idempotency always applies; header documents client retry intent.',
  })
  openRenewal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ) {
    void dto;
    void _idempotencyKey;
    return this.renewalProcessor.processSubscription({
      subscriptionId: id,
      mode: 'manual',
      actorUserId: user.id,
      source: 'crm',
    });
  }

  @Post(':id/renewals/:attemptId/retry')
  @RequireAnyPermissions(Permissions.SUB_RENEW, Permissions.SUB_ASSIST_RENEWAL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry current-period attempt (API-220) — same order/payment path',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Recommended (SUB-IDEM-006). Same period key + order; retry continues the existing attempt.',
  })
  retryRenewal(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ) {
    void attemptId;
    void _idempotencyKey;
    return this.renewalProcessor.processSubscription({
      subscriptionId: id,
      mode: 'retry',
      actorUserId: user.id,
      source: 'crm',
    });
  }

  @Get(':id/notes')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'List notes (API-221)' })
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permissions.SUB_EDIT)
  @ApiOperation({ summary: 'Add note (API-222)' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmAddSubscriptionNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.addNote({
      subscriptionId: id,
      authorUserId: user.id,
      body: dto.body,
    });
  }

  @Get(':id/history')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Status and change history (API-223)' })
  async history(@Param('id', ParseUUIDPipe) id: string) {
    const [status, changes] = await Promise.all([
      this.subscriptions.listStatusHistory(id),
      this.subscriptions.listChangeHistory(id),
    ]);
    return { status, changes };
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Subscription activity (API-224)' })
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listActivity(id);
  }

  private toCrmDetail(
    subscription: Awaited<ReturnType<SubscriptionsService['getById']>>,
  ) {
    const { adminTags, reconciliationFlags, ...rest } = subscription;
    void adminTags;
    void reconciliationFlags;
    return rest;
  }

  private toCrmSummary(subscription: {
    id: string;
    subscriptionNumber: string | null;
    status: SubscriptionStatus;
    updatedAt: Date;
    [key: string]: unknown;
  }) {
    return {
      id: subscription.id,
      subscriptionNumber: subscription.subscriptionNumber,
      status: subscription.status,
      updatedAt: subscription.updatedAt,
    };
  }
}
