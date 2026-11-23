import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutRequestDto } from './dto/checkout.dto';

@ApiTags('checkout')
@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post()
  @RequirePermissions(Permissions.CHK_FINALIZE, Permissions.PAY_PAY)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Thin patient checkout: create ONE_TIME PAYMENT_PENDING order and authorize (Phase 6D)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Client key; stored as checkout:user:{userId}:{key}',
  })
  checkoutOrder(
    @Body() dto: CheckoutRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checkout.checkout(user.id, dto, idempotencyKey);
  }
}
