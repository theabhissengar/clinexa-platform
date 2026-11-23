import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ErrorCodes } from '../../common/constants/error-codes';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  InitiateRefundDto,
  ListPaymentsQueryDto,
  RECONCILE_OUTCOMES,
  type ReconcileOutcome,
  type ReconcilePaymentResponseDto,
} from './dto/payment.dto';
import { assertIdempotencyKey } from './money';
import { PaymentsService } from './payments.service';

const RECONCILE_OUTCOME_SET = new Set<string>(RECONCILE_OUTCOMES);

@ApiTags('admin-payments')
@ApiBearerAuth()
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentsController {
  private readonly logger = new Logger(AdminPaymentsController.name);

  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permissions.GRD_ACCESS_SHELL, Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian payment list' })
  list(@Query() query: ListPaymentsQueryDto) {
    return this.payments.listPayments({
      q: query.q,
      status: query.status ?? 'ALL',
      provider: query.provider,
      orderId: query.orderId,
      subscriptionId: query.subscriptionId,
      lifecycleState: query.lifecycleState ?? 'ALL',
      purpose: query.purpose ?? 'ALL',
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      skip: query.skip ?? 0,
      take: query.take ?? 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.GRD_ACCESS_SHELL, Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'Guardian operational payment detail' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getPaymentDetail(id);
  }

  @Post(':id/refunds')
  @RequirePermissions(
    Permissions.GRD_ACCESS_SHELL,
    Permissions.PAY_INITIATE_REFUND,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Staff refund (API-067) — Idempotency-Key required',
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
    return this.payments.initiateRefund({
      paymentId: id,
      amountCents: dto.amountCents,
      reason: dto.reason,
      actorUserId: user.id,
      idempotencyKey: assertIdempotencyKey(idempotencyKey),
    });
  }

  @Post(':id/reconcile')
  @RequirePermissions(Permissions.GRD_ACCESS_SHELL, Permissions.ORD_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Staff payment reconcile (API-067d) — reuses PaymentsService.reconcilePaymentById',
  })
  async reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReconcilePaymentResponseDto> {
    const result = await this.payments.reconcilePaymentById(id);
    if (result.outcome === 'not_found') {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Payment not found',
      });
    }
    if (
      result.outcome === 'error' ||
      !RECONCILE_OUTCOME_SET.has(result.outcome)
    ) {
      this.logger.warn(
        `staff reconcile paymentId=${result.paymentId} actor=${user.id} outcome=${result.outcome}`,
      );
      throw new InternalServerErrorException({
        code: ErrorCodes.SYS_UNEXPECTED,
        message: 'Payment reconciliation failed',
      });
    }
    this.logger.log(
      `staff reconcile paymentId=${result.paymentId} actor=${user.id} outcome=${result.outcome}`,
    );
    return {
      paymentId: result.paymentId,
      outcome: result.outcome as ReconcileOutcome,
    };
  }
}
