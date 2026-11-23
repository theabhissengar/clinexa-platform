import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentsService } from './payments.service';
import { StripePaymentAdapter } from './stripe-payment.adapter';
import { mapStripeEventToEnvelope } from './stripe-webhook.mapper';

@ApiTags('payments-webhooks')
@Controller({ path: 'webhooks/payments/stripe', version: '1' })
export class PaymentsStripeWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    @Optional()
    @Inject(StripePaymentAdapter)
    private readonly stripeAdapter: StripePaymentAdapter | null,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook ingest (HMAC + raw body)' })
  async ingest(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!this.stripeAdapter) {
      throw new UnauthorizedException({
        code: ErrorCodes.PAY_WEBHOOK_INVALID,
        message: 'Stripe provider is not active',
      });
    }
    const rawBody = req.rawBody;
    if (!rawBody || !signature) {
      throw new UnauthorizedException({
        code: ErrorCodes.PAY_WEBHOOK_INVALID,
        message: 'Missing Stripe signature or raw body',
      });
    }

    let event;
    try {
      event = this.stripeAdapter.constructEvent(rawBody, signature);
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.PAY_WEBHOOK_INVALID,
        message: 'Invalid Stripe webhook signature',
      });
    }

    const mapped = mapStripeEventToEnvelope(event);
    if (!mapped.envelope) {
      return { accepted: true, duplicate: false };
    }

    return this.payments.ingestWebhook({
      secretHeader: undefined,
      envelope: mapped.envelope,
      verificationMode: 'preverified',
      skipFinancialMutation: mapped.noOp,
    });
  }
}
