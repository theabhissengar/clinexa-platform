import { UnauthorizedException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentsStripeWebhookController } from './payments-stripe-webhook.controller';
import { PaymentsService } from './payments.service';
import { StripePaymentAdapter } from './stripe-payment.adapter';

describe('PaymentsStripeWebhookController (Phase 6G T2)', () => {
  const ingestWebhook = jest.fn();
  const payments = { ingestWebhook } as unknown as PaymentsService;

  beforeEach(() => {
    ingestWebhook.mockClear();
  });

  it('returns 401 when Stripe HMAC constructEvent rejects', async () => {
    const stripeAdapter = {
      constructEvent: jest.fn(() => {
        throw new Error('bad sig');
      }),
    } as unknown as StripePaymentAdapter;
    const controller = new PaymentsStripeWebhookController(
      payments,
      stripeAdapter,
    );

    await expect(
      controller.ingest({ rawBody: Buffer.from('{}') } as never, 't=1,v1=bad'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      controller.ingest({ rawBody: Buffer.from('{}') } as never, 't=1,v1=bad'),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_WEBHOOK_INVALID },
    });
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it('returns 401 when signature or raw body is missing', async () => {
    const stripeAdapter = {
      constructEvent: jest.fn(),
    } as unknown as StripePaymentAdapter;
    const controller = new PaymentsStripeWebhookController(
      payments,
      stripeAdapter,
    );

    await expect(
      controller.ingest({ rawBody: Buffer.from('{}') } as never, undefined),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_WEBHOOK_INVALID },
    });
  });
});
