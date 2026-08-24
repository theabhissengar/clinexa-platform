import { Module, forwardRef } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { CrmSubscriptionsController } from './crm-subscriptions.controller';
import { RenewalAddressResolver } from './renewal-address.resolver';
import { SubscriptionEditPolicyService } from './subscription-edit-policy.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionRenewalCronService } from './subscription-renewal-cron.service';
import { SubscriptionRenewalJobsController } from './subscription-renewal-jobs.controller';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

/**
 * Subscriptions domain (P14b) + CRM (P14c) + Guardian (P14d) + P14e renewal processor.
 */
@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => PaymentsModule)],
  controllers: [
    CrmSubscriptionsController,
    AdminSubscriptionsController,
    AdminSubscriptionPlansController,
    SubscriptionRenewalJobsController,
  ],
  providers: [
    SubscriptionsLifecycleService,
    SubscriptionsSnapshotService,
    SubscriptionsScheduleService,
    SubscriptionEditPolicyService,
    SubscriptionsRenewalService,
    SubscriptionsService,
    SubscriptionPlansService,
    RenewalAddressResolver,
    SubscriptionsRenewalProcessor,
    SubscriptionRenewalCronService,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionsLifecycleService,
    SubscriptionsSnapshotService,
    SubscriptionsScheduleService,
    SubscriptionEditPolicyService,
    SubscriptionsRenewalService,
    SubscriptionPlansService,
    RenewalAddressResolver,
    SubscriptionsRenewalProcessor,
  ],
})
export class SubscriptionsModule {}
