import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import {
  AdminPaymentMethodsController,
  CrmPaymentMethodsController,
} from './payment-methods.controller';
import { CrmPaymentsController } from './crm-payments.controller';
import { PaymentReconcileJobsController } from './payment-reconcile-jobs.controller';
import { PAYMENT_GATEWAY } from './payment.types';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsService } from './payments.service';
import { PaymentsStripeWebhookController } from './payments-stripe-webhook.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';
import { StripePaymentAdapter } from './stripe-payment.adapter';
import { WorkerSecretGuard } from './worker-secret.guard';

@Module({
  controllers: [
    PaymentsWebhookController,
    PaymentsStripeWebhookController,
    PaymentReconcileJobsController,
    AdminPaymentsController,
    AdminPaymentProvidersController,
    AdminPaymentMethodsController,
    CrmPaymentsController,
    CrmPaymentMethodsController,
  ],
  providers: [
    SimulatedPaymentAdapter,
    {
      provide: StripePaymentAdapter,
      useFactory: (config: ConfigService) => {
        if (config.get<string>('payments.provider') === 'stripe') {
          return new StripePaymentAdapter(config);
        }
        return null;
      },
      inject: [ConfigService],
    },
    PaymentProviderRegistry,
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (
        config: ConfigService,
        simulated: SimulatedPaymentAdapter,
        stripe: StripePaymentAdapter | null,
      ) => {
        if (config.get<string>('payments.provider') === 'stripe') {
          if (!stripe) {
            throw new Error('StripePaymentAdapter failed to initialize');
          }
          return stripe;
        }
        return simulated;
      },
      inject: [ConfigService, SimulatedPaymentAdapter, StripePaymentAdapter],
    },
    PaymentsService,
    WorkerSecretGuard,
  ],
  exports: [
    PaymentsService,
    PAYMENT_GATEWAY,
    WorkerSecretGuard,
    PaymentProviderRegistry,
    StripePaymentAdapter,
  ],
})
export class PaymentsModule {}
