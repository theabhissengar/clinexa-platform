import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { InitiateRefundDto } from './dto/payment.dto';
import {
  AddSavedPaymentMethodDto,
  UpdateSavedPaymentMethodDto,
} from './dto/saved-payment-method.dto';
import { PaymentsService } from './payments.service';

@ApiTags('crm-payments')
@ApiBearerAuth()
@Controller({ path: 'crm/payments', version: '1' })
export class CrmPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('users/:userId/payment-methods')
  @RequirePermissions(Permissions.PAY_MANAGE_METHODS)
  @ApiOperation({ summary: 'List saved payment methods for a patient (CRM)' })
  listUserPaymentMethods(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.payments.listSavedMethodsForUser(userId);
  }

  @Post('users/:userId/payment-methods')
  @RequirePermissions(Permissions.PAY_MANAGE_METHODS)
  @ApiOperation({ summary: 'Add simulated saved payment method (CRM)' })
  addUserPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AddSavedPaymentMethodDto,
  ) {
    return this.payments.addSavedMethodForUser({
      userId,
      brand: dto.brand,
      last4: dto.last4,
      expMonth: dto.expMonth,
      expYear: dto.expYear,
      isDefault: dto.isDefault,
    });
  }

  @Patch('users/:userId/payment-methods/:methodId')
  @RequirePermissions(Permissions.PAY_MANAGE_METHODS)
  @ApiOperation({ summary: 'Update saved payment method metadata (CRM)' })
  updateUserPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
    @Body() dto: UpdateSavedPaymentMethodDto,
  ) {
    return this.payments.updateSavedMethodMetadata(userId, methodId, dto);
  }

  @Post('users/:userId/payment-methods/:methodId/make-default')
  @RequirePermissions(Permissions.PAY_MANAGE_METHODS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set default saved payment method (CRM)' })
  makeDefaultUserPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.setDefaultSavedMethod(userId, methodId);
  }

  @Delete('users/:userId/payment-methods/:methodId')
  @RequirePermissions(Permissions.PAY_MANAGE_METHODS)
  @ApiOperation({ summary: 'Delete saved payment method (CRM)' })
  deleteUserPaymentMethod(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.deleteSavedMethod(userId, methodId);
  }

  @Post(':id/refunds')
  @RequirePermissions(Permissions.PAY_INITIATE_REFUND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'CRM refund assist (API-067) — same PaymentsService as Guardian',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Maps to Refund.idempotencyKey (globally unique). Clients prefix `{paymentId}:{uuid}`.',
  })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiateRefundDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Idempotency-Key header is required',
      });
    }
    return this.payments.initiateRefund({
      paymentId: id,
      amountCents: dto.amountCents,
      reason: dto.reason,
      actorUserId: user.id,
      idempotencyKey: idempotencyKey.trim(),
    });
  }
}
