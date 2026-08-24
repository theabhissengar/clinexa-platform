import { Module } from '@nestjs/common';

import { PAYMENT_GATEWAY } from './payment.types';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';
import { WorkerSecretGuard } from './worker-secret.guard';

@Module({
  controllers: [PaymentsWebhookController],
  providers: [
    SimulatedPaymentAdapter,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: SimulatedPaymentAdapter,
    },
    PaymentsService,
    WorkerSecretGuard,
  ],
  exports: [PaymentsService, PAYMENT_GATEWAY, WorkerSecretGuard],
})
export class PaymentsModule {}
