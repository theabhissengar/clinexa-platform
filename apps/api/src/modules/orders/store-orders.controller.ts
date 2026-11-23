import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CheckoutService } from './checkout.service';
import { PayOrderDto } from './dto/checkout.dto';

@ApiTags('store-orders')
@Controller({ path: 'orders', version: '1' })
export class StoreOrdersController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get(':id')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Patient get own order (no clientSecret)' })
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkout.getOwnedOrder(user.id, id);
  }

  @Post(':id/pay')
  @RequirePermissions(Permissions.PAY_PAY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Patient pay or reauthorize eligible order (Idempotency-Key required)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkout.payOrder(user.id, id, dto, idempotencyKey);
  }

  @Post(':id/payments/:paymentId/reconcile')
  @RequirePermissions(Permissions.PAY_PAY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reconcile payment after SCA; returns clientSecret only if still requires_action',
  })
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkout.reconcilePayment(user.id, id, paymentId);
  }
}
