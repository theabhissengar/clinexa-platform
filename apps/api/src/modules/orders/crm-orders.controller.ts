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
import { OrderStatus } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  CrmAddOrderNoteDto,
  CrmCancelOrderDto,
  CrmFulfillOrderDto,
  CrmUpdateOrderDto,
  parseOrderStatusFilter,
  parseOrderTypeFilter,
} from './dto/crm-order.dto';
import { OrdersService } from './orders.service';

/**
 * CRM operational Orders surface.
 * Never exposes Create, Class D delete/archive/restore/correct/override.
 * Controllers stay thin — domain lives in OrdersService.
 */
@ApiTags('crm-orders')
@ApiBearerAuth()
@Controller({ path: 'crm/orders', version: '1' })
export class CrmOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'CRM operational order list (API-072)' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('orderType') orderType?: string,
    @Query('patientUserId') patientUserId?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
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

    return this.orders.listOrders({
      q,
      status: statusFilter ?? 'ALL',
      orderType: typeFilter ?? 'ALL',
      patientUserId,
      createdFrom,
      createdTo,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'CRM operational order detail (API-073)' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.orders.getOrderById(id);
    return this.toCrmDetail(order);
  }

  @Get(':id/items')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'CRM order line items (API-076)' })
  items(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listOrderItems(id);
  }

  @Get(':id/notes')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'List order notes (API-076b)' })
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listNotes(id);
  }

  @Post(':id/notes')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Add order note (API-076b)' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmAddOrderNoteDto,
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
  @ApiOperation({ summary: 'Order status history (API-076c)' })
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listStatusHistory(id);
  }

  @Get(':id/activity')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Order activity (API-076d)' })
  activity(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.listActivity(id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({
    summary: 'CRM operational field update (API-076a) — allowlist only',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmUpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.orders.updateOrderFields({
      orderId: id,
      context: 'crm',
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
    });
    return this.toCrmSummary(updated);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permissions.ORD_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'CRM policy cancel (API-074)' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmCancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.orders.transitionOrder({
      orderId: id,
      toStatus: OrderStatus.CANCELLED,
      actorUserId: user.id,
      source: 'crm',
      reason: dto.reason ?? null,
    });
    return this.toCrmSummary(result);
  }

  @Post(':id/fulfill')
  @RequirePermissions(Permissions.ORD_FULFILL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'CRM fulfill/ship (API-075). Inventory Commit deferred to P13e hooks.',
  })
  async fulfill(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrmFulfillOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.trackingNumber !== undefined || dto.carrier !== undefined) {
      await this.orders.updateOrderFields({
        orderId: id,
        context: 'crm',
        actorUserId: user.id,
        trackingNumber: dto.trackingNumber,
        carrier: dto.carrier,
        shippedAt: new Date(),
      });
    }

    const result = await this.orders.transitionOrder({
      orderId: id,
      toStatus: OrderStatus.FULFILLED,
      actorUserId: user.id,
      source: 'crm',
      reason: dto.reason ?? null,
      metadata: {
        trackingNumber: dto.trackingNumber ?? null,
        carrier: dto.carrier ?? null,
      },
    });
    return this.toCrmSummary(result);
  }

  /** Strip Guardian-only admin metadata from CRM payloads. */
  private toCrmDetail(
    order: Awaited<ReturnType<OrdersService['getOrderById']>>,
  ) {
    const { adminTags, reconciliationFlags, ...rest } = order;
    void adminTags;
    void reconciliationFlags;
    return rest;
  }

  private toCrmSummary(order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    orderType: string;
    totalCents: number;
    currency: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    shippedAt?: Date | null;
    updatedAt: Date;
    [key: string]: unknown;
  }) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderType: order.orderType,
      totalCents: order.totalCents,
      currency: order.currency,
      trackingNumber: order.trackingNumber ?? null,
      carrier: order.carrier ?? null,
      shippedAt: order.shippedAt ?? null,
      updatedAt: order.updatedAt,
    };
  }
}
