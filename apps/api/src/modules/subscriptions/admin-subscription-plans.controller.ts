import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionPlanStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  AdminCreateSubscriptionPlanDto,
  AdminUpdateSubscriptionPlanDto,
} from './dto/admin-subscription-plan.dto';
import { SubscriptionPlansService } from './subscription-plans.service';

/**
 * Guardian subscription plan configuration (API-084–087).
 * Plan archive/unpublish uses PERM-SUB-002, not subscription-record Class D.
 */
@ApiTags('admin-subscription-plans')
@ApiBearerAuth()
@Controller({ path: 'admin/subscription-plans', version: '1' })
export class AdminSubscriptionPlansController {
  constructor(private readonly plans: SubscriptionPlansService) {}

  @Get()
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @ApiOperation({ summary: 'Admin plan list (API-084)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('archived') archived?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const lifecycleStatus =
      !status || status === 'ALL'
        ? 'ALL'
        : (Object.values(SubscriptionPlanStatus) as string[]).includes(status)
          ? (status as SubscriptionPlanStatus)
          : undefined;
    if (status && status !== 'ALL' && lifecycleStatus === undefined) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid plan status filter',
      });
    }
    const archivedFilter =
      archived === 'ARCHIVED' || archived === 'ACTIVE' || archived === 'ALL'
        ? archived
        : 'ALL';

    return this.plans.listPlans({
      q,
      lifecycleStatus: lifecycleStatus ?? 'ALL',
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
      archived: archivedFilter,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @ApiOperation({ summary: 'Create plan (API-085)' })
  create(@Body() dto: AdminCreateSubscriptionPlanDto) {
    return this.plans.createPlan({
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      billingInterval: dto.billingInterval,
      intervalCount: dto.intervalCount,
      customIntervalDays: dto.customIntervalDays ?? null,
      currency: dto.currency,
      priceCents: dto.priceCents,
      productBindings: dto.productBindings,
      gracePeriodDays: dto.gracePeriodDays,
      requiresReassessment: dto.requiresReassessment,
      reassessmentIntervalCycles: dto.reassessmentIntervalCycles ?? null,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @ApiOperation({ summary: 'Admin plan detail' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.plans.getById(id, {
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @ApiOperation({ summary: 'Update plan (API-086)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSubscriptionPlanDto,
  ) {
    return this.plans.updatePlan(id, {
      name: dto.name,
      description: dto.description,
      billingInterval: dto.billingInterval,
      intervalCount: dto.intervalCount,
      customIntervalDays: dto.customIntervalDays,
      currency: dto.currency,
      priceCents: dto.priceCents,
      productBindings: dto.productBindings,
      gracePeriodDays: dto.gracePeriodDays,
      requiresReassessment: dto.requiresReassessment,
      reassessmentIntervalCycles: dto.reassessmentIntervalCycles,
    });
  }

  @Post(':id/publish')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Publish plan (API-087). Validates catalog bindings; questionnaire authoring is not P14g (refs/events only).',
  })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.publish(id);
  }

  @Post(':id/unpublish')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unpublish plan (PERM-SUB-002; not subscription Class D)',
  })
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.unpublish(id);
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Archive plan (PERM-SUB-002). Existing subscriptions keep the plan FK.',
  })
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.archive(id);
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.SUB_CONFIGURE_PLANS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore archived plan (PERM-SUB-002; not PERM-SUB-012)',
  })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.plans.restore(id);
  }
}
