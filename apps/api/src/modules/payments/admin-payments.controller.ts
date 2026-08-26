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
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentStatus } from '../../../generated/prisma';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { InitiateRefundDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

function parsePaymentStatus(
  raw?: string,
): PaymentStatus | 'ALL' | undefined {
  if (!raw || raw === 'ALL') {
    return 'ALL';
  }
  if ((Object.values(PaymentStatus) as string[]).includes(raw)) {
    return raw as PaymentStatus;
  }
  return undefined;
}

@ApiTags('admin-payments')
@ApiBearerAuth()
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian payment list' })
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const statusFilter = parsePaymentStatus(status);
    if (status && status !== 'ALL' && statusFilter === undefined) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid status filter',
      });
    }
    return this.payments.listPayments({
      q,
      status: statusFilter ?? 'ALL',
      provider,
      createdFrom,
      createdTo,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian operational payment detail' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getPaymentDetail(id);
  }

  @Post(':id/refunds')
  @RequirePermissions(Permissions.PAY_INITIATE_REFUND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff refund (API-067) — Idempotency-Key required' })
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
