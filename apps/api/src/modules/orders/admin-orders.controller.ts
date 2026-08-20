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

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  parseOrderStatusFilter,
  parseOrderTypeFilter,
} from './dto/crm-order.dto';
import {
  AdminAddNoteDto,
  AdminClassDReasonDto,
  AdminCorrectionDto,
  AdminCreateOrderDto,
  AdminOverrideDto,
  AdminTransitionDto,
  AdminUpdateOrderDto,
} from './dto/admin-order.dto';
import { OrdersService } from './orders.service';

/**
 * Guardian administrative Orders surface (API-204–212).
 * Thin controller — shared OrdersService owns domain rules.
 * CRM never receives these Create / Class D endpoints.
 */
@ApiTags('admin-orders')
@ApiBearerAuth()
@Controller({ path: 'admin/orders', version: '1' })
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian admin order list (API-204)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('patientUserId') patientUserId?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('archived') archived?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const statusFilter = parseOrderStatusFilter(status);
    if (status && status !== 'ALL' && statusFilter === undefined) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid status filter',
      });
    }
    const typeFilter = parseOrderTypeFilter(orderType);
    if (orderType && orderType !== 'ALL' && typeFilter === undefined) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid orderType filter',
      });
    }

    const archivedFilter =
      archived === 'ARCHIVED' || archived === 'ACTIVE' || archived === 'ALL'
        ? archived
        : 'ALL';

    return this.orders.listOrders({
      q,
      status: statusFilter ?? 'ALL',
      orderType: typeFilter ?? 'ALL',
      patientUserId,
      createdFrom,
      createdTo,
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
      archived: archivedFilter,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian admin order detail (API-205)' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.orders.getOrderById(id, {
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
    });
  }

  @Post()
  @RequirePermissions(Permissions.ORD_CREATE)
  @ApiOperation({ summary: 'Guardian administrative create (API-206)' })
  create(
    @Body() dto: AdminCreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.createOrder({
      patientUserId: dto.patientUserId,
      lines: dto.lines,
      shippingAddress: dto.shippingAddress,
      billingAddress: dto.billingAddress,
      orderType: dto.orderType,
      subscriptionId: dto.subscriptionId,
      shippingTotalCents: dto.shippingTotalCents,
      discountTotalCents: dto.discountTotalCents,
      taxTotalCents: dto.taxTotalCents,
      currency: dto.currency,
      initialStatus: dto.initialStatus,
      actorUserId: user.id,
      source: 'guardian',
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Guardian administrative edit (API-207)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.updateOrderFields({
      orderId: id,
      context: 'guardian',
      actorUserId: user.id,
      trackingNumber: dto.trackingNumber,
      carrier: dto.carrier,
      shippedAt:
        dto.shippedAt === undefined
          ? undefined
          : dto.shippedAt === null
            ? null
            : new Date(dto.shippedAt),
      shippingPhone: dto.shippingPhone,
      adminTags: dto.adminTags,
      reconciliationFlags: dto.reconciliationFlags,
    });
  }

  @Post(':id/delete')
  @RequirePermissions(Permissions.ORD_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete order (API-208 Class D)' })
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.softDeleteOrder({
      orderId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/archive')
  @RequirePermissions(Permissions.ORD_ARCHIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive order (API-209 Class D)' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.archiveOrder({
      orderId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/restore')
  @RequirePermissions(Permissions.ORD_RESTORE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore order (API-210 Class D)' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminClassDReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.restoreOrder({
      orderId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
      classDAuthorized: true,
    });
  }

  @Post(':id/corrections')
  @RequirePermissions(Permissions.ORD_CORRECT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Financial correction adjustment (API-211 Class D). Does not execute Payments.',
  })
  correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.addAdjustment({
      orderId: id,
      amountCents: dto.amountCents,
      kind: dto.kind,
      reason: dto.reason ?? null,
      paymentRef: dto.paymentRef ?? null,
      actorUserId: user.id,
      classDAuthorized: true,
      metadata: { source: 'guardian_correct', platformAuditDeferred: true },
    });
  }

  @Post(':id/overrides')
  @RequirePermissions(Permissions.ORD_OVERRIDE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Administrative override status transition (API-212 Class D)',
  })
  override(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminOverrideDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.overrideOrder({
      orderId: id,
      toStatus: dto.toStatus,
      reason: dto.reason,
      actorUserId: user.id,
      classDAuthorized: true,
    });
  }

  @Post(':id/transitions')
  @RequirePermissions(Permissions.ORD_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Normal lifecycle transition (Guardian; uses domain graph)',
  })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminTransitionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.transitionOrder({
      orderId: id,
      toStatus: dto.toStatus,
      actorUserId: user.id,
      source: 'guardian',
      reason: dto.reason ?? null,
    });
  }

  @Get(':id/notes')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'List order notes' })
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Add order note' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminAddNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orders.addNote({
      orderId: id,
      authorUserId: user.id,
      body: dto.body,
    });
  }

  @Get(':id/history')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Order status history' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listStatusHistory(id);
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Order activity' })
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listActivity(id);
  }

  @Get(':id/items')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Order line items' })
  items(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listOrderItems(id);
  }
}
