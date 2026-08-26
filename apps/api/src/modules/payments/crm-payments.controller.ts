import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { PaymentsService } from './payments.service';

@ApiTags('crm-payments')
@ApiBearerAuth()
@Controller({ path: 'crm/payments', version: '1' })
export class CrmPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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
