import { Module } from '@nestjs/common';

import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { CrmPaymentsController } from './crm-payments.controller';
import { PAYMENT_GATEWAY } from './payment.types';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';
import { WorkerSecretGuard } from './worker-secret.guard';

@Module({
  controllers: [
    PaymentsWebhookController,
    AdminPaymentsController,
    AdminPaymentProvidersController,
    CrmPaymentsController,
  ],
  providers: [
    SimulatedPaymentAdapter,
    PaymentProviderRegistry,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: SimulatedPaymentAdapter,
    },
    PaymentsService,
    WorkerSecretGuard,
  ],
  exports: [
    PaymentsService,
    PAYMENT_GATEWAY,
    WorkerSecretGuard,
    PaymentProviderRegistry,
  ],
})
export class PaymentsModule {}
