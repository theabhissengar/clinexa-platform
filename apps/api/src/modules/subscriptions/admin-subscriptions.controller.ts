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
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionStatus } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { RequireAnyPermissions } from '../rbac/decorators/require-any-permissions.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { parseSubscriptionStatusFilter } from './dto/crm-subscription.dto';
import {
  AdminAddSubscriptionNoteDto,
  AdminClassDReasonDto,
  AdminCorrectionSubscriptionDto,
  AdminCreateSubscriptionDto,
  AdminLifecycleReasonDto,
  AdminOverrideSubscriptionDto,
  AdminUpdateSubscriptionDto,
} from './dto/admin-subscription.dto';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Guardian administrative Subscriptions surface (API-225–240 + activate/renewal POSTs).
 * Thin controller — shared SubscriptionsService owns domain rules.
 * CRM never receives Create / Class D endpoints.
 */
@ApiTags('admin-subscriptions')
@ApiBearerAuth()
@Controller({ path: 'admin/subscriptions', version: '1' })
export class AdminSubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly renewalProcessor: SubscriptionsRenewalProcessor,
  ) {}

  @Get()
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Guardian admin subscription list (API-225)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('patientUserId') patientUserId?: string,
    @Query('nextRenewalFrom') nextRenewalFrom?: string,
    @Query('nextRenewalTo') nextRenewalTo?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('archived') archived?: string,
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

    const archivedFilter =
      archived === 'ARCHIVED' || archived === 'ACTIVE' || archived === 'ALL'
        ? archived
        : 'ALL';

    return this.subscriptions.listSubscriptions({
      q,
      status: statusFilter ?? 'ALL',
      planId,
      patientUserId,
      nextRenewalFrom,
      nextRenewalTo,
      createdFrom,
      createdTo,
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
      archived: archivedFilter,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Guardian admin subscription detail (API-226)' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.subscriptions.getById(id, {
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
    });
  }

  @Post()
  @RequirePermissions(Permissions.SUB_CREATE)
  @ApiOperation({ summary: 'Guardian administrative create (API-227)' })
  create(
    @Body() dto: AdminCreateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.createSubscription({
      context: 'guardian',
      patientUserId: dto.patientUserId,
      planId: dto.planId,
      actorUserId: user.id,
      source: 'guardian',
      customer: dto.customer,
      initialOrderId: dto.initialOrderId ?? null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      shippingPreferenceNotes: dto.shippingPreferenceNotes ?? null,
      opaquePayment: dto.opaquePayment,
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SUB_EDIT)
  @ApiOperation({ summary: 'Guardian administrative edit (API-228)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.updateFields({
      subscriptionId: id,
      context: 'guardian',
      actorUserId: user.id,
      shippingPreferenceNotes: dto.shippingPreferenceNotes,
      opsFlags: dto.opsFlags,
      adminTags: dto.adminTags,
      reconciliationFlags: dto.reconciliationFlags,
    });
  }

  @Post(':id/pause')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause subscription (API-229)' })
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.pause({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'guardian',
      reason: dto.reason ?? null,
    });
  }

  @Post(':id/resume')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume subscription (API-230)' })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.resume({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'guardian',
      reason: dto.reason ?? null,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (API-231)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.cancel({
      subscriptionId: id,
      actorUserId: user.id,
      source: 'guardian',
      reason: dto.reason ?? null,
    });
  }

  @Post(':id/activate')
  @RequirePermissions(Permissions.SUB_LIFECYCLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activate PENDING_SETUP → ACTIVE (additive Guardian path; domain activateInitial)',
  })
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.activateInitial({
      subscriptionId: id,
      toStatus: SubscriptionStatus.ACTIVE,
      actorUserId: user.id,
      source: 'guardian',
      reason: dto.reason ?? 'activated',
    });
  }

  @Post(':id/delete')
  @RequirePermissions(Permissions.SUB_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete subscription (API-232 Class D)' })
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.softDelete({
      subscriptionId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.SUB_ARCHIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive subscription (API-233 Class D)' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.archive({
      subscriptionId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.SUB_RESTORE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore subscription (API-234 Class D)' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.restore({
      subscriptionId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/corrections')
  @RequirePermissions(Permissions.SUB_CORRECT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer snapshot correction (API-235). Not a Payment refund.',
  })
  correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCorrectionSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.correctCustomerSnapshot({
      subscriptionId: id,
      actorUserId: user.id,
      reason: dto.reason,
      classDAuthorized: true,
      customer: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
    });
  }

  @Post(':id/overrides')
  @RequirePermissions(Permissions.SUB_OVERRIDE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Administrative override status (API-236 Class D). Does not silently bypass clinical or payment gates.',
  })
  override(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminOverrideSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptions.overrideStatus({
      subscriptionId: id,
      toStatus: dto.toStatus,
      reason: dto.reason,
      actorUserId: user.id,
      classDAuthorized: true,
    });
  }

  @Get(':id/notes')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'List notes (API-237 GET)' })
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permissions.SUB_EDIT)
  @ApiOperation({ summary: 'Add note (API-237 POST)' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminAddSubscriptionNoteDto,
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
  @ApiOperation({ summary: 'Status and change history (API-238)' })
  async history(@Param('id', ParseUUIDPipe) id: string) {
    const [status, changes] = await Promise.all([
      this.subscriptions.listStatusHistory(id),
      this.subscriptions.listChangeHistory(id),
    ]);
    return { status, changes };
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Subscription activity (API-239)' })
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listActivity(id);
  }

  @Get(':id/renewals')
  @RequirePermissions(Permissions.SUB_VIEW)
  @ApiOperation({ summary: 'Renewal attempt history (API-240)' })
  renewals(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.listRenewalAttempts(id);
  }

  @Post(':id/renewals')
  @RequirePermissions(Permissions.SUB_RENEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Manual renewal (additive admin POST; same domain as CRM API-219) — attempt + order + payment',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Recommended (SUB-IDEM-006). Period-key idempotency always applies; header documents client retry intent.',
  })
  openRenewal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminLifecycleReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ) {
    void dto;
    void _idempotencyKey;
    return this.renewalProcessor.processSubscription({
      subscriptionId: id,
      mode: 'manual',
      actorUserId: user.id,
      source: 'guardian',
    });
  }

  @Post(':id/renewals/:attemptId/retry')
  @RequireAnyPermissions(
    Permissions.SUB_RENEW,
    Permissions.SUB_ASSIST_RENEWAL,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retry current-period attempt (additive admin POST; same domain as CRM API-220)',
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
      source: 'guardian',
    });
  }
}
