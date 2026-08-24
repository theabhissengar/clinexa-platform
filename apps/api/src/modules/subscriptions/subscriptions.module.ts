import { Module } from '@nestjs/common';

import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { CrmSubscriptionsController } from './crm-subscriptions.controller';
import { SubscriptionEditPolicyService } from './subscription-edit-policy.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

/**
 * Subscriptions domain (P14b) + CRM (P14c) + Guardian admin (P14d) HTTP surfaces.
 */
@Module({
  controllers: [
    CrmSubscriptionsController,
    AdminSubscriptionsController,
    AdminSubscriptionPlansController,
  ],
  providers: [
    SubscriptionsLifecycleService,
    SubscriptionsSnapshotService,
    SubscriptionsScheduleService,
    SubscriptionEditPolicyService,
    SubscriptionsRenewalService,
    SubscriptionsService,
    SubscriptionPlansService,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionsLifecycleService,
    SubscriptionsSnapshotService,
    SubscriptionsScheduleService,
    SubscriptionEditPolicyService,
    SubscriptionsRenewalService,
    SubscriptionPlansService,
  ],
})
export class SubscriptionsModule {}
